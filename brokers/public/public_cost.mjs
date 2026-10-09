// What one round trip costs at Public.com: buy n shares at price p, sell
// them back at once, in dollars. Listed shares, ETFs, ETNs and OTC.
// Options, bonds, crypto and the advisory accounts stay out.
//
// Re-read 2026-10-09. The fee schedule was last updated 2026-09-25.
//   https://public.com/disclosures/fee-schedule
//   https://public.com/disclosures/sec-rule-606-and-607-disclosures
//
//   Listed, regular or extended hours    $0
//   OTC                                   $0
//   Wholesale route                       $0
//   Smart order or lit exchanges          $0.003 a share, and not this trip
//   SEC             0.0000206 of the sale. The schedule prints
//                   $0.00002060 per $1,000,000; the digits are the
//                   per-dollar rate the other US files use.
//   TAF             The schedule still prints $0.000166 a share, cap
//                   $8.30. The number uses the current $0.000195 / $9.79.
//   CAT             $0.000009 a share, both ways. Under $0.01 it is $0.
//                   Any other regulatory line rounds to the nearest penny,
//                   and a smaller positive amount is $0.01.
//
// Open to the Public Investing, Inc. sends the order to Apex Clearing.
// A US line takes Apex's Q. Cash is dollars, so the 0.30% on a foreign
// deposit stays out. Inactivity ($3.99 a month under $70 with nothing
// done for six months) is not this trip.
//
//   node brokers/public/public_cost.mjs AAPL US USD --shares=10 --price=230
//   node brokers/public/public_cost.mjs SPY US USD --shares=10 --price=500
//   node brokers/public/public_cost.mjs AABB OTC USD --shares=100 --price=0.5
//   node brokers/public/public_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("public-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://public.com/disclosures/fee-schedule",
  routing: "https://public.com/disclosures/sec-rule-606-and-607-disclosures",
  readOn: "2026-10-09",
  scheduleOn: "2026-09-25",
  entity: "Open to the Public Investing, Inc.",
  rule606: "apex",
};

const SEC = 0.0000206;
const TAF = 0.000195;
const TAF_CAP = 9.79;
const TAF_ON_PAGE = { perShare: 0.000166, cap: 8.3 };
const CAT = 0.000009;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// Nearest penny, and a positive amount under one penny is one penny.
function passed(value) {
  if (!(value > 0)) return 0;
  const nearest = Math.round(value * 100) / 100;
  return nearest < 0.01 ? 0.01 : nearest;
}

// CAT is the exception: under one penny the line is zero.
export function catFee(shares) {
  const raw = shares * CAT;
  if (!(raw >= 0.01)) return 0;
  return Math.round(raw * 100) / 100;
}

export function sellLevies(notional, shares) {
  return {
    sec: passed(notional * SEC),
    taf: passed(Math.min(shares * TAF, TAF_CAP)),
    cat: catFee(shares),
  };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "USD",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Public.com n'existe pas encore : lancer `node brokers/public/public_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Public.com` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Public.com`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "public",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const listed = listing.brokerExchange === "US";
  const quoted = listed
    ? usBookPerShare({ broker: "public", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
    : book.leaf?.perShare ?? null;
  const marketPerShare = perShare ?? quoted;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    remark: "",
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Public.com du ${SCHEDULE.scheduleOn}, relu le ${SCHEDULE.readOn} : 0 $ par sens, route wholesale`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const sell = notionalUsd == null ? null : sellLevies(notionalUsd, n);
  const catBuy = catFee(n);
  const regulators = sell == null ? null : sell.sec + sell.taf + sell.cat + catBuy;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, 0, regulators, taxUsd);
  const confidence = [
    shared.basis,
    listing.brokerExchange === "OTC" ? "barème OTC" : "barème coté",
    "mélange 606 d'Apex Clearing",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(0, 6),
    commission: { each: 0, currency: "USD", eachWay: true },
    regulators: sell && { ...sell, catBuy },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de carnet pour ce ticker"}` }
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
      courtage: finite(0, 6),
      bourse: finite(regulators, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, commission: 0, tafOnPage: TAF_ON_PAGE }, null, 2));
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/public/public_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse) console.log(`  régulateur     : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
