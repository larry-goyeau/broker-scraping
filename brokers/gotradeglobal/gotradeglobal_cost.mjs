// What one round trip costs at Gotrade Global: buy n shares at price p,
// sell them back at once, in dollars. Stocks and ETFs. Options, rights
// and transfers stay out.
//
// Re-read 2026-10-09.
//   https://www.heygotrade.com/en/fee/
//   https://www.heygotrade.com/legal/gotrade-fees.pdf
//
//   Trading fee     0.15% to 0.30% of the amount, minimum $0.10 a side.
//                   The page says the country rate is in the app, so the
//                   ticket uses the top of that band.
//   SEC             $0.0000206 of the amount, sell only.
//   TAF             $0.000195 a share, sell only.
//   CAT             $0.000003 a share. The page does not mark it sell-only,
//                   so it is charged both ways.
//   FX              0.3% to 1% by country. Not one rate, so it stays in
//                   the remark.
//
// Gotrade Securities Inc. files no 606. The fee page names Alpaca
// Securities LLC, so a US line uses that firm's Q.
//
//   node brokers/gotradeglobal/gotradeglobal_cost.mjs AAPL US USD --shares=10 --price=230
//   node brokers/gotradeglobal/gotradeglobal_cost.mjs --schedule
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

const CATALOGUE = new URL("gotradeglobal-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.heygotrade.com/en/fee/",
  pdf: "https://www.heygotrade.com/legal/gotrade-fees.pdf",
  readOn: "2026-10-09",
  entity: "Gotrade Global",
  rule606: "alpaca",
};

const FEE = 0.003;
const FEE_MIN = 0.1;
const SEC = 0.0000206;
const TAF = 0.000195;
const CAT = 0.000003;
const REMARK = "Some clients' nationalities can have a -0.15% reduction.\nFX 0.3% to 1% when cash ≠ USD.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

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

function side(notional, shares, sell) {
  const trading = Math.max(notional * FEE, FEE_MIN);
  const cat = shares * CAT;
  if (!sell) return trading + cat;
  return trading + cat + notional * SEC + shares * TAF;
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
    cashCurrency: "USD",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Gotrade Global n'existe pas encore : lancer `node brokers/gotradeglobal/gotradeglobal_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Gotrade Global` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Gotrade Global`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "gotradeglobal",
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
  const quoted = usBookPerShare({ broker: "gotradeglobal", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  const marketBp = bp ?? null;
  const marketPerShare = perShare ?? quoted;
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
    remark: REMARK,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Gotrade Global, relu le ${SCHEDULE.readOn} : 0,30 % min 0,10 $ par sens, haut de la fourchette`,
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
  const ticketUsd = side(notional, n, false) + side(notional, n, true);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, ticketUsd, taxUsd);
  const confidence = [
    shared.basis,
    listing.type === "ETF" || listing.type === "ETN" || listing.type === "ETC" ? "barème ETF" : "barème action",
    "mélange 606 d'Alpaca Securities",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(ticketUsd, 6),
    commission: { each: FEE, minimum: FEE_MIN, currency: "USD", eachWay: true },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de 605 pour ce ticker"}` }
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
      courtage: finite(Math.max(notional * FEE, FEE_MIN) * 2, 6),
      bourse: finite(ticketUsd - Math.max(notional * FEE, FEE_MIN) * 2, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, fee: "0.30% min 0.10 USD", sec: SEC, taf: TAF, cat: CAT }, null, 2));
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/gotradeglobal/gotradeglobal_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
