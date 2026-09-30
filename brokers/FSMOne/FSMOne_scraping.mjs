// What FSMOne sells on the places it displays. Two public selectors, read
// without a login. The stock screener is the share list. The ETF selector
// types every line ETF. A name that says ETN, ETNs or "Exchange-Traded Notes"
// is an ETN. A name that says ETC is an ETC. Anything else stays an ETF:
// a treasury "Note ETF" is still an ETF. FSMOne prints no ISIN, so the code is
// the one the other catalogues already agree on for the same venue and ticker.
//
// A line whose buy flag is closed stays out. A share that is also in the ETF
// selector is the ETF, once. Places the exchange list marks displayFsm N
// (ASX, Tokyo, Paris, and the rest) stay out.
//
//   https://fsm.global/sg/tools/stock-selector
//   https://fsm.global/sg/tools/etf-selector
//   https://fsm.global/sg/rest/stock/stock-screener-v3
//   https://fsm.global/sg/rest/fund/get-etf-selector-table-info-with-pagination
//
//   node FSMOne/FSMOne_scraping.mjs

import { stampRows } from "../accepted.mjs";
import { catalogueFiles } from "../catalogues.mjs";
import { resolveVenue } from "../venues.mjs";
import fs from "node:fs";
import path from "node:path";

const ORIGIN = "https://fsm.global";
const HOME = `${ORIGIN}/sg/tools/etf-selector`;
const EXCHANGES = `${ORIGIN}/sg/rest/stock/exchange?ver=1`;
const STOCKS = `${ORIGIN}/sg/rest/stock/stock-screener-v3?page=1&size=50000&sortDesc=false&sortField=stockCode&isTopList=false`;
const ETFS = `${ORIGIN}/sg/rest/fund/get-etf-selector-table-info-with-pagination`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const cookies = new Map();

function remember(response) {
  const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const line of lines) {
    const pair = String(line).split(";")[0];
    const cut = pair.indexOf("=");
    if (cut > 0) cookies.set(pair.slice(0, cut), pair.slice(cut + 1));
  }
}

async function textOf(url, { method = "GET", body = null, referer = HOME } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "User-Agent": UA,
          Accept: "application/json,text/html",
          Referer: referer,
          ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      remember(response);
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function listed(payload, label) {
  const data = payload?.data;
  const rows = data?.results;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${label} returned no rows`);
  if (data.count != null && data.count !== rows.length) {
    throw new Error(`${label} count ${data.count} but ${rows.length} rows came back`);
  }
  return rows;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function tickerKey(value) {
  const text = String(value || "").trim().toUpperCase().split(/[ .]/)[0];
  return /^\d{1,6}$/.test(text) ? text.padStart(6, "0") : text;
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

// Venue and ticker, not the broker's spelling of the place. Two ISINs for the
// same pair are a disagreement, and a disagreement is left blank.
function isinBook() {
  const book = new Map();
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "FSMOne") continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const isin = isinOf(row.isin);
      const ticker = tickerKey(row.ticker);
      const { venue } = resolveVenue(row);
      if (!isin || !ticker || !venue) continue;
      const key = `${venue.mic}|${ticker}`;
      const prior = book.get(key);
      if (!prior) book.set(key, isin);
      else if (prior !== isin) book.set(key, "");
    }
  }
  return book;
}

const isins = isinBook();

function joinedIsin(exchange, ticker, currency) {
  const { venue } = resolveVenue({ exchange, currency });
  if (!venue) return "";
  return isins.get(`${venue.mic}|${tickerKey(ticker)}`) || "";
}

function listingType(name) {
  if (/\bETNs?\b/i.test(name) || /exchange-traded notes/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

await textOf(HOME);
const shown = new Set(
  Object.values(JSON.parse(await textOf(EXCHANGES, { referer: `${ORIGIN}/sg/tools/stock-selector` })).data || {})
    .filter((row) => row?.displayFsm === "Y" && row.exchangeId)
    .map((row) => String(row.exchangeId).toUpperCase())
);
if (!shown.size) throw new Error("FSMOne named no displayed exchange");

const funds = listed(
  JSON.parse(await textOf(ETFS, { method: "POST", body: { currentPage: 1, resultsPerPage: 1 }, referer: HOME })),
  "ETF selector"
);
const shares = listed(
  JSON.parse(await textOf(STOCKS, { method: "POST", body: {}, referer: `${ORIGIN}/sg/tools/stock-selector` })),
  "stock screener"
);

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const etfKeys = new Set();
const results = [];

for (const row of funds) {
  const exchange = clean(row.exchange).toUpperCase();
  const ticker = clean(row.stockCode).toUpperCase();
  const name = clean(row.productName);
  if (!exchange || !ticker) throw new Error(`unread ETF ${row.stockCode} @ ${row.exchange}`);
  if (!shown.has(exchange)) {
    skip("exchange not displayed");
    continue;
  }
  if (row.productType !== "ETF") throw new Error(`unread product type ${row.productType} ${ticker}`);
  if (row.buyEnabled !== "Y") {
    skip("buy closed");
    continue;
  }
  const currency = clean(row.currency).toUpperCase();
  if (!currency) throw new Error(`unread currency ${ticker} @ ${exchange}`);
  const type = listingType(name === "-" ? "" : name);
  etfKeys.add(`${exchange}:${ticker}`);
  results.push({
    query: ticker,
    ticker,
    name: name && name !== "-" ? name : ticker,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, type].filter(Boolean).join(" "),
    isin: joinedIsin(exchange, ticker, currency),
  });
}

for (const row of shares) {
  const exchange = clean(row.exchange).toUpperCase();
  const ticker = clean(row.stockCode).toUpperCase();
  const name = clean(row.stockFullName || row.stockName);
  if (!exchange || !ticker) throw new Error(`unread share ${row.stockCode} @ ${row.exchange}`);
  if (!shown.has(exchange)) {
    skip("exchange not displayed");
    continue;
  }
  if (row.cashEnabled !== "Y") {
    skip("cash disabled");
    continue;
  }
  if (etfKeys.has(`${exchange}:${ticker}`)) {
    skip("also an ETF");
    continue;
  }
  const currency = clean(row.currency).toUpperCase();
  if (!currency) throw new Error(`unread currency ${ticker} @ ${exchange}`);
  results.push({
    query: ticker,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type: "STOCK",
    raw: [ticker, name, exchange, currency, "STOCK"].filter(Boolean).join(" "),
    isin: joinedIsin(exchange, ticker, currency),
  });
}

const seen = new Set();
const unique = [];
for (const row of results) {
  const key = `${row.ticker}:${row.exchange}:${row.type}`;
  if (seen.has(key)) {
    skip("duplicate");
    continue;
  }
  seen.add(key);
  unique.push(row);
}
unique.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("FSMOne-parsed.json", import.meta.url), JSON.stringify(stampRows(unique), null, 2));

const byType = new Map();
for (const row of unique) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const instruments = new Set(unique.map((row) => `${row.type}:${row.ticker}:${row.exchange}`)).size;
const withIsin = unique.filter((row) => row.isin).length;
console.error(
  `${unique.length} listings over ${instruments} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ${withIsin} with an ISIN` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
