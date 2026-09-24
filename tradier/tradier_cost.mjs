// What one round trip costs at Tradier: buy n shares at price p, sell them
// back at once (online, regular hours, market), in dollars.
//
// The affine triple hid the $0.35 Lite ticket and the reporting penny.
// `roundTrip` is given the size and charges what is charged.
//
// Tradier Brokerage, Inc. (US, CRD 104982). Pricing page re-read 2026-09-17.
// Three subscriptions. Stocks and ETFs share one ticket. Default is Lite
// (`--plan=lite`), $0 a month and $0.35 a fill. Pro ($10 / month) and Pro
// Plus ($35 / month) print $0 on stocks; they only differ on index options,
// which are not this book. The two-month Pro trial ($500 deposit in 30 days)
// is the same $0 ticket and stays in the remark. Futures are Tradier Futures
// Inc. and are not this book. Options are not this catalogue.
//
//   Lite                                                  $0.35 a fill
//   Pro / Pro Plus                                        $0
//   OTC-BB / Pink opening orders                          refused
//
// SEC 0.00206 % of the sale — their print. TAF they still print at
// $0.000166 / $8.30; the number uses the current $0.000195 / $9.79 the
// other US files use. Reporting & processing $0.000054 / equivalent share
// (they name CAT inside that line), ceil to the cent, both legs. Equity
// clearing is not printed — the $0.0775 line is per option contract.
// Stamp / FTT stay out: they do not name them. Cash is USD and the
// catalogue is USD, so FX stays out.
//
// Tickets already in the number stay out of the remark. The $10 / $35
// month, wires, ACAT, inactivity ($50 / year under two trades) and the
// $10 assisted ticket stay out.
//
//   https://tradier.com/pricing
//
//   node tradier/tradier_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node tradier/tradier_cost.mjs AQLT CBOE USD --shares=10 --price=31.5 --plan=pro
//   node tradier/tradier_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("tradier-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://tradier.com/pricing",
  readOn: "2026-09-17",
  entity: "Tradier Brokerage, Inc. (US)",
  crd: "104982",
};

const PLANS = {
  lite: { id: "lite", name: "Tradier Lite", ticket: 0.35, month: 0 },
  pro: { id: "pro", name: "Tradier Pro", ticket: 0, month: 10 },
  proplus: { id: "proplus", name: "Tradier Pro Plus", ticket: 0, month: 35 },
};
const DEFAULT_PLAN = "lite";

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_ON_PAGE = { perShare: 0.000166, cap: 8.3 };
const REPORTING = 0.000054;
const CENT = 0.01;
const WIRE = { domestic: 30, foreign: 45, ccy: "USD" };
const ACAT = { out: 75, ccy: "USD" };
const INACTIVITY = { each: 50, period: "year", tradesWaive: 2 };
const ASSISTED = 10;
const IRA = 30;

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;
const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB|OTCCE|PINX)$/i.test(String(row?.exchange || ""));

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function resolvePlan(plan) {
  const id = String(plan || DEFAULT_PLAN)
    .trim()
    .toLowerCase()
    .replace(/^tradier:?/, "");
  if (id === "free" || id === "0") return PLANS.lite;
  if (id === "plus" || id === "pro-plus" || id === "pro_plus") return PLANS.proplus;
  return PLANS[id] || PLANS[DEFAULT_PLAN];
}

export function feeMarketOf(row, mic) {
  const raw = code(row?.exchange);
  const m = code(mic);
  if (isOverTheCounter(row) || raw === "OTC" || /^(OTC|PINK|GREY)/.test(raw)) return "otc";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return "listed";
}

export function commissionSide({ plan }) {
  return resolvePlan(plan).ticket;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, 
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency || "USD") === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0, byMarket: {} });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf({ plan }) {
  if (plan.id === "pro") return "If you pay $10 a month.";
  if (plan.id === "proplus") return "If you pay $35 a month.";
  return "";
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is Tradier's
 * ticket, twice.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const resolved = resolvePlan(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: resolved.id,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Tradier n'existe pas encore : lancer `node tradier/tradier_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Tradier` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Tradier`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "tradier",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || "USD",
    brokerExchange: m.row.exchange || null,
    otc: isOverTheCounter(m.row),
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const ticket = commissionSide({ plan: resolved.id });

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: "USD",
    remark: remarkOf({ plan: resolved }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème ${resolved.name}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    commission: {
      each: ticket,
      currency: "USD",
      eachWay: true,
      platform: "online",
      hours: "regular",
      order: "market",
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    withdraw: { ach: 0, wireDomestic: WIRE.domestic, wireForeign: WIRE.foreign, ccy: "USD" },
  };

  if (market === "otc") {
    return {
      ...shared,
      onlineBuy: false,
      why: "Tradier n'accepte pas d'ouverture sur l'OTC-BB et le Pink",
      confidence: confidenceOf({
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        plan: resolved,
      }),
    };
  }

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;

  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        plan: resolved,
      }),
    };
  }

  const notionalUsd = toUsd(notional, listing.currency);
  const commissionUsd = ticket * 2;
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const secUsd = notionalUsd == null ? null : up(notionalUsd * SEC_RATE);
  const tafUsd = up(Math.min(n * TAF_PER_SHARE, TAF_CAP));
  const reportingUsd = plus(up(n * REPORTING), up(n * REPORTING));
  const usd = plus(bookUsd, commissionUsd, secUsd, tafUsd, reportingUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd, reportingUsd), 6),
    },
    sell: {
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      tafCapped: n * TAF_PER_SHARE >= TAF_CAP,
      reporting: finite(reportingUsd, 6),
    },
    confidence: confidenceOf({
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      plan: resolved,
      n,
      ticket,
      tafCapped: n * TAF_PER_SHARE >= TAF_CAP,
    }),
  };
}

function confidenceOf({
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  plan,
  ticket,
  tafCapped,
}) {
  const said = [];
  said.push(
    `commission ${plan.name}, page lue le ${SCHEDULE.readOn} : ${plan.ticket} $ par exécution` +
      (plan.month ? `, abonnement ${plan.month} $/mois hors trajet` : ", sans abonnement")
  );
  if (ticket != null) said.push(`ticket ${Number(ticket.toPrecision(4))} $ par sens`);
  said.push(
    `SEC ${SEC_RATE} du montant à la vente, TAF ${TAF_PER_SHARE} $/part plafonnée à ${TAF_CAP} $` +
      ` (la page imprime encore ${TAF_ON_PAGE.perShare} $ / ${TAF_ON_PAGE.cap} $)` +
      (tafCapped ? `, le plafond mord` : "") +
      `, déclaration ${REPORTING} $/part équivalente arrondie au centime, les deux jambes` +
      ` ; FTT non nommée, laissée dehors ; compensation actions non imprimée`
  );
  if (market === "otc") said.push(`OTC-BB / Pink : pas d'ordre d'ouverture`);
  if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf && market !== "otc") said.push(`carnet absent pour cette ligne`);
  said.push(
    `hors trajet : Pro ${PLANS.pro.month} $/mois, Pro Plus ${PLANS.proplus.month} $/mois, ` +
      `assisted +${ASSISTED} $ + ticket, IRA Lite ${IRA} $/an, ` +
      `inactivité ${INACTIVITY.each} $ / an sous ${INACTIVITY.tradesWaive} trades, ` +
      `virement ${WIRE.domestic} $ / ${WIRE.foreign} $, ACAT sortant ${ACAT.out} $. ` +
      `Compte en dollars, pas de change. Aucun aller-retour réel dans ce dépôt`
  );
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          plans: PLANS,
          listed: { lite: 0.35, pro: 0, proplus: 0 },
          otc: "opening refused",
          sec: SEC_RATE,
          taf: { used: { perShare: TAF_PER_SHARE, cap: TAF_CAP }, onPage: TAF_ON_PAGE },
          reporting: REPORTING,
          cat: "inside reporting",
          cash: "USD",
          inactivity: INACTIVITY,
          withdraw: { ach: 0, ...WIRE },
          acat: ACAT,
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node tradier/tradier_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=lite|pro|proplus]\n" +
        "        node tradier/tradier_cost.mjs --schedule\n" +
        "  ex.   node tradier/tradier_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node tradier/tradier_cost.mjs AQLT CBOE USD --shares=10 --price=31.5 --plan=pro"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Tradier propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
