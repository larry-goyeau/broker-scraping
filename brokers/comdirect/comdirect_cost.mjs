// What one round trip costs at comdirect: buy n shares at price p, sell
// them back at once, in dollars. The standard online depot, not Pure Depot
// and not a promotional flat fee.
//
// Re-read 2026-10-13 from the price list valid from 15 July 2026:
//   https://www.comdirect.de/wertpapierhandel/konditionen.html
//
//   Inland, each way     4.90 € + 0.25 %, floor 9.90 €, cap 59.90 €
//   Abroad, each way     7.90 € + 0.25 %, floor 12.90 €, cap 62.90 €
//   Xetra, Tradegate, gettex, LS Exchange, Quotrix, Stuttgart
//                        0.0025 % of the value, floor 2.50 €
//   Frankfurt floor, Düsseldorf, Hamburg, Hannover, Munich
//                        0.005 %, floor 5 €
//   LiveTrading          no venue fee, inland commission
//
// The venue fee sits on top of the commission cap. A buy and a sell are
// two orders. A foreign place has no published exchange fee, so that line
// stays unknown: the commission alone is not the bill.
//
//   node brokers/comdirect/comdirect_cost.mjs DE000A1EWWW0 Xetra EUR --shares=10 --price=150
//   node brokers/comdirect/comdirect_cost.mjs DE000A1EWWW0 "Börse Frankfurt" EUR --shares=10 --price=150
//   node brokers/comdirect/comdirect_cost.mjs US0378331005 Nasdaq USD --shares=10 --price=230

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("comdirect-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.comdirect.de/wertpapierhandel/konditionen.html",
  readOn: "2026-10-13",
  entity: "comdirect",
};

const INLAND = { base: 4.9, rate: 0.0025, min: 9.9, max: 59.9 };
const ABROAD = { base: 7.9, rate: 0.0025, min: 12.9, max: 62.9 };
const CHEAP = { rate: 0.000025, min: 2.5 };
const REGIONAL = { rate: 0.00005, min: 5 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};

function eurOf(amount, currency) {
  const ccy = code(currency);
  if (!(amount >= 0) || !ccy) return null;
  if (ccy === "EUR") return amount;
  const usd = toUsd(amount, ccy);
  const per = usdPer("EUR");
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

const LIVE = new Set(["LANGSCHWARZINTERNATIONAL", "LTSOCIETEGENERALE", "LTBAADERTRADING"]);
const CHEAP_PLACES = new Set(["XETRA", "TRADEGATE", "GETTEX", "LSEXCHANGE", "QUOTRIX", "BORSESTUTTGART", "STUTTGART"]);
const REGIONAL_PLACES = new Set([
  "BORSEFRANKFURT",
  "FRANKFURT",
  "FRA",
  "BORSEDUSSELDORF",
  "DUSSELDORF",
  "BORSEHAMBURG",
  "HAMBURG",
  "BORSEHANNOVER",
  "HANNOVER",
  "MUNICH",
  "MUNCHEN",
  "BORSEBERLIN",
  "BERLIN",
]);
const FOREIGN = new Set([
  "NASDAQ",
  "NEWYORKSTOCKEXCHANGE",
  "NYSE",
  "NYSEAMERICAN",
  "NYSEARCA",
  "OTCMARKETS",
  "FINRAOTCBULLETINBOARD",
  "LONDONSTOCKEXCHANGE",
  "SIXSWISSEXCHANGE",
  "EURONEXTPARIS",
  "EURONEXTAMSTERDAM",
  "EURONEXTMILAN",
  "EURONEXTATHENS",
  "WIENERBORSE",
  "NASDAQSTOCKHOLM",
  "FIRSTNORTHSTOCKHOLM",
  "EURONEXTOSLO",
  "EURONEXTGROWTHOSLO",
  "TORONTOSTOCKEXCHANGE",
  "TSXVENTURE",
  "AUSTRALIANSECURITIESEXCHANGE",
  "BMECONTINUOUSMARKET",
  "TOKYO",
]);

export function scheduleOf(exchange) {
  const e = loose(exchange);
  if (LIVE.has(e)) return "live";
  if (CHEAP_PLACES.has(e)) return "cheap";
  if (REGIONAL_PLACES.has(e)) return "regional";
  if (FOREIGN.has(e)) return "foreign";
  return null;
}

export function commissionEur(notionalEur, foreign) {
  const plan = foreign ? ABROAD : INLAND;
  return Math.min(plan.max, Math.max(plan.min, plan.base + plan.rate * notionalEur));
}

export function venueEur(notionalEur, kind) {
  if (kind === "live" || kind === "foreign") return 0;
  const plan = kind === "cheap" ? CHEAP : kind === "regional" ? REGIONAL : null;
  if (!plan || !(notionalEur >= 0)) return null;
  return Math.max(plan.min, plan.rate * notionalEur);
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
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "the comdirect catalogue is missing: run `node brokers/comdirect/comdirect_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the comdirect catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at comdirect`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "comdirect",
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
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  let marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const american = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(listing.mic) && listing.currency === "USD";
  if (american && bp == null && perShare == null && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "comdirect", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null && american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const kind = scheduleOf(listing.brokerExchange);
  const shared = {
    ...answer,
    listing,
    remark: listing.currency === "EUR" ? "" : "Conversion uses the securities FX rate. The price list names no markup.",
    cashCurrency: "EUR",
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `comdirect schedule re-read on ${SCHEDULE.readOn}: 4.90 € + 0.25% in Germany, ` +
      `7.90 € + 0.25% abroad, plus the German venue fee`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "no number of shares" : "no price for this line: run node assets/prices.mjs" };
  }
  if (!kind) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} has no published venue fee at comdirect` };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const trade = {
    shares: n,
    price: p,
    notional,
    notionalUsd: finite(notionalUsd, 6),
    currency: listing.currency,
  };
  if (kind === "foreign") {
    return {
      ...shared,
      usd: null,
      brokerFees: null,
      why: "foreign venue fees are not published",
      remark: "Foreign venue fees are not published.",
      trade,
      confidence: `${shared.basis}; foreign venue fees are not published, so the total is unknown`,
    };
  }

  const notionalEur = eurOf(notional, listing.currency);
  const venue = venueEur(notionalEur, kind);
  if (notionalEur == null || venue == null) {
    return { ...shared, why: `no euro rate to convert ${listing.currency}` };
  }
  const commission = commissionEur(notionalEur, false);
  const each = commission + venue;
  const brokerFees = dollars(each * 2, "EUR");
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    `commission ${commission.toFixed(2)} €, venue ${venue.toFixed(2)} €, each side`,
    "the venue fee is in the number",
    marketPerShare != null
      ? american
        ? `book ${marketPerShare} $ a share, quoted NBBO`
        : `book ${marketPerShare} $ a share`
      : marketBp != null
        ? `book ${marketBp} bp`
        : `no book: ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      base: INLAND.base,
      rate: INLAND.rate,
      min: INLAND.min,
      cap: INLAND.max,
      each,
      commissionEach: commission,
      venueEach: venue,
      currency: "EUR",
      eachWay: true,
    },
    ...(bookUsd == null
      ? { why: `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no book on file"}` }
      : {}),
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/comdirect/comdirect_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
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
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip    : ${out.usd == null ? "unknown" : `${out.usd} $`}`);
    console.log(`broker fees   : ${out.brokerFees == null ? "unknown" : `${out.brokerFees} $`}`);
  }
  if (out.remark) console.log(out.remark);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
