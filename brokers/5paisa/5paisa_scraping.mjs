// 5paisa publishes the exchange master as one public file, with no login.
//
// https://images.5paisa.com/website/scripmaster-csv-format.csv
//   ExchType C is the cash book. The series says what the line is, and
//   the ISIN is on the row, and a blank one is filled when the symbol
//   matches the NSE list or the Upstox cash book. AllowedToTrade is Y on an iNAV line as well,
//   so the symbol is what drops a quote. Bonds and contracts are not
//   part of this catalogue.
//
//   node 5paisa/5paisa_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { parseCsv, isinOf, keepSold, cashBook, lookup, companyName } from "../indianCash.mjs";

const FILE = "https://images.5paisa.com/website/scripmaster-csv-format.csv";
const VENUE = { N: "NSE", B: "BSE" };

const response = await fetch(FILE);
if (!response.ok) throw new Error(`5paisa scrip master answered ${response.status}`);
const book = await cashBook();
const listings = [];
const seen = new Set();

for (const row of parseCsv(await response.text())) {
  if (row.ExchType.trim().toUpperCase() !== "C") continue;
  const exchange = VENUE[row.Exch.trim().toUpperCase()];
  if (!exchange) continue;
  const ticker = row.Name.trim();
  if (!ticker) continue;
  const entry = lookup(book, exchange, ticker);
  const isin = isinOf(row.ISIN) || entry?.isin || "";
  if (!keepSold(exchange, row.Series, ticker, isin)) continue;
  const key = `${exchange}|${ticker.toUpperCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = companyName(row.FullName, ticker, entry);
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
fs.writeFileSync(new URL("5paisa-parsed.json", import.meta.url), JSON.stringify(stampRows(listings), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
