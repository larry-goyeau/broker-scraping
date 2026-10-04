// What Profitmart sells in cash, with no login. Two public zips on the
// ProfitMax host, the same Noren layout as Shoonya.
//
// https://profitmax.profitmart.in/NSE_symbols.txt.zip
// https://profitmax.profitmart.in/BSE_symbols.txt.zip
//
// The Instrument column is the series. There is no ISIN. It is joined
// from the NSE list and the Upstox cash book when the symbol matches.
// Indices and debt series are not part of this catalogue. Mutual funds
// are offered and are not in these files.
//
//   node brokers/profitmart/profitmart_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { parseCsv, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

function zipText(buffer) {
  const signature = buffer.readUInt32LE(0);
  if (signature !== 0x04034b50) throw new Error("Profitmart archive is not a zip");
  const method = buffer.readUInt16LE(8);
  const compressed = buffer.readUInt32LE(18);
  const nameLength = buffer.readUInt16LE(26);
  const extraLength = buffer.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + compressed);
  if (method === 0) return data.toString("utf8");
  if (method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`Profitmart archive method ${method} is not readable`);
}

const FILES = [
  "https://profitmax.profitmart.in/NSE_symbols.txt.zip",
  "https://profitmax.profitmart.in/BSE_symbols.txt.zip",
];

const book = await cashBook();
const listings = [];
const seen = new Set();

for (const url of FILES) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const text = zipText(archive);
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
fs.writeFileSync(new URL("profitmart-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
const byExchange = new Map();
for (const row of listings) byExchange.set(row.exchange, (byExchange.get(row.exchange) || 0) + 1);
console.error(
  `${listings.length} listings (${withIsin} with an ISIN) ` +
    `(${[...byExchange].map(([venue, count]) => `${count} ${venue}`).join(", ")})`
);
