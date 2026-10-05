// Desjardins Online Brokerage sells online every share and ETF on the
// North American exchanges it names. There is no Disnat list. Those
// names are the common and preferred shares, the listed depositary
// receipts and the ETFs TradingView files on Nasdaq, NYSE, NYSE
// American (its Arca ETFs included), Cboe, TSX, TSX Venture, CSE and
// NEO.
//
// Pink Sheets and the OTCBB are not tradable. An OTC ADR and an
// international line are a phone order, so they stay out. A warrant
// and a right are not a share or an ETF. A bond stays out.
//
// A one-character search stops before it has named every line, so the
// crawl is every pair of letters and digits.
//
//   https://www.disnat.com/en/platforms-and-fees/investment-types
//   https://www.disnat.com/en/help-contact
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=AA&exchange=NASDAQ&lang=en&domain=production&search_type=stocks
//
//   node brokers/disnat/disnat_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const BOARDS = ["NASDAQ", "NYSE", "AMEX", "CBOE", "TSX", "TSXV", "CSE", "NEO"];
const CASH = new Set(["USD", "CAD"]);
const skipped = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function prefixes() {
  const out = [];
  for (const a of ALNUM) for (const b of ALNUM) out.push(a + b);
  return out;
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

async function page(exchange, text, searchType, start) {
  const url = `${SEARCH}?text=${encodeURIComponent(text)}&exchange=${exchange}&lang=en&domain=production&search_type=${searchType}&start=${start}`;
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Origin: "https://www.tradingview.com" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) {
          throw new Error(`${exchange} ${text} ${searchType} has no page`);
        }
        return body;
      }
      last = `${response.status} ${exchange} ${text} ${searchType}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

async function crawl(exchange, searchType, take) {
  const found = new Map();
  const texts = prefixes();
  let cursor = 0;
  async function worker() {
    while (cursor < texts.length) {
      const text = texts[cursor];
      cursor += 1;
      let start = 0;
      let remaining = 1;
      while (remaining > 0) {
        const body = await page(exchange, text, searchType, start);
        remaining = body.symbols_remaining;
        for (const symbol of body.symbols) take(symbol, found);
        start += body.symbols.length;
        if (!body.symbols.length) remaining = 0;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return found;
}

function remember(found, symbol, exchange, type) {
  if (symbol.exchange !== exchange) return;
  const ticker = normalize(symbol.symbol).toUpperCase();
  const name = normalize(symbol.description);
  const isin = isinOf(symbol.isin);
  const currency = normalize(symbol.currency_code).toUpperCase();
  if (!ticker || !name) throw new Error("a row has no ticker or name");
  if (!isin) {
    skipped.add(`${exchange} ${ticker} no ISIN`);
    return;
  }
  if (!CASH.has(currency)) {
    skipped.add(`${exchange} ${ticker} ${currency || "no currency"}`);
    return;
  }
  const prior = found.get(ticker);
  if (prior && (prior.isin !== isin || prior.type !== type)) {
    throw new Error(`${exchange} ${ticker} is both ${prior.isin} ${prior.type} and ${isin} ${type}`);
  }
  if (!prior) found.set(ticker, { ticker, name, isin, type, exchange, currency });
}

function equity(symbol) {
  const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs : [];
  if (specs.includes("warrant") || specs.includes("right")) return false;
  if (symbol.type === "warrant") return false;
  if (symbol.type === "dr") return true;
  return symbol.type === "stock" && (specs.includes("common") || specs.includes("preferred"));
}

const rows = [];
for (const exchange of BOARDS) {
  const shares = await crawl(exchange, "stocks", (symbol, found) => {
    if (!equity(symbol)) return;
    remember(found, symbol, exchange, "STOCK");
  });
  console.error(`${exchange} shares done: ${shares.size}`);
  const funds = await crawl(exchange, "funds", (symbol, found) => {
    const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs : [];
    if (!specs.includes("etf")) return;
    remember(found, symbol, exchange, "ETF");
  });
  for (const ticker of funds.keys()) {
    if (shares.has(ticker)) throw new Error(`${exchange} ${ticker} is both a share and an ETF`);
  }
  rows.push(...shares.values(), ...funds.values());
  console.error(`${exchange}: ${shares.size} shares, ${funds.size} ETFs`);
}

const listed = rows.map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: row.exchange,
  currency: row.currency,
  type: row.type,
  isin: row.isin,
  raw: [row.ticker, row.name, row.exchange, row.isin, row.type].join(" "),
}));

listed.sort((left, right) => {
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

for (const [exchange, ticker] of [
  ["NASDAQ", "AAPL"],
  ["NYSE", "JPM"],
  ["AMEX", "SPY"],
  ["TSX", "RY"],
  ["TSX", "XIU"],
]) {
  if (!listed.some((row) => row.exchange === exchange && row.ticker === ticker)) {
    throw new Error(`missing ${exchange} ${ticker}`);
  }
}
const nasdaqShares = listed.filter((row) => row.exchange === "NASDAQ" && row.type === "STOCK").length;
const nyseShares = listed.filter((row) => row.exchange === "NYSE" && row.type === "STOCK").length;
const tsxShares = listed.filter((row) => row.exchange === "TSX" && row.type === "STOCK").length;
const etfs = listed.filter((row) => row.type === "ETF").length;
if (nasdaqShares < 2500) throw new Error(`only ${nasdaqShares} Nasdaq shares`);
if (nyseShares < 1000) throw new Error(`only ${nyseShares} NYSE shares`);
if (tsxShares < 400) throw new Error(`only ${tsxShares} TSX shares`);
if (etfs < 800) throw new Error(`only ${etfs} ETFs`);
if (skipped.size) console.error(`${skipped.size} lines left out:\n${[...skipped].sort().join("\n")}`);
if (skipped.size > 400) throw new Error(`${skipped.size} lines were left out`);

const kept = stampRows(withoutObligations(listed));
fs.writeFileSync(new URL("disnat-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byBook = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  byBook.set(key, (byBook.get(key) || 0) + 1);
}
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
if (kept.length < listed.length) console.error(`${listed.length - kept.length} bonds left out`);
