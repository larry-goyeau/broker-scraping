// What m.Stock sells as a share or an ETF. The script master is public:
// the docs print an API key, and a GET without one still returns the file.
// Futures, options and currency stay out. Direct mutual funds are another
// shelf. Commodities are not in this file.
//
// https://api.mstock.trade/openapi/typeb/instruments/OpenAPIScripMaster
//   NSE writes the series in instrumenttype. BSE writes it after a hyphen
//   in the name (LIQUIDBEES-F). There is no ISIN. It is joined from the
//   NSE list and from Upstox when the symbol matches. NSE series EQ, BE,
//   BZ, SM, ST and SZ are shares, and so are the BSE groups A, B, T, XT,
//   X, Z, ZP, M, MT, P, TS, E and MS. A BSE name ending in -EQ is an
//   index. An ETF filed in BSE group F is
//   kept; the rest of that group is commercial paper and debentures. An
//   indicative NAV stays out. Rights, InvIT and REIT stay out.
//
//   node brokers/m.stock/m.stock_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { cashBook, lookup, companyName, isinOf, debtIsin } from "../../indianCash.mjs";
import fs from "node:fs";

const FILE = "https://api.mstock.trade/openapi/typeb/instruments/OpenAPIScripMaster";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
// A BSE name ending in -EQ is an index (SENSEX, BANKEX), not the share.
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "E", "MS"]);

async function masterOf() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(FILE, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.ok) return response.json();
      last = `${response.status} ${FILE}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

function seriesOf(row) {
  const exchange = String(row.exch_seg || "").trim().toUpperCase();
  if (exchange === "NSE") return String(row.instrumenttype || "").trim().toUpperCase();
  const name = String(row.name || "");
  const cut = name.lastIndexOf("-");
  return cut < 0 ? "" : name.slice(cut + 1).trim().toUpperCase();
}

function groupFtf(symbol) {
  return /ETF|BEES|LIQUID/i.test(symbol) && !/INAV/i.test(symbol);
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const book = await cashBook();
const rows = [];
const seen = new Set();
for (const cell of await masterOf()) {
  const exchange = String(cell.exch_seg || "").trim().toUpperCase();
  if (exchange !== "NSE" && exchange !== "BSE") {
    skip("contract");
    continue;
  }
  const ticker = String(cell.symbol || "").trim().toUpperCase();
  if (!ticker) throw new Error("unread ticker");
  if (/INAV/i.test(ticker)) {
    skip("indicative nav");
    continue;
  }
  if (/NSETEST/.test(ticker)) {
    skip("test");
    continue;
  }
  const series = seriesOf(cell);
  const share = (exchange === "NSE" && NSE.has(series)) || (exchange === "BSE" && BSE.has(series));
  const fundF = exchange === "BSE" && series === "F" && groupFtf(ticker);
  if (!share && !fundF) {
    skip("not a share");
    continue;
  }
  const entry = lookup(book, exchange, ticker);
  const isin = isinOf(entry?.isin);
  if (isin && debtIsin(isin)) {
    skip("not a share");
    continue;
  }
  if (!isin && /NAV|INV$/i.test(ticker)) {
    skip("indicative nav");
    continue;
  }
  const key = `${exchange}|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  const etf = fundF || series === "E" || isin.startsWith("INF");
  rows.push({
    query: isin || ticker,
    ticker,
    name: companyName(ticker, ticker, entry),
    exchange,
    currency: "INR",
    type: etf ? "ETF" : "EQ",
    raw: [ticker, exchange, "INR", series, isin].filter(Boolean).join(" "),
    isin,
  });
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("m.stock-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const withIsin = rows.filter((row) => row.isin).length;
const instruments = new Set(rows.map((row) => row.isin || `${row.type}:${row.ticker}:${row.exchange}`)).size;
console.error(
  `${rows.length} listings over ${instruments} instruments (${withIsin} with an ISIN) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
