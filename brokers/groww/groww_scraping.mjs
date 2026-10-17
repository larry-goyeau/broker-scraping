// What Groww sells in shares and exchange-traded funds, with no login.
// The all-stocks screener is the share book. The ETF screener is the
// fund book. A mutual fund is a different page and is not here.
//
//   https://groww.in/stocks/filter
//   https://groww.in/v1/api/stocks_data/v1/all_stocks
//   https://groww.in/etfs
//   https://groww.in/v1/api/stocks_data/v1/etfs
//
// The stock page counts about 5,070 names. The same call with the slider's
// stored maximum returns only the smallest names, so the request uses a
// range that covers that count. Names the screener counts and does not
// return are left out. Groww's instrument file is the order book. A cash
// row there with buying allowed is added when the screeners missed it:
// a share in a sold series, or an ETF. A debenture stays out. An iNAV
// stays out. A name on both venues is two lines. The stock row prints
// the NSE symbol and, for the BSE, the scrip code. The order symbol for
// that code is the same file. An ETF that the stock screener also names
// stays on the ETF line only. A screener line whose venue is not for
// sale, or that can only be sold, is left out.
//
//   https://growwapi-assets.groww.in/instruments/instrument.csv
//
//   node brokers/groww/groww_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv, isinOf, debtIsin, isInav, rootOf, soldSeries } from "../../indianCash.mjs";
import fs from "node:fs";

const STOCKS = "https://groww.in/v1/api/stocks_data/v1/all_stocks";
const STOCK_PAGE = "https://groww.in/stocks/filter";
const ETFS = "https://groww.in/v1/api/stocks_data/v1/etfs?page=0&size=500";
const ETF_PAGE = "https://groww.in/etfs";
const INSTRUMENTS = "https://growwapi-assets.groww.in/instruments/instrument.csv";
const OUTPUT = new URL("groww-parsed.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function listingType(name) {
  if (/\bETNs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";
  return "ETF";
}

async function ask(url, options) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          "User-Agent": UA,
          Origin: "https://groww.in",
          ...(options?.headers || {}),
        },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

function isFund(series, isin, name) {
  if (series === "E" || String(isin || "").startsWith("INF")) return true;
  return /\bET[FNC]s?\b|exchange traded/i.test(name);
}

async function instrumentBook() {
  const response = await fetch(INSTRUMENTS, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`Groww instruments answered ${response.status}`);
  const symbols = new Map();
  const orders = [];
  for (const row of parseCsv(await response.text())) {
    if (row.segment.trim().toUpperCase() !== "CASH") continue;
    const exchange = row.exchange.trim().toUpperCase();
    const ticker = rootOf(row.trading_symbol);
    const isin = isinOf(row.isin);
    const series = row.series.trim().toUpperCase();
    if (exchange === "BSE" && ticker) {
      const token = row.exchange_token.trim();
      if (token) symbols.set(`token|${token}`, ticker);
      if (isin && !symbols.has(`isin|${isin}`)) symbols.set(`isin|${isin}`, ticker);
    }
    if (row.buy_allowed.trim() !== "1") continue;
    if (!ticker || !isin || !soldSeries(exchange, series)) continue;
    if (debtIsin(isin) || isInav(ticker)) continue;
    const name = clean(row.name);
    const fund = isFund(series, isin, name);
    orders.push({
      ticker,
      name: name || ticker,
      exchange,
      type: fund ? listingType(name) : "EQ",
      isin,
      series,
    });
  }
  return { symbols, orders };
}

function bseTicker(isin, scriptCode, book) {
  const token = String(scriptCode || "").trim();
  return book.get(`token|${token}`) || book.get(`isin|${isin}`) || token;
}

function push(rows, seen, { ticker, name, exchange, type, isin }) {
  const code = clean(ticker).toUpperCase();
  if (!code || isInav(code)) return;
  const key = `${exchange}|${code}|${isin}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({
    query: code,
    ticker: code,
    name: name || code,
    exchange,
    currency: "INR",
    type,
    isin,
    raw: [code, name, exchange, "INR", type, isin].filter(Boolean).join(" "),
  });
}

const { symbols, orders } = await instrumentBook();
const etfBody = await ask(ETFS, { headers: { Referer: ETF_PAGE } });
const etfRows = Array.isArray(etfBody.etfs) ? etfBody.etfs : [];
if (etfRows.length < 150 || etfBody.total !== etfRows.length) {
  throw new Error(`Groww ETF screener published ${etfBody.total} and returned ${etfRows.length}`);
}

const seen = new Set();
const results = [];
const etfIsins = new Set();

for (const row of etfRows) {
  const header = row.companyHeader || {};
  const isin = isinOf(header.isin);
  const name = clean(header.displayName || header.shortName);
  if (!name && !isin) continue;
  if (isin) etfIsins.add(isin);
  const type = listingType(name);
  if (header.isNseTradable !== false && header.nseScriptCode) {
    push(results, seen, { ticker: header.nseScriptCode, name, exchange: "NSE", type, isin });
  }
  if (header.isBseTradable !== false && (header.bseTradingSymbol || header.bseScriptCode)) {
    const ticker = header.bseTradingSymbol || bseTicker(isin, header.bseScriptCode, symbols);
    push(results, seen, { ticker, name, exchange: "BSE", type, isin });
  }
}

const stockBody = {
  listFilters: { INDUSTRY: [], INDEX: [] },
  objFilters: {
    CLOSE_PRICE: { min: 0, max: 1e12 },
    MARKET_CAP: { min: 0, max: 1e18 },
  },
  sortBy: "COMPANY_NAME",
  sortType: "ASC",
  size: 500,
};

let stockTotal = 0;
const stockIsins = new Set();
const seenStock = new Set();
let debt = 0;
let alsoEtf = 0;
let exhausted = false;
for (let page = 0; page < 20; page += 1) {
  const body = await ask(STOCKS, {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: STOCK_PAGE },
    body: JSON.stringify({ ...stockBody, page }),
  });
  const records = Array.isArray(body.records) ? body.records : [];
  stockTotal = body.totalRecords || stockTotal;
  if (!records.length) {
    exhausted = true;
    break;
  }
  let fresh = 0;
  for (const row of records) {
    const isin = isinOf(row.isin);
    const id = isin || clean(row.nseScriptCode || row.bseScriptCode);
    if (!id || seenStock.has(id)) continue;
    seenStock.add(id);
    fresh += 1;
    if (isin && etfIsins.has(isin)) {
      alsoEtf += 1;
      continue;
    }
    if (isin && debtIsin(isin)) {
      debt += 1;
      continue;
    }
    const name = clean(row.companyName || row.companyShortName);
    if (isin) stockIsins.add(isin);
    if (row.nseScriptCode) {
      push(results, seen, { ticker: row.nseScriptCode, name, exchange: "NSE", type: "EQ", isin });
    }
    if (row.bseScriptCode) {
      push(results, seen, {
        ticker: bseTicker(isin, row.bseScriptCode, symbols),
        name,
        exchange: "BSE",
        type: "EQ",
        isin,
      });
    }
  }
  if (!fresh) break;
  await sleep(120);
}

if (!exhausted || seenStock.size < 4300) {
  throw new Error(`Groww listed ${stockTotal} shares and the pages held ${seenStock.size}`);
}

const placed = new Set(results.filter((row) => row.isin).map((row) => `${row.exchange}|${row.isin}`));
const hadIsin = new Set(results.map((row) => row.isin).filter(Boolean));
const addedShareIsins = new Set();
const addedFundIsins = new Set();
let addedShares = 0;
let addedFunds = 0;
for (const order of orders) {
  const key = `${order.exchange}|${order.isin}`;
  if (placed.has(key)) continue;
  placed.add(key);
  const before = results.length;
  push(results, seen, order);
  if (results.length === before) continue;
  if (order.type === "EQ") addedShares += 1;
  else addedFunds += 1;
  if (hadIsin.has(order.isin)) continue;
  hadIsin.add(order.isin);
  if (order.type === "EQ") addedShareIsins.add(order.isin);
  else addedFundIsins.add(order.isin);
}

const buyable = new Map(orders.map((order) => [`${order.exchange}|${order.isin}`, order]));
const offered = [];
const seenOffer = new Set();
let notSold = 0;
for (const row of results) {
  const key = `${row.exchange}|${row.isin}`;
  const order = buyable.get(key);
  if (!order || seenOffer.has(key)) {
    notSold += 1;
    continue;
  }
  seenOffer.add(key);
  if (/^\d+$/.test(row.ticker)) {
    row.ticker = order.ticker;
    row.query = order.ticker;
  }
  row.series = order.series;
  row.raw = [row.ticker, row.name, row.exchange, row.series, "INR", row.type, row.isin].filter(Boolean).join(" ");
  offered.push(row);
}
results.length = 0;
results.push(...offered);
if (!results.some((row) => row.ticker === "RELIANCE" && row.exchange === "NSE" && row.type === "EQ" && row.isin === "INE002A01018")) {
  throw new Error("Reliance was not an NSE share");
}
if (!results.some((row) => row.ticker === "SETFNIF50" && row.type === "ETF")) {
  throw new Error("SETFNIF50 was not an ETF");
}
if (!results.some((row) => row.ticker === "AARON" && row.exchange === "NSE" && row.isin === "INE721Z01010")) {
  throw new Error("Aaron Industries was not added from the order file");
}
if (!results.some((row) => row.isin === "INF1J2R01171" && row.type === "ETF")) {
  throw new Error("Angel One Silver ETF was not added from the order file");
}
if (results.length !== orders.length) {
  throw new Error(`Groww sells ${orders.length} listings and the catalogue held ${results.length}`);
}
if (results.some((row) => row.ticker === "LOWVOL" || row.isin === "INF209KC1134")) {
  throw new Error("a fund Groww does not sell stayed in the catalogue");
}

results.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));
const kept = stampRows(withoutObligations(results));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ${withIsin} with an ISIN` +
    `; added ${addedShareIsins.size} shares (${addedShares} lines) and ${addedFundIsins.size} ETFs (${addedFunds} lines) from the order file` +
    (notSold ? `; left out ${notSold} lines Groww does not sell` : "") +
    (debt || alsoEtf ? `; left out ${debt} bonds and ${alsoEtf} already on the ETF screener` : "")
);
