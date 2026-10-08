// Arion sells every company listed on the Icelandic main market and on
// First North, in the app. It publishes no names. Foreign orders go
// through the brokerage desk and are not in this file. The trading page
// does not mention ETFs. The rows are every share on those two markets
// and every ETF Nasdaq files in Iceland.
//
//   https://www.arionbanki.is/einstaklingar/sparnadur/verdbref-einstaklingar
//   https://api.nasdaq.com/api/nordic/screener/shares?category=MAIN_MARKET&market=ICE
//   https://api.nasdaq.com/api/nordic/screener/shares?category=FIRST_NORTH&market=ICE
//   https://api.nasdaq.com/api/nordic/screener/etp?category=ETF&market=ICE
//
//   node brokers/arion/arion_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://api.nasdaq.com/api/nordic/screener";

const BOOKS = [
  { path: "/shares", category: "MAIN_MARKET", type: "STOCK", exchange: "XICE", floor: 20 },
  { path: "/shares", category: "FIRST_NORTH", type: "STOCK", exchange: "FNIS", floor: 3 },
  { path: "/etp", category: "ETF", type: "ETF", exchange: "XICE", floor: 1 },
];

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

async function bookRows(book) {
  const found = [];
  let page = 1;
  let pages = 1;
  while (page <= pages) {
    const url = `${BASE}${book.path}?category=${book.category}&market=ICE&tableonly=true&size=500&page=${page}`;
    const body = await getJson(url);
    if (body?.status?.rCode !== 200) {
      throw new Error(`${book.category} answered ${body?.status?.rCode || "nothing"}`);
    }
    const listing = body.data?.instrumentListing;
    const rows = listing?.rows;
    if (!Array.isArray(rows)) throw new Error(`${book.category} has no rows`);
    pages = body.data?.pagination?.totalPages || 1;
    found.push(...rows);
    page += 1;
  }
  return found;
}

function take(raw, book, byIsin) {
  const isin = isinOf(raw.isin);
  const ticker = normalize(raw.symbol).toUpperCase();
  const name = normalize(raw.fullName);
  const currency = normalize(raw.currency).toUpperCase();
  if (!isin) throw new Error(`${ticker || book.category} has no ISIN`);
  if (!ticker || !name) throw new Error(`${isin} has no ticker or name`);
  if (currency !== "ISK") throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
  const prior = byIsin.get(isin);
  if (prior && (prior.ticker !== ticker || prior.exchange !== book.exchange || prior.type !== book.type)) {
    throw new Error(`${isin} is both ${prior.ticker} ${prior.exchange} ${prior.type} and ${ticker} ${book.exchange} ${book.type}`);
  }
  if (!prior) {
    byIsin.set(isin, {
      ticker,
      name,
      isin,
      currency,
      exchange: book.exchange,
      type: book.type,
    });
  }
}

const byIsin = new Map();
const counts = new Map();
for (const book of BOOKS) {
  const raws = await bookRows(book);
  const before = byIsin.size;
  for (const raw of raws) take(raw, book, byIsin);
  const added = byIsin.size - before;
  if (added < book.floor) throw new Error(`only ${added} ${book.category} rows`);
  counts.set(book.category, added);
}

for (const ticker of ["ARION", "ISLAX", "LEQ"]) {
  if (![...byIsin.values()].some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}

const rows = [...byIsin.values()].map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: row.exchange,
  currency: row.currency,
  type: row.type,
  isin: row.isin,
  raw: [row.ticker, row.name, row.exchange, row.currency, row.isin, row.type].join(" "),
}));

rows.sort((left, right) => {
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("arion-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byBook = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  byBook.set(key, (byBook.get(key) || 0) + 1);
}
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
