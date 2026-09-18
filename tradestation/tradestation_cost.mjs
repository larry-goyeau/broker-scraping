// What one round trip costs at TradeStation: buy n shares at price p, sell
// them back at once (online, regular hours, intelligent routing), in dollars.
//
// The affine triple hid the $1 OTC floor and the 5 % notional cap. `roundTrip`
// is given the size and charges what is charged.
//
// TradeStation Securities, Inc. (US). Pricing page and the stocks/ETF
// disclosures re-read 2026-09-17. Listed NMS at or above $1 is $0 commission
// plus a clearing fee by monthly share tier. A quiet book is Tier 1
// (clearing $0.003). Tier 4 (clearing $0) is listed NMS volume above
// 10,000,000 shares in a calendar month: crossing it upgrades you for
// the rest of that month and the next. OTC, sub-dollar and
// direct-routed fills do not count toward that volume.
// Direct routing (+$0.005, or the $0.0032–$0.0048 table) is not this
// trip. TS GO / TS SELECT are legacy and are not offered to new
// customers, so they are not plans here.
//
//   listed NMS, ≥ $1, intelligent routing     $0 + clearing by tier
//     Tier 4  (>10,000,000 shares / month)    $0
//     Tier 3  (1,000,001–10,000,000)          $0.001 / share
//     Tier 2  (100,001–1,000,000)             $0.002 / share
//     Tier 1  (0–100,000)                     $0.003 / share
//   listed under $1, and every OTC fill       $0.005 / share
//     min $1, max $50, both capped at 5 % of notional
//   outside the US (stocks product page)      $5 a side on listed NMS
//
// SEC 0.00206 % of the sale, TAF $0.000195 / $9.79, CAT $0.000003 / share
// (OTC share = 0.01 equivalent) with a $0.01 minimum per fill — all three
// printed on the disclosures page. Stamp / FTT from taxMap by ISIN. Cash
// is USD and the catalogue is USD, so FX stays out.
//
// Tickets already in the number stay out of the remark. Wires, ACAT,
// inactivity ($10 / month, waived with activity), RadarScreen ($99.99) and
// broker-assist ($25) stay out. No crypto in this book.
//
//   https://www.tradestation.com/pricing/
//   https://www.tradestation.com/stocks-etfs-pricing-disclosures/
//   https://www.tradestation.com/trading-products/stocks/
//
//   node tradestation/tradestation_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node tradestation/tradestation_cost.mjs AQLT CBOE USD --shares=10 --price=31.5
//   node tradestation/tradestation_cost.mjs --plan=tier4 AAPL NASDAQ USD --shares=10 --price=230
//   node tradestation/tradestation_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("tradestation-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.tradestation.com/pricing/",
  disclosures: "https://www.tradestation.com/stocks-etfs-pricing-disclosures/",
  stocks: "https://www.tradestation.com/trading-products/stocks/",
  readOn: "2026-09-17",
  entity: "TradeStation Securities, Inc. (US)",
};

const PLANS = {
  tier1: { id: "tier1", name: "TradeStation (Tier 1)", clearing: 0.003, ticket: 0 },
  tier4: { id: "tier4", name: "TradeStation (Tier 4)", clearing: 0, ticket: 0 },
  intl: { id: "intl", name: "TradeStation (outside the US)", clearing: 0, ticket: 5 },
};
const DEFAULT_PLAN = "tier1";

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CAT_PER_SHARE = 0.000003;
const CAT_MIN = 0.01;
const PENNY = 1;
const OTC_PER_SHARE = 0.005;
const OTC_MIN = 1;
const OTC_MAX = 50;
const OTC_NOTIONAL_CAP = 0.05;
const DIRECT = 0.005;
const ASSISTED = 25;
const INACTIVITY = { each: 10, period: "month" };
const PLATFORM = 99.99;
const WIRE = { domestic: 25, foreign: 45, ccy: "USD" };
const ACAT = { out: 125, ccy: "USD" };

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB|OTCCE|PINX)$/i.test(String(row?.exchange || ""));
const isAdr = (row) => /\b(ADR|GDR|ADS)\b|american deposit/i.test(String(row?.name || ""));
const isPenny = (price) => Number(price) > 0 && Number(price) < PENNY;

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function resolvePlan(plan) {
  const id = String(plan || DEFAULT_PLAN)
    .trim()
    .toLowerCase()
    .replace(/^tradestation:?/, "");
  if (id === "us" || id === "standard" || id === "1") return PLANS.tier1;
  if (id === "promo" || id === "4") return PLANS.tier4;
  if (id === "international" || id === "outside") return PLANS.intl;
  return PLANS[id] || PLANS[DEFAULT_PLAN];
}

export function feeMarketOf(row, mic) {
  const raw = code(row?.exchange);
  const m = code(mic);
  if (isOverTheCounter(row) || raw === "OTC" || /^(OTC|PINK|GREY)/.test(raw)) return "otc";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return "listed";
}

export function otcTicket(shares, notional) {
  const n = Number(shares);
  const amt = Number(notional);
  if (!(n > 0) || !(amt > 0)) return null;
  const raw = OTC_PER_SHARE * n;
  const band = Math.min(OTC_MAX, Math.max(OTC_MIN, raw));
  return Math.min(band, OTC_NOTIONAL_CAP * amt);
}

export function commissionSide({ market, plan, shares, price, notional }) {
  const n = Number(shares);
  const p = Number(price);
  const amt = Number(notional);
  if (!(n > 0) || !(p > 0) || !(amt > 0)) return null;
  const resolved = resolvePlan(plan);
  if (market === "otc" || isPenny(p)) return otcTicket(n, amt);
  if (resolved.ticket) return resolved.ticket;
  return n * resolved.clearing;
}

function catFee(shares, market) {
  const n = Number(shares);
  if (!(n > 0)) return null;
  const equiv = market === "otc" ? n * 0.01 : n;
  return Math.max(CAT_MIN, CAT_PER_SHARE * equiv);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rows.filter(
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
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0, adr: 0, byMarket: {} });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (isAdr(r)) slot.adr += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf({ market, listing, plan }) {
  const lines = [];
  if (plan?.id === "tier4") {
    lines.push(
      "If more than 10,000,000 listed NMS shares in a calendar month. Crossing it upgrades you for the rest of that month and the next."
    );
  }
  if (market === "otc") lines.push("OTC and stocks under $1 are off the volume tiers.");
  if (isAdr(listing)) lines.push("They pass financial-transaction taxes on depositary receipts.");
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is TradeStation's
 * ticket / clearing, twice.
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
      why: "le catalogue TradeStation n'existe pas encore : lancer `node tradestation/tradestation_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue TradeStation` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez TradeStation`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "tradestation",
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
    adr: isAdr(m.row),
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const penny = isPenny(p);
  const ticket = commissionSide({ market, plan: resolved.id, shares: n, price: p, notional });

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: "USD",
    remark: remarkOf({ market, listing, plan: resolved }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème ${resolved.name}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
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

  if (notional == null || ticket == null) {
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
        taxPct,
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
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = notionalUsd == null ? null : notionalUsd * SEC_RATE;
  const tafRaw = Math.min(n * TAF_PER_SHARE, TAF_CAP);
  const tafUsd = tafRaw;
  const catUsd = plus(catFee(n, market), catFee(n, market));
  const usd = plus(bookUsd, commissionUsd, taxUsd, secUsd, tafUsd, catUsd);

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
      réglementaire: finite(plus(secUsd, tafUsd, catUsd), 6),
      taxes: finite(taxUsd, 6),
    },
    sell: {
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      tafCapped: n * TAF_PER_SHARE >= TAF_CAP,
      cat: finite(catUsd, 6),
    },
    confidence: confidenceOf({
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      plan: resolved,
      n,
      p,
      notional,
      ticket,
      penny,
      tafUsd,
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
  taxPct,
  plan,
  n,
  ticket,
  penny,
  tafCapped,
}) {
  const said = [];
  said.push(
    `commission ${plan.name}, page lue le ${SCHEDULE.readOn} : ` +
      `NMS ≥ 1 $ intelligent routing 0 $ + compensation ${plan.clearing} $/part` +
      (plan.ticket ? `, ticket hors US ${plan.ticket} $` : "")
  );
  if (ticket != null) said.push(`ticket ${Number(ticket.toPrecision(4))} $ par sens`);
  if (market === "otc" || penny) {
    said.push(
      `sous 1 $ ou OTC : ${OTC_PER_SHARE} $/part, plancher ${OTC_MIN} $, plafond ${OTC_MAX} $, ` +
        `le tout plafonné à ${100 * OTC_NOTIONAL_CAP} % du notionnel — hors paliers de volume`
    );
  }
  said.push(
    `SEC ${SEC_RATE} du montant à la vente, TAF ${TAF_PER_SHARE} $/part plafonnée à ${TAF_CAP} $` +
      (tafCapped ? `, le plafond mord` : "") +
      `, CAT ${CAT_PER_SHARE} $/part (OTC × 0,01) minimum ${CAT_MIN} $ par exécution`
  );
  if (taxPct) said.push(`taxe de transfert ${(100 * taxPct).toFixed(2)} % prise dans taxMap.mjs`);
  if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf) said.push(`carnet absent pour cette ligne`);
  said.push(
    `hors trajet : routage direct +${DIRECT} $/part, assisted +${ASSISTED} $, ` +
      `RadarScreen ${PLATFORM} $/mois, inactivité ${INACTIVITY.each} $ / mois, ` +
      `virement ${WIRE.domestic} $ / ${WIRE.foreign} $, ACAT sortant ${ACAT.out} $. ` +
      `Compte en dollars, pas de change. TS GO / TS SELECT hors nouveaux comptes. ` +
      `Aucun aller-retour réel dans ce dépôt`
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
          listed: { commission: 0, clearing: { tier4: 0, tier3: 0.001, tier2: 0.002, tier1: 0.003 } },
          otc: { perShare: OTC_PER_SHARE, min: OTC_MIN, max: OTC_MAX, notionalCap: OTC_NOTIONAL_CAP },
          intl: 5,
          direct: DIRECT,
          assisted: ASSISTED,
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
          cat: { perShare: CAT_PER_SHARE, min: CAT_MIN },
          cash: "USD",
          inactivity: INACTIVITY,
          platform: PLATFORM,
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
      "usage : node tradestation/tradestation_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=tier1|tier4|intl]\n" +
        "        node tradestation/tradestation_cost.mjs --schedule\n" +
        "  ex.   node tradestation/tradestation_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node tradestation/tradestation_cost.mjs AQLT CBOE USD --shares=10 --price=31.5 --plan=tier4"
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
      console.log(`\nce que TradeStation propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
