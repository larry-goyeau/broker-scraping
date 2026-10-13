// HDFC Sky publishes the cash book in one public zip, with no login.
//
// https://hdfcsky.com/api/v1/contract/Compact?info=download
//   CompactScrip.csv. The ISIN is on the row. The segment is the NSE
//   series or the BSE group, and the ticker ends with that segment
//   (RELIANCE-A, BAJAJ-AUTO-EQ). Futures, options, currency and
//   commodities are other segments and are not here. Debt, a preference,
//   a rights entitlement and an iNAV stay out. An ETF filed in BSE
//   group F is kept. The rest of that group is a mutual fund or a
//   debenture.
//
//   https://developer.hdfcsky.com/sky-docs/docs/security_master
//
//   node brokers/hdfcsky/hdfcsky_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { parseCsv, isinOf, keepSold } from "../../indianCash.mjs";

const ZIP = "https://hdfcsky.com/api/v1/contract/Compact?info=download";

// The local header leaves the sizes empty and writes them after the
// bytes. The directory at the end of the zip is what names the length.
function unzip(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= floor; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("HDFC Sky archive has no directory");
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("HDFC Sky archive directory is unreadable");
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString();
    const localName = bytes.readUInt16LE(local + 26);
    const localExtra = bytes.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    const data = bytes.subarray(start, start + compressed);
    const text = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
    if (!text) throw new Error(`${name} uses zip method ${method}`);
    files.set(name, text.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function tickerOf(symbol, segment) {
  const text = String(symbol || "").trim().toUpperCase();
  const suffix = `-${String(segment || "").trim().toUpperCase()}`;
  return text.endsWith(suffix) ? text.slice(0, -suffix.length) : text;
}

// Group F holds the liquid and gilt ETFs beside commercial paper. The
// name or the symbol says which line is the fund.
function fundInF(row) {
  if (String(row.exchange || "").trim().toUpperCase() !== "BSE") return false;
  if (String(row.segment || "").trim().toUpperCase() !== "F") return false;
  if (String(row.instrument_name || "").trim().toUpperCase() !== "E") return false;
  const text = `${row.trading_symbol || ""} ${row.company_name || ""}`;
  return /ETF|BEES|LIQUID|GILTCASE/i.test(text) && !/INAV/i.test(text);
}

const response = await fetch(ZIP);
if (!response.ok) throw new Error(`${ZIP} answered ${response.status}`);
const files = unzip(Buffer.from(await response.arrayBuffer()));
const text = files.get("CompactScrip.csv");
if (!text) throw new Error(`${ZIP} has no CompactScrip.csv`);

const listings = [];
const seen = new Set();

for (const row of parseCsv(text)) {
  const exchange = String(row.exchange || "").trim().toUpperCase();
  if (exchange !== "NSE" && exchange !== "BSE") continue;
  const segment = String(row.segment || "").trim().toUpperCase();
  const etf = fundInF(row);
  if (!etf && !keepSold(exchange, segment, row.trading_symbol, row.isin)) continue;
  const ticker = tickerOf(row.trading_symbol, segment);
  if (!ticker || /-RE\d*$/.test(ticker)) continue;
  const isin = isinOf(row.isin);
  if (!isin || !keepSold(exchange, segment, ticker, isin, etf || isin.startsWith("INF"))) continue;
  const key = `${exchange}|${ticker}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = String(row.company_name || "").replace(/\s+/g, " ").trim() || ticker;
  listings.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency: "INR",
    type: "EQ",
    raw: [ticker, name, exchange, isin].filter(Boolean).join(" "),
    isin,
    ...(exchange === "BSE" ? { group: segment } : {}),
  });
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("hdfcsky-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
