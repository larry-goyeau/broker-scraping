// What TradeSmart sells as a share or an ETF. The contract zips are
// public and need no token. Futures, options, currency and commodities
// stay out. Direct mutual funds are another shelf.
//
// https://v2api.tradesmartonline.in/NSE_symbols.txt.zip
// https://v2api.tradesmartonline.in/BSE_symbols.txt.zip
//   Instrument is the series. There is no ISIN. EQ, BE, BZ, SM, ST and
//   SZ are shares. An ETF is a share series whose joined ISIN starts
//   with INF, or BSE group E, or a BSE group F line whose symbol is an
//   ETF. Group F is otherwise debt. IV is an InvIT and RR a REIT. The
//   ISIN is joined from the NSE list and from Upstox. A line with no
//   join stays out. An indicative NAV stays out.
//
//   node brokers/tradesmart/tradesmart_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv, cashBook, lookup, companyName, isinOf, debtIsin, isInav } from "../../indianCash.mjs";
import { inflateRawSync } from "node:zlib";
import fs from "node:fs";

const ROOT = "https://v2api.tradesmartonline.in/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "MS", "EQ", "BE", "BZ", "SM", "ST", "SZ"]);

function zipText(buffer) {
  const signature = buffer.readUInt32LE(0);
  if (signature !== 0x04034b50) throw new Error("TradeSmart archive is not a zip");
  const method = buffer.readUInt16LE(8);
  const compressed = buffer.readUInt32LE(18);
  const nameLength = buffer.readUInt16LE(26);
  const extraLength = buffer.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + compressed);
  if (method === 0) return data.toString("utf8");
  if (method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`TradeSmart archive method ${method} is not readable`);
}

async function textOf(name) {
  const url = `${ROOT}${name}_symbols.txt.zip`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: controller.signal,
      });
      if (response.ok) return zipText(Buffer.from(await response.arrayBuffer()));
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
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

for (const cell of parseCsv(await textOf("NSE"))) {
  const ticker = String(cell.Symbol || "").trim().toUpperCase();
  if (!ticker) {
    skip("not a share");
    continue;
  }
  if (isInav(ticker)) {
    skip("indicative nav");
    continue;
  }
  const series = String(cell.Instrument || "").trim().toUpperCase();
  const entry = lookup(book, "NSE", ticker);
  const isin = isinOf(entry?.isin);
  if (!isin || debtIsin(isin)) {
    skip("not a share");
    continue;
  }
  const shareSeries = NSE.has(series);
  const etf = shareSeries && isin.startsWith("INF");
  const share = shareSeries && !etf;
  if (!share && !etf) {
    skip("not a share");
    continue;
  }
  const key = `NSE|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: isin,
    ticker,
    name: companyName(cell.Symbol, ticker, entry),
    exchange: "NSE",
    currency: "INR",
    type: etf ? "ETF" : "EQ",
    raw: [ticker, "NSE", "INR", series, isin].filter(Boolean).join(" "),
    isin,
  });
}

for (const cell of parseCsv(await textOf("BSE"))) {
  const ticker = String(cell.Symbol || "").trim().toUpperCase();
  if (!ticker) {
    skip("not a share");
    continue;
  }
  if (isInav(ticker)) {
    skip("indicative nav");
    continue;
  }
  const series = String(cell.Instrument || "").trim().toUpperCase();
  const entry = lookup(book, "BSE", ticker);
  const isin = isinOf(entry?.isin);
  if (!isin || debtIsin(isin)) {
    skip("not a share");
    continue;
  }
  const etf = isin.startsWith("INF") || series === "E" || (series === "F" && groupFtf(ticker));
  const share = BSE.has(series) && !etf;
  if (!share && !etf) {
    skip("not a share");
    continue;
  }
  const key = `BSE|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: isin,
    ticker,
    name: companyName(cell.Symbol, ticker, entry),
    exchange: "BSE",
    currency: "INR",
    type: etf ? "ETF" : "EQ",
    raw: [ticker, "BSE", "INR", series, isin].filter(Boolean).join(" "),
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

fs.writeFileSync(new URL("tradesmart-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(rows.map((row) => row.isin)).size;
console.error(
  `${rows.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
