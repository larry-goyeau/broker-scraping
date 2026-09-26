// Zebu publishes one public zip per segment, with no login. The host
// is the Mynt platform.
//
// https://go.mynt.in/NSE_symbols.txt.zip
// https://go.mynt.in/BSE_symbols.txt.zip
//
// The Instrument column is the series. There is no ISIN. It is joined
// from the NSE list and the Upstox cash book when the symbol matches.
// Indices and debt series are not part of this catalogue.
//
//   node zebu/zebu_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { parseCsv, keepSold, cashBook, lookup, companyName } from "../indianCash.mjs";

function zipText(buffer) {
  const signature = buffer.readUInt32LE(0);
  if (signature !== 0x04034b50) throw new Error("Zebu archive is not a zip");
  const method = buffer.readUInt16LE(8);
  const compressed = buffer.readUInt32LE(18);
  const nameLength = buffer.readUInt16LE(26);
  const extraLength = buffer.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + compressed);
  if (method === 0) return data.toString("utf8");
  if (method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`Zebu archive method ${method} is not readable`);
}

const FILES = [
  "https://go.mynt.in/NSE_symbols.txt.zip",
  "https://go.mynt.in/BSE_symbols.txt.zip",
];

const book = await cashBook();
const listings = [];
const seen = new Set();

for (const url of FILES) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const text = zipText(Buffer.from(await response.arrayBuffer()));
  for (const row of parseCsv(text)) {
    const exchange = row.Exchange.trim().toUpperCase();
    if (exchange !== "NSE" && exchange !== "BSE") continue;
    const ticker = row.TradingSymbol.trim();
    if (!ticker) continue;
    const entry = lookup(book, exchange, ticker);
    const isin = entry?.isin || "";
    if (!keepSold(exchange, row.Instrument, ticker, isin)) continue;
    const key = `${exchange}|${ticker.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = companyName(row.Symbol, ticker, entry);
    listings.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency: "INR",
      type: "EQ",
      raw: [ticker, name, exchange, isin].filter(Boolean).join(" "),
      isin,
    });
  }
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("zebu-parsed.json", import.meta.url), JSON.stringify(stampRows(listings), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
