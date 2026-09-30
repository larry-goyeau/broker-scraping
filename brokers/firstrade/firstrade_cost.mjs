// What one round trip costs at Firstrade: buy n shares at price p, sell them
// back at once (online, regular hours), in dollars.
//
// The affine triple hid the TAF ceiling. `b` carried 0.000195 $ a share and
// `cap` sat beside it with no column, so a 60 000-share sale was billed the
// uncapped TAF. `roundTrip` is given the size and charges what is charged.
//
// Firstrade Securities Inc. (US). Pricing page and the regulatory-fee help
// article re-read 2026-09-16 — unchanged since the 10th (SEC rate still the
// 6 April 2026 print; help article last touched 30 June 2026). Default is
// the online ticket, not broker-assisted ($19.95). Catalogue 8 298 lines —
// 4 894 ETFs, 3 335 stocks, 61 ETNs, 8 ETCs; 17 of them OTC. Options,
// mutual funds, bonds, CDs and crypto are not this book. The help centre
// says they do not offer cryptocurrency or futures at this time.
//
//   listed / OTC    $0
//   SEC             0.0000206 of the sell (their printed April 2026 rate)
//   FINRA TAF       current 0.000195 $/share on the sell, cap $9.79
//                   (they pass regulator “FEES” / “TRANS FEE”; TAF is not
//                   named — ORF is the only TRANS FEE they print, and that
//                   is options)
//   French FTT      on the ADRs / French names the tax map already has
//                   (they name this tax; they do not name Italian or Spanish)
//
// OTC purchases: limit only, price above $0.10, at least 100 shares if the
// print is $1 or under, no extended hours, no inbound transfer of the
// position. Foreign ordinaries (five-letter ticker ending in F) cannot be
// traded; none are in this catalogue. Cash is USD, so FX stays out of the
// total. Inactivity 0. ACH in and out 0. CAT, venue and NSCC / clearing
// lines are named as possible pass-throughs on the CRS and have no rate,
// so they stay out rather than being borrowed from a neighbour.
//
// What is in the number: $0 commission each way; SEC on the sale; TAF on
// the sale, capped; French FTT from the tax map; the market spread, once.
//
// What stays in the remark: the OTC constraints, and on an ADR the
// printed $0.01–$0.05 / share custody pass-through (calendar, not the
// trade). Wires ($25 domestic / foreign), ACAT out ($75 / $55 partial)
// and the $19.95 short-term mutual-fund redemption are the same kind of
// thing and stay out of the total.
//
// No live trip: the coefficients are the printed $0 plus the regulators
// they pass.
//
//   https://www.firstrade.com/trading/pricing
//   https://help.firstrade.info/en/articles/9264069-does-firstrade-assess-regulatory-transaction-fees-to-its-customers
//   https://www.firstrade.com/trading/pricing/special-services
//   https://help.firstrade.info/en/articles/9264120-can-i-trade-otc-listed-penny-stocks-at-firstrade-if-yes-any-trading-restrictions
//
//   node firstrade/firstrade_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node firstrade/firstrade_cost.mjs IAU AMEX USD --shares=1 --price=82
//   node firstrade/firstrade_cost.mjs TTE NYSE USD --shares=10 --price=65
//   node firstrade/firstrade_cost.mjs ADHC OTC USD --shares=100 --price=0.50
//   node firstrade/firstrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("firstrade-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.firstrade.com/trading/pricing",
  regulators:
    "https://help.firstrade.info/en/articles/9264069-does-firstrade-assess-regulatory-transaction-fees-to-its-customers",
  specials: "https://www.firstrade.com/trading/pricing/special-services",
  otcHelp:
    "https://help.firstrade.info/en/articles/9264120-can-i-trade-otc-listed-penny-stocks-at-firstrade-if-yes-any-trading-restrictions",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-10",
  secAsOf: "2026-04-06",
  helpAsOf: "2026-06-30",
  entity: "Firstrade Securities Inc. (US)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const OTC_MIN_PRICE = 0.1;
const OTC_LOT_AT_OR_UNDER = 1;
const OTC_MIN_SHARES = 100;
const ADR_PASS = { low: 0.01, high: 0.05 };
const WIRE = { domestic: 25, foreign: 25, ccy: "USD" };
const ACAT = { full: 75, partial: 55, ccy: "USD" };
const ASSISTED = 19.95;

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isOverTheCounter = (row) => /^(OTC|PINK|GREY)/i.test(String(row?.exchange || ""));
const isAdr = (row) => /\bADRs?\b|american deposit/i.test(String(row?.name || ""));
const isForeignOrdinary = (row) =>
  isOverTheCounter(row) && /^[A-Z]{4}F$/.test(String(row?.ticker || "").toUpperCase());

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf(row, mic) {
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (isOverTheCounter(row) || code === "OTC" || /^(OTC|PINK|GREY)/.test(code)) return "otc";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(code)) return "listed";
  return "listed";
}

function frenchRates(tax) {
  const rates = {};
  for (const [name, rate] of Object.entries(taxRates(tax))) {
    if (/FRENCH/i.test(name)) rates[name] = rate;
  }
  return rates;
}

function remarkOf({ market, adr } = {}) {
  const lines = [];
  if (market === "otc") {
    lines.push(`OTC: limit only, price above $${OTC_MIN_PRICE.toFixed(2)}, ${OTC_MIN_SHARES} shares if $${OTC_LOT_AT_OR_UNDER} or under.`);
  }
  if (adr) lines.push(`ADR pass-through $${ADR_PASS.low}–$${ADR_PASS.high}/share.`);
  return lines.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

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
    .filter((m) => !wantCurrency || String(m.row.currency || "USD").toUpperCase() === wantCurrency);

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
    const market = feeMarketOf(r, book.mic ?? venue?.mic);
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

function refuseOf({ row, market, price, shares }) {
  if (isForeignOrdinary(row)) {
    return `${row.ticker} est une ordinaire étrangère (ticker …F) : Firstrade ne la vend pas`;
  }
  if (market !== "otc") return null;
  const p = Number(price);
  const n = Number(shares);
  if (p > 0 && p <= OTC_MIN_PRICE) {
    return `OTC : achat refusé à ${p} $ (plancher publié au-dessus de ${OTC_MIN_PRICE} $)`;
  }
  if (p > 0 && p <= OTC_LOT_AT_OR_UNDER && n > 0 && n < OTC_MIN_SHARES) {
    return `OTC : ${OTC_MIN_SHARES} parts minimum sous ${OTC_LOT_AT_OR_UNDER} $ (ordre de ${n})`;
  }
  return null;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is the commission alone.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "USD" };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Firstrade n'existe pas encore : lancer `node firstrade/firstrade_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Firstrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Firstrade`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "firstrade",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    otc: isOverTheCounter(m.row),
    adr: isAdr(m.row),
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = frenchRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const refused = refuseOf({ row: m.row, market, price, shares });
  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    onlineBuy: refused ? false : true,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ market, adr: listing.adr }),
    withdraw: { ach: 0, wireDomestic: WIRE.domestic, wireForeign: WIRE.foreign, ccy: "USD" },
  };

  const basis = `barème Firstrade online, palier ${market}, relu le ${SCHEDULE.readOn} : 0 $ par jambe`;

  if (refused) {
    return {
      ...shared,
      basis,
      why: refused,
      confidence: confidenceOf({ market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const brokerFees = 0;
  const secUsd = notionalUsd == null ? null : notionalUsd * SEC_RATE;
  const tafUsd = Math.min(TAF_CAP, TAF_PER_SHARE * n);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, secUsd, tafUsd, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    buy: {
      commission: 0,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: 0,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      tafCapped: TAF_PER_SHARE * n > TAF_CAP,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: 0,
      taxes: finite(taxUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd), 6),
    },
    commission: { each: 0, roundTrip: 0, currency: "USD", eachWay: true, platform: "online" },
    cap: { part: "FINRA TAF", amount: TAF_CAP, per: "exécution" },
    basis,
    confidence: confidenceOf({
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      n,
      tafUsd,
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
  n,
  tafUsd,
}) {
  const said = [];
  said.push(
    `commission Firstrade online, palier ${market}, page lue le ${SCHEDULE.readOn} ` +
      `(inchangée depuis le ${SCHEDULE.previouslyRead}) : 0 $ par sens, assisted ${ASSISTED} $ hors de ce trajet`
  );
  said.push(
    `SEC ${SEC_RATE} du montant à la vente (taux imprimé du ${SCHEDULE.secAsOf}), ` +
      `TAF FINRA ${TAF_PER_SHARE} $ la part (plafond ${TAF_CAP} $)` +
      (tafUsd != null && n != null && TAF_PER_SHARE * n > TAF_CAP
        ? ` — le plafond mord : ${Number(tafUsd.toPrecision(4))} $`
        : "") +
      ` ; ils nomment la SEC et passent « FEES » / « TRANS FEE », sans nommer la TAF ` +
      `(article d'aide du ${SCHEDULE.helpAsOf})`
  );
  if (taxPct) said.push(`FTT française ${(100 * taxPct).toFixed(2)} % à l'achat, depuis taxMap.mjs — la seule FTT qu'ils impriment`);
  if (market === "otc") {
    said.push(
      `OTC : limite seule, prix au-dessus de ${OTC_MIN_PRICE} $, ${OTC_MIN_SHARES} parts si ${OTC_LOT_AT_OR_UNDER} $ ou moins, pas d'extended hours`
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : CAT, frais de place et NSCC / compensation (CRS : « may be charged », sans tarif), ` +
      `garde ADR ${ADR_PASS.low}–${ADR_PASS.high} $ la part au calendrier du dépositaire, ` +
      `virement ${WIRE.domestic} $, ACAT sortant ${ACAT.full} $ (${ACAT.partial} $ en partiel). ` +
      `Compte en dollars, aucune conversion. Inactivité 0. Crypto et futures non offerts. ` +
      `Aucun aller-retour réel dans ce dépôt`
  );
  if (leaf == null && market === "listed") said.push(`pas de feuille 605 pour ${listing.isin}`);
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
          commission: 0,
          assisted: ASSISTED,
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
          otc: { minPrice: OTC_MIN_PRICE, lotAtOrUnder: OTC_LOT_AT_OR_UNDER, minShares: OTC_MIN_SHARES },
          frenchFtt: true,
          italianFtt: false,
          spanishFtt: false,
          cat: null,
          crypto: false,
          inactivity: 0,
          withdraw: { ach: 0, ...WIRE },
          acat: ACAT,
          adrPassThrough: ADR_PASS,
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
      "usage : node firstrade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node firstrade_cost.mjs --schedule\n" +
        "  ex.   node firstrade_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node firstrade_cost.mjs IAU AMEX USD --shares=1 --price=82\n" +
        "        node firstrade_cost.mjs TTE NYSE USD --shares=10 --price=65\n" +
        "        node firstrade_cost.mjs ADHC OTC USD --shares=100 --price=0.50"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Firstrade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
