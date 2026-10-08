// BRI Danareksa Sekuritas sells every share listed on the Indonesia
// Stock Exchange. The regular account says so: any share, no minimum
// deposit. Mutual funds that do not trade on the exchange, warrants
// and rights stay out. The exchange's ETFs are in the same online
// book, so those rows are kept. A real-estate investment fund (DIRE)
// is neither a share nor an ETF.
//
// The exchange's own helper still names shares and ETFs it has already
// delisted, and a plain request is blocked. The rows are the common
// shares and the ETFs TradingView lists on IDX. A one-letter search
// stops before it has named every share, so the crawl is two letters.
//
//   https://www.brights.id/id/produk-dan-layanan/layanan/rekening-saham
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=BB&exchange=IDX&lang=en&domain=production&search_type=stocks
//
//   node brokers/bri/bri_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function prefixes() {
  const out = ["R-"];
  for (const a of LETTERS) for (const b of LETTERS) out.push(a + b);
  return out;
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function isDire(name) {
  return /\bDIRE\b/i.test(name) || /dana investasi real estat/i.test(name);
}

async function page(text, searchType, start) {
  const url = `${SEARCH}?text=${encodeURIComponent(text)}&exchange=IDX&lang=en&domain=production&search_type=${searchType}&start=${start}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Origin: "https://www.tradingview.com" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) {
          throw new Error(`${text} ${searchType} has no page`);
        }
        return body;
      }
      last = `${response.status} ${text} ${searchType}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

async function crawl(searchType, take) {
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
        const body = await page(text, searchType, start);
        remaining = body.symbols_remaining;
        for (const symbol of body.symbols) take(symbol, found);
        start += body.symbols.length;
        if (!body.symbols.length) remaining = 0;
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return found;
}

function remember(found, symbol, type) {
  if (symbol.exchange !== "IDX") return;
  const ticker = normalize(symbol.symbol).toUpperCase();
  const name = normalize(symbol.description);
  const isin = isinOf(symbol.isin);
  const currency = normalize(symbol.currency_code).toUpperCase();
  if (!ticker || !name) throw new Error("a row has no ticker or name");
  if (!isin) throw new Error(`${ticker} has no ISIN`);
  if (currency !== "IDR") throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
  const prior = found.get(ticker);
  if (prior && (prior.isin !== isin || prior.type !== type)) {
    throw new Error(`${ticker} is both ${prior.isin} ${prior.type} and ${isin} ${type}`);
  }
  if (!prior) found.set(ticker, { ticker, name, isin, type });
}

const shares = await crawl("stocks", (symbol, found) => {
  if (symbol.type !== "stock") return;
  const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs : [];
  if (!specs.includes("common") && !specs.includes("preferred")) return;
  const name = normalize(symbol.description);
  if (isDire(name)) return;
  remember(found, symbol, "STOCK");
});

const funds = await crawl("funds", (symbol, found) => {
  const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs : [];
  if (!specs.includes("etf")) return;
  remember(found, symbol, "ETF");
});

for (const ticker of funds.keys()) {
  if (shares.has(ticker)) throw new Error(`${ticker} is both a share and an ETF`);
}

const rows = [...shares.values(), ...funds.values()].map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: "IDX",
  currency: "IDR",
  type: row.type,
  isin: row.isin,
  raw: [row.ticker, row.name, "IDX", row.isin, row.type].join(" "),
}));

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

if (shares.size < 900) throw new Error(`only ${shares.size} IDX shares`);
if (funds.size < 40) throw new Error(`only ${funds.size} IDX ETFs`);
for (const ticker of ["BBCA", "TLKM", "GOTO", "XRDN", "XIIT", "R-LQ45X"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("bri-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byBook = new Map();
for (const row of kept) byBook.set(row.type, (byBook.get(row.type) || 0) + 1);
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} IDX ${label}`).join(", ")})`
);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
