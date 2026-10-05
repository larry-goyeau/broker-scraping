// Prime Transaction sells online every instrument listed on the
// Bucharest Stock Exchange. There is no Prime list. Those names are
// the shares and the ETFs TradingView files on BVB, and a closed-end
// fund that is listed there too. Arena XT sends the order to the
// exchange.
//
// The execution policy names one venue: shares, bonds, government
// paper, structured products, rights and the other instruments on that
// exchange. A bond stays out. A structured certificate is not a share
// or an ETF. A warrant and a right stay out. Warrants and derivatives
// are no longer traded in Bucharest.
//
// The board is small enough that an empty search pages to the end.
//
//   https://primet.ro/ce-oferim-arena-xt
//   https://primet.ro/storage/pagini/legale/Politica%20de%20executare%20a%20ordinelor_V10.pdf
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=&exchange=BVB&lang=en&domain=production&search_type=stocks
//
//   node brokers/prime/prime_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CASH = new Set(["RON", "EUR"]);
const skipped = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

async function page(searchType, start) {
  const url = `${SEARCH}?text=&exchange=BVB&lang=en&domain=production&search_type=${searchType}&start=${start}`;
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Origin: "https://www.tradingview.com" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) {
          throw new Error(`BVB ${searchType} has no page`);
        }
        return body;
      }
      last = `${response.status} BVB ${searchType}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

async function crawl(searchType) {
  const found = [];
  let start = 0;
  let remaining = 1;
  while (remaining > 0) {
    const body = await page(searchType, start);
    remaining = body.symbols_remaining;
    found.push(...body.symbols);
    start += body.symbols.length;
    if (!body.symbols.length) remaining = 0;
  }
  return found;
}

function remember(found, symbol, type) {
  if (symbol.exchange !== "BVB") return;
  const ticker = normalize(symbol.symbol).toUpperCase();
  const name = normalize(symbol.description);
  const isin = isinOf(symbol.isin);
  const currency = normalize(symbol.currency_code).toUpperCase();
  if (!ticker || !name) throw new Error("a row has no ticker or name");
  if (!isin) {
    skipped.add(`${ticker} no ISIN`);
    return;
  }
  if (!CASH.has(currency)) throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
  const prior = found.get(ticker);
  if (prior && (prior.isin !== isin || prior.type !== type)) {
    throw new Error(`${ticker} is both ${prior.isin} ${prior.type} and ${isin} ${type}`);
  }
  if (!prior) found.set(ticker, { ticker, name, isin, type, currency });
}

function equity(symbol) {
  const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs : [];
  if (specs.includes("warrant") || specs.includes("right")) return false;
  if (symbol.type === "warrant") return false;
  if (symbol.type === "dr") return true;
  return symbol.type === "stock" && (specs.includes("common") || specs.includes("preferred"));
}

const shares = new Map();
for (const symbol of await crawl("stocks")) {
  if (!equity(symbol)) continue;
  remember(shares, symbol, "STOCK");
}
console.error(`BVB shares done: ${shares.size}`);

const funds = new Map();
for (const symbol of await crawl("funds")) {
  const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs : [];
  if (specs.includes("etf")) remember(funds, symbol, "ETF");
  else if (specs.includes("closedend")) remember(funds, symbol, "STOCK");
}
for (const ticker of funds.keys()) {
  if (shares.has(ticker)) throw new Error(`${ticker} is both a share and a fund`);
}

const listed = [...shares.values(), ...funds.values()].map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: "BVB",
  currency: row.currency,
  type: row.type,
  isin: row.isin,
  raw: [row.ticker, row.name, "BVB", row.isin, row.type].join(" "),
}));

listed.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

for (const ticker of ["TLV", "SNG", "FP", "TVBETETF"]) {
  if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}
const shareCount = listed.filter((row) => row.type === "STOCK").length;
const etfs = listed.filter((row) => row.type === "ETF").length;
if (shareCount < 250) throw new Error(`only ${shareCount} shares`);
if (etfs < 8) throw new Error(`only ${etfs} ETFs`);
if (skipped.size) console.error(`${skipped.size} lines left out: ${[...skipped].sort().join(", ")}`);
if (skipped.size > 15) throw new Error(`${skipped.size} lines were left out`);

const kept = stampRows(withoutObligations(listed));
fs.writeFileSync(new URL("prime-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${kept.filter((row) => row.type === "STOCK").length} STOCK, ${kept.filter((row) => row.type === "ETF").length} ETF)`
);
if (kept.length < listed.length) console.error(`${listed.length - kept.length} bonds left out`);
