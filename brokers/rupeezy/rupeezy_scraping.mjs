// Rupeezy publishes one public master, with no login.
//
// https://static.rupeezy.in/master.csv
//   NSE_EQ and BSE_EQ are the cash book. The series is on the row, and
//   so is the ISIN. A blank ISIN is filled from the NSE list or the
//   Upstox cash book when the symbol matches. F&O, MCX, indices and
//   debt series are not part of this catalogue.
//
//   node rupeezy/rupeezy_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { parseCsv, isinOf, keepSold, cashBook, lookup, companyName } from "../indianCash.mjs";

const FILE = "https://static.rupeezy.in/master.csv";
const VENUE = { NSE_EQ: "NSE", BSE_EQ: "BSE" };

const response = await fetch(FILE);
if (!response.ok) throw new Error(`Rupeezy master answered ${response.status}`);
const book = await cashBook();
const listings = [];
const seen = new Set();

for (const row of parseCsv(await response.text())) {
  const exchange = VENUE[row.exchange.trim().toUpperCase()];
  if (!exchange) continue;
  const symbol = row.symbol.trim();
  const series = row.series.trim().toUpperCase();
  if (!symbol || !series) continue;
  const ticker = symbol.toUpperCase().endsWith(`-${series}`) ? symbol : `${symbol}-${series}`;
  const entry = lookup(book, exchange, ticker);
  const isin = isinOf(row.isin_code) || entry?.isin || "";
  if (!keepSold(exchange, series, ticker, isin)) continue;
  const key = `${exchange}|${ticker.toUpperCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = companyName(row.security_desc, ticker, entry);
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

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("rupeezy-parsed.json", import.meta.url), JSON.stringify(stampRows(listings), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
