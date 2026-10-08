// What Landsbankinn sells online. The trading page names two markets:
// the main market of Kauphöllin and First North. The market page is
// those two lists, each row with a buy link. Funds of Landsbréf are a
// separate product and are not on either list.
//
// The lists print a ticker, a name and the króna. They do not print an
// ISIN. The ISIN is the same share on the Nasdaq Iceland screener.
// Asking the list for a live price requires a session. Without that
// flag the same two lists come back.
//
//   https://www.landsbankinn.is/verdbrefavidskipti-a-netinu
//   https://www.landsbankinn.is/markadir/hlutabref
//   https://graphql.landsbankinn.is/v2
//   https://api.nasdaq.com/api/nordic/screener/shares?category=MAIN_MARKET&market=ICE
//   https://api.nasdaq.com/api/nordic/screener/shares?category=FIRST_NORTH&market=ICE
//
//   node brokers/landsbankinn/landsbankinn_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const GRAPHQL = "https://graphql.landsbankinn.is/v2";
const NASDAQ = "https://api.nasdaq.com/api/nordic/screener/shares";
const PAGE = "https://www.landsbankinn.is/markadir/hlutabref";

const BOOKS = [
  { exchange: "XICE", category: "MAIN_MARKET", floor: 20 },
  { exchange: "FNIS", category: "FIRST_NORTH", floor: 3 },
];

const STOCKS = `
  query FetchStocks($exchange: ExchangeSymbol) {
    stocks(exchange: $exchange, first: 100, realTime: false) {
      edges { node { name symbol exchangeSymbol currency } }
    }
  }
`;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

async function getJson(url, init) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers || {}) },
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

async function landsbankinn(exchange) {
  const body = await getJson(GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: STOCKS, variables: { exchange } }),
  });
  if (body?.errors?.length) throw new Error(`${exchange}: ${body.errors[0].message}`);
  const edges = body?.data?.stocks?.edges;
  if (!Array.isArray(edges)) throw new Error(`${exchange} has no rows`);
  if (edges.length >= 100) throw new Error(`${exchange} filled the page of 100`);
  return edges.map((edge) => edge?.node).filter(Boolean);
}

async function nasdaq(category) {
  const found = [];
  let page = 1;
  let pages = 1;
  while (page <= pages) {
    const url = `${NASDAQ}?category=${category}&market=ICE&tableonly=true&size=500&page=${page}`;
    const body = await getJson(url);
    if (body?.status?.rCode !== 200) throw new Error(`${category} answered ${body?.status?.rCode || "nothing"}`);
    const rows = body.data?.instrumentListing?.rows;
    if (!Array.isArray(rows)) throw new Error(`${category} has no rows`);
    pages = body.data?.pagination?.totalPages || 1;
    found.push(...rows);
    page += 1;
  }
  const byTicker = new Map();
  for (const raw of found) {
    const ticker = normalize(raw.symbol).toUpperCase();
    const isin = isinOf(raw.isin);
    if (!ticker || !isin) throw new Error(`${category} row has no ticker or ISIN`);
    const prior = byTicker.get(ticker);
    if (prior && prior !== isin) throw new Error(`${ticker} is both ${prior} and ${isin} on ${category}`);
    byTicker.set(ticker, isin);
  }
  return byTicker;
}

const rows = [];
const seen = new Set();
for (const book of BOOKS) {
  const [listed, isins] = await Promise.all([landsbankinn(book.exchange), nasdaq(book.category)]);
  if (listed.length < book.floor) throw new Error(`only ${listed.length} ${book.exchange} rows on ${PAGE}`);
  for (const raw of listed) {
    const ticker = normalize(raw.symbol).toUpperCase();
    const name = normalize(raw.name);
    const exchange = normalize(raw.exchangeSymbol).toUpperCase();
    const currency = normalize(raw.currency).toUpperCase();
    if (!ticker || !name) throw new Error(`${book.exchange} row has no ticker or name`);
    if (exchange !== book.exchange) throw new Error(`${ticker} is filed on ${exchange || "no market"}`);
    if (currency !== "ISK") throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
    const isin = isins.get(ticker);
    if (!isin) throw new Error(`${ticker} is on the Landsbankinn list and not on Nasdaq ${book.category}`);
    if (seen.has(isin)) throw new Error(`${isin} is listed twice`);
    seen.add(isin);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency,
      type: "STOCK",
      isin,
      raw: [ticker, name, exchange, currency, isin, "STOCK"].join(" "),
    });
  }
}

for (const ticker of ["ARION", "ISLAX"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}

rows.sort((left, right) => {
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("landsbankinn-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byBook = new Map();
for (const row of kept) byBook.set(row.exchange, (byBook.get(row.exchange) || 0) + 1);
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
