// What one round trip costs at Baraka: buy n shares at price p, sell
// them back at once, in dollars. Stocks and ETFs. Options, gold, bonds
// and the subscription stay out.
//
// Re-read 2026-10-09. Last updated on the page: 3 Aug 2026.
//   https://getbaraka.com/subscription
//
//   US stocks, ETFs   $1 a trade. A share priced at $5 or under adds
//                     $0.002 a share. The same $1 is the extended-hours
//                     fee, so it is not added again. One US trade a month
//                     is free on the standard plan, so the ticket keeps
//                     the $1.
//   ADX               0.15% of the amount, a side.
//   DFM               0.28% of the amount, plus 10 AED. The page calls
//                     the 10 AED a DFM fee, not a Baraka charge. It is
//                     still paid on the trade, so it is the exchange leg.
//   FX                A UAE transfer into the account is 0.75% on the
//                     standard plan. Premium is 0.65% and Premium+ is
//                     0.60%, and a deposit over $50,000 is 0.60%. The
//                     ticket leaves it out. Dollars stay dollars.
//
// An ADR or an OTC line priced at $5 or under is $1 plus $0.03 a share
// on the same page. The catalogue does not mark those lines, so the
// $0.002 share fee is what a listed share pays and the $0.03 is not
// guessed onto every American name.
//
// Baraka Financial Limited files no 606. The terms route an
// execution-only order to DriveWealth LLC, so a US line uses that
// firm's Q. SEC, TAF and CAT are not on the subscription page.
//
//   node brokers/baraka/baraka_cost.mjs AAPL US USD --shares=10 --price=230
//   node brokers/baraka/baraka_cost.mjs AAPL US USD --shares=10 --price=4
//   node brokers/baraka/baraka_cost.mjs DEWA DFM AED --shares=100 --price=2.5
//   node brokers/baraka/baraka_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("baraka-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://getbaraka.com/subscription",
  terms: "https://getbaraka.com/terms",
  readOn: "2026-10-09",
  entity: "Baraka Financial Limited",
  rule606: "drivewealth",
};

const US_FEE = 1;
const US_CHEAP = 5;
const US_PER_SHARE = 0.002;
const ADX_RATE = 0.0015;
const DFM_RATE = 0.0028;
const DFM_FEE = 10;
const US_REMARK = "1 free US trade a month.\nFX 0.75% when cash ≠ USD.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function cents(amount) {
  return Math.round(amount * 100) / 100;
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

// One side, in the listing currency. The US dollar and the dirham both
// stop at the cent.
function side(exchange, notional, shares, price) {
  if (exchange === "ADX") {
    const courtage = cents(notional * ADX_RATE);
    return { courtage, bourse: 0 };
  }
  if (exchange === "DFM") {
    const courtage = cents(notional * DFM_RATE);
    return { courtage, bourse: DFM_FEE };
  }
  const extra = price <= US_CHEAP ? shares * US_PER_SHARE : 0;
  return { courtage: cents(US_FEE + extra), bourse: 0 };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: null,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Baraka n'existe pas encore : lancer `node brokers/baraka/baraka_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Baraka` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Baraka`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const exchange = code(m.row.exchange);
  const american = exchange === "US";
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "baraka",
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
  const quoted = american
    ? usBookPerShare({ broker: "baraka", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
    : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    cashCurrency: american ? "USD" : "AED",
    remark: american ? US_REMARK : "",
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Baraka, relu le ${SCHEDULE.readOn} : 1 $ l'ordre aux US, 0,15 % à l'ADX, 0,28 % + 10 AED à Dubaï`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }
  if (exchange !== "US" && exchange !== "ADX" && exchange !== "DFM") {
    return { ...shared, why: `${exchange || "cette place"} n'a pas de barème Baraka` };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const one = side(exchange, notional, n, p);
  const courtage = dollars((one.courtage + one.courtage), listing.currency);
  const bourse = dollars((one.bourse + one.bourse), listing.currency);
  const ticketUsd = courtage == null || bourse == null ? null : courtage + bourse;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, ticketUsd, taxUsd);
  const confidence = [
    shared.basis,
    listing.type === "ETF" || listing.type === "ETN" || listing.type === "ETC" ? "barème ETF" : "barème action",
    american ? "mélange 606 de DriveWealth" : "place du Golfe, sans 606",
    american
      ? marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(ticketUsd, 6),
    commission: american
      ? { each: US_FEE, perShare: p <= US_CHEAP ? US_PER_SHARE : 0, currency: "USD", eachWay: true }
      : exchange === "ADX"
        ? { each: ADX_RATE, currency: "AED", eachWay: true }
        : { each: DFM_RATE, flat: DFM_FEE, currency: "AED", eachWay: true },
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
      courtage: finite(courtage, 6),
      bourse: finite(bourse, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({
      ...SCHEDULE,
      us: "$1 a trade, plus $0.002 a share at $5 or under",
      adx: "0.15%",
      dfm: "0.28% + 10 AED",
      fx: "0.75% on a UAE transfer",
    }, null, 2));
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/baraka/baraka_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse) console.log(`  bourse         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
