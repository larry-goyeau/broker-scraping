// What one round trip costs at TradeZero: buy n shares at price p, sell them
// back at once (online, regular hours, market), in dollars.
//
// The affine triple hid the odd-lot flats, the $7.95 OTC cap and the TAF
// ceiling. `roundTrip` is given the size and charges what is charged.
//
// Three companies, re-read 2026-09-17. Default is TradeZero International
// (`--plan=tzi`), Nassau, the entity the portal answered in August. America
// (`tza`) made every regular-hours listed order free on 1 May 2026. Europe
// (`tzeu`) still charges for a market click and only waives a resting limit
// of 200 shares or more. The three cards are not the same grid.
//
//   TZA listed, ≥ $1, 7:00–20:00 ET, any order type     $0
//   TZA OTC / under $1                                  $0.005 / share
//     min $0.99, max $7.95, up to 250,000 shares
//   TZI listed marketable, 100+                         $0.005 / share (min $0.49)
//   TZI any order under 100                             $0.49
//   TZI resting limit, 100+, listed ≥ $1                $0 (remark)
//   TZI OTC / under $1                                  $0.005 / share
//     min $0.49, max $7.95
//   TZEU listed marketable, 200+                        $0.005 / share (min $0.99)
//   TZEU any order under 200                            $0.99
//   TZEU resting limit, 200+, listed ≥ $1               $0 (remark)
//   TZEU under $1, 7:00–20:00                           $0.005 / share
//     min $0.99, max $7.95
//
// Premarket 4:00–7:00 and Select Routes are not this trip. TZEU does not
// print an OTC ticket, so OTC stays N/A there.
//
// SEC 0.00206 % of the sale. TAF uses FINRA's current $0.000195 / $9.79
// (TZI's June PDF still prints 0.000166; the August calculator charged the
// current levy). NSCC $0.00015 / $0.03, both legs, ceil to the cent. The
// $0.00005 reporting line (ceil to $0.01) is printed on TZA and TZI only.
// CAT is not named. They do not name a stamp or FTT, so taxMap stays out.
// Cash is USD. TZEU converts on the deposit, not on the ticket.
//
// Tickets already in the number stay out of the remark. ZeroPro, wires,
// ACAT and inactivity stay out.
//
//   https://tradezero.com/en-us/pricing-and-fees
//   https://tradezero.com/documents/ff7bd4c544bc16629eff7593730cc209ccd21206.pdf
//   https://tradezero.com/documents/acc6a2eb3620bc267358379d8eaec77f818c3b64.pdf
//   https://tradezero.com/en-ee/pricing-and-fees
//   https://tradezero.com/documents/124b8d88462438877b9bbeeb7e4b81f38b6c7350.pdf
//
//   node tradezero/tradezero_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node tradezero/tradezero_cost.mjs AQLT CBOE USD --shares=10 --price=31.5 --plan=tza
//   node tradezero/tradezero_cost.mjs IAU AMEX USD --shares=200 --order=repos --plan=tzeu
//   node tradezero/tradezero_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("tradezero-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  tza: "https://tradezero.com/en-us/pricing-and-fees",
  tzaPdf: "https://tradezero.com/documents/ff7bd4c544bc16629eff7593730cc209ccd21206.pdf",
  tzi: "https://tradezero.com/documents/acc6a2eb3620bc267358379d8eaec77f818c3b64.pdf",
  tzeu: "https://tradezero.com/en-ee/pricing-and-fees",
  tzeuPdf: "https://tradezero.com/documents/124b8d88462438877b9bbeeb7e4b81f38b6c7350.pdf",
  readOn: "2026-09-17",
  tzaAsOf: "2026-05-01",
  tziAsOf: "2026-06-16",
  entityCheckedOn: "2026-08-28",
  entities: {
    tza: "TradeZero America, Inc.",
    tzi: "TradeZero International",
    tzeu: "TradeZero Europe B.V.",
  },
};

const PLANS = {
  tza: {
    id: "tza",
    name: "TradeZero America",
    listedAllFree: true,
    freeFrom: null,
    oddLot: 0,
    perShare: 0.005,
    min: 0.99,
    cap: 7.95,
    reporting: 0.00005,
    tafOnPage: 0.000195,
  },
  tzi: {
    id: "tzi",
    name: "TradeZero International",
    listedAllFree: false,
    freeFrom: 100,
    oddLot: 0.49,
    perShare: 0.005,
    min: 0.49,
    cap: 7.95,
    reporting: 0.00005,
    tafOnPage: 0.000166,
  },
  tzeu: {
    id: "tzeu",
    name: "TradeZero Europe",
    listedAllFree: false,
    freeFrom: 200,
    oddLot: 0.99,
    perShare: 0.005,
    min: 0.99,
    cap: 7.95,
    reporting: 0,
    tafOnPage: 0.000195,
  },
};
const DEFAULT_PLAN = "tzi";

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const NSCC_PER_SHARE = 0.00015;
const NSCC_MIN = 0.03;
const CENT = 0.01;
const CAP_TO_SHARES = 250000;

const WIRE = {
  tza: { achIn: 0, achOut: 5, domestic: 50, foreign: 50, acat: 125 },
  tzi: { achIn: 0, achOut: 15, domestic: 15, foreign: 15, acat: 15 },
  tzeu: { achIn: 0, achOut: 0, domestic: 0, foreign: 0, acat: 0 },
};

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX|PACF)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;
const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB|OTCCE|PINX)$/i.test(String(row?.exchange || ""));
const isAdr = (row) => /\b(ADR|GDR|ADS)\b|american deposit/i.test(String(row?.name || ""));
const isPenny = (price) => Number(price) > 0 && Number(price) < 1;

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function resolvePlan(plan) {
  const id = String(plan || DEFAULT_PLAN)
    .trim()
    .toLowerCase()
    .replace(/^tradezero:?/, "");
  if (id === "us" || id === "america" || id === "tza") return PLANS.tza;
  if (id === "eu" || id === "europe" || id === "tzeu") return PLANS.tzeu;
  if (id === "intl" || id === "international" || id === "bahamas" || id === "tzi") return PLANS.tzi;
  return PLANS[id] || PLANS[DEFAULT_PLAN];
}

export function feeMarketOf(row, mic) {
  const raw = code(row?.exchange);
  const m = code(mic);
  if (isOverTheCounter(row) || raw === "OTC" || /^(OTC|PINK|GREY)/.test(raw)) return "otc";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return "listed";
}

function band(raw, min, cap) {
  return Math.min(cap, Math.max(min, raw));
}

export function commissionSide({ market, plan, shares, price, order = "immédiat" }) {
  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) return null;
  const resolved = resolvePlan(plan);
  const otc = market === "otc";
  const penny = isPenny(p);
  if (otc && resolved.id === "tzeu") return null;
  if (resolved.listedAllFree) {
    if (otc || penny) return band(resolved.perShare * n, resolved.min, resolved.cap);
    return 0;
  }
  if (n < resolved.freeFrom) return resolved.oddLot;
  if (otc || penny) return band(resolved.perShare * n, resolved.min, resolved.cap);
  if (order === "repos") return 0;
  return Math.max(resolved.min, resolved.perShare * n);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
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

function remarkOf({ market, listing, plan, penny }) {
  const lines = [];
  if (!plan.listedAllFree && plan.freeFrom) {
    lines.push(`Resting limit of ${plan.freeFrom}+ listed shares above $1 is $0 broker fees.`);
  }
  if (market === "otc") lines.push(`OTC is $0.005 a share, min $${plan.min}, max $${plan.cap}, regular hours only.`);
  else if (penny) lines.push(`Under $1 is $0.005 a share, min $${plan.min}, max $${plan.cap}.`);
  if (plan.id === "tza" && isAdr(listing)) lines.push("ADR fees are a pass-through.");
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is TradeZero's
 * commission, twice.
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
  order = "immédiat",
}) {
  const resolved = resolvePlan(plan);
  const intent = String(order || "immédiat").toLowerCase() === "repos" ? "repos" : "immédiat";
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: resolved.id,
    order: intent,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue TradeZero n'existe pas encore : lancer `node tradezero/tradezero_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue TradeZero` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez TradeZero`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "tradezero",
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
  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const penny = isPenny(p);
  const ticket = commissionSide({ market, plan: resolved.id, shares: n, price: p, order: intent });

  if (market === "otc" && resolved.id === "tzeu") {
    return {
      ...answer,
      listing,
      feeMarket: market,
      cashCurrency: "USD",
      remark: "",
      why: "TradeZero Europe n'imprime pas de ticket OTC",
    };
  }

  const leaf = book.leaf;
  const takes = intent !== "repos";
  const marketBp = takes ? bp ?? leaf?.bp ?? null : null;
  const marketPerShare = takes ? perShare ?? leaf?.perShare ?? null : null;
  const wire = WIRE[resolved.id];

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: "USD",
    remark: remarkOf({ market, listing, plan: resolved, penny }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (resolved.id === "tza" ? SCHEDULE.tza : resolved.id === "tzeu" ? SCHEDULE.tzeu : SCHEDULE.tzi),
    basis: `barème ${resolved.name}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    commission: {
      each: ticket,
      currency: "USD",
      eachWay: true,
      platform: "online",
      hours: "regular",
      order: intent === "repos" ? "limit" : "market",
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    withdraw: { ach: wire.achOut, wireDomestic: wire.domestic, wireForeign: wire.foreign, ccy: "USD" },
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
        plan: resolved,
        intent,
      }),
    };
  }

  const notionalUsd = toUsd(notional, listing.currency);
  const commissionUsd = ticket * 2;
  const bookUsd = !takes
    ? 0
    : marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const secUsd = notionalUsd == null ? null : notionalUsd * SEC_RATE;
  const tafUsd = up(Math.min(n * TAF_PER_SHARE, TAF_CAP));
  const nsccUsd = plus(up(Math.max(n * NSCC_PER_SHARE, NSCC_MIN)), up(Math.max(n * NSCC_PER_SHARE, NSCC_MIN)));
  const reportingUsd = resolved.reporting
    ? plus(up(n * resolved.reporting), up(n * resolved.reporting))
    : 0;
  const usd = plus(bookUsd, commissionUsd, secUsd, tafUsd, nsccUsd, reportingUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    ...(takes && bookUsd == null
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
      réglementaire: finite(plus(secUsd, tafUsd, nsccUsd, reportingUsd), 6),
    },
    sell: {
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      tafCapped: n * TAF_PER_SHARE >= TAF_CAP,
      nscc: finite(nsccUsd, 6),
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
      intent,
      n,
      ticket,
      penny,
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
  intent,
  n,
  ticket,
  penny,
  tafCapped,
}) {
  const said = [];
  if (plan.listedAllFree) {
    said.push(
      `commission ${plan.name}, carte lue le ${SCHEDULE.readOn} (a/o ${SCHEDULE.tzaAsOf}) : ` +
        `NMS ≥ 1 $ 7h–20h 0 $ tout type d'ordre ; OTC / sous 1 $ ${plan.perShare} $/part, ` +
        `plancher ${plan.min} $, plafond ${plan.cap} $`
    );
  } else {
    said.push(
      `commission ${plan.name}, carte lue le ${SCHEDULE.readOn}` +
        (plan.id === "tzi" ? ` (a/o ${SCHEDULE.tziAsOf})` : "") +
        ` : moins de ${plan.freeFrom} parts ${plan.oddLot} $ ; ` +
        `marché ${plan.freeFrom}+ ${plan.perShare} $/part plancher ${plan.min} $ ; ` +
        `limite au repos ${plan.freeFrom}+ listé ≥ 1 $ 0 $`
    );
  }
  if (ticket != null) said.push(`ticket ${Number(ticket.toPrecision(4))} $ par sens (${intent})`);
  said.push(
    `SEC ${SEC_RATE} du montant à la vente, TAF ${TAF_PER_SHARE} $/part plafonnée à ${TAF_CAP} $` +
      (plan.tafOnPage !== TAF_PER_SHARE ? ` (le PDF TZI imprime encore ${plan.tafOnPage})` : "") +
      (tafCapped ? `, le plafond mord` : "") +
      `, NSCC ${NSCC_PER_SHARE} $/part minimum ${NSCC_MIN} $ les deux jambes` +
      (plan.reporting
        ? `, déclaration ${plan.reporting} $/part arrondie au centime, les deux jambes`
        : `, déclaration non nommée chez ${plan.name}`) +
      ` ; CAT et FTT non nommés, laissés dehors`
  );
  if (intent === "repos") said.push(`ordre au repos : aucun spread dans le chiffre`);
  else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf && intent !== "repos") said.push(`carnet absent pour cette ligne`);
  if (listing.mic === "ARCX" || listing.mic === "BATS") {
    said.push(
      `place lue sous le parapluie NYSE/AMEX/NASDAQ : cette ligne cote sur ${
        listing.mic === "ARCX" ? "NYSE Arca" : "Cboe BZX"
      }`
    );
  }
  const wire = WIRE[plan.id];
  said.push(
    `hors trajet : premarket 4h–7h, Select Routes, ZeroPro 59 $/mois, ` +
      `virement ${wire.domestic} $, ACAT ${wire.acat} $. ` +
      `Compte en dollars, pas de change sur le ticket. ` +
      (plan.id === "tzi"
        ? `TZI mesuré le ${SCHEDULE.entityCheckedOn} (IAU × 4, 0,98 $ de commission). `
        : "") +
      `Aucun aller-retour réel depuis cette relecture`
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
          sec: SEC_RATE,
          taf: { used: { perShare: TAF_PER_SHARE, cap: TAF_CAP }, tziOnPage: PLANS.tzi.tafOnPage },
          nscc: { perShare: NSCC_PER_SHARE, min: NSCC_MIN },
          reporting: { tza: PLANS.tza.reporting, tzi: PLANS.tzi.reporting, tzeu: 0 },
          cat: 0,
          cash: "USD",
          withdraw: WIRE,
          capToShares: CAP_TO_SHARES,
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
      "usage : node tradezero/tradezero_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=tza|tzi|tzeu] [--order=immédiat|repos]\n" +
        "        node tradezero/tradezero_cost.mjs --schedule\n" +
        "  ex.   node tradezero/tradezero_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node tradezero/tradezero_cost.mjs AQLT CBOE USD --shares=10 --price=31.5 --plan=tza"
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
    order: flag("order") || "immédiat",
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que TradeZero propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
