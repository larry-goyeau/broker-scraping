// Dhan publishes the exchange master as one public file, with no login.
//
// https://images.dhan.co/api-data/api-scrip-master-detailed.csv
//   NSE, BSE and MCX, contracts included. SEGMENT E is the cash book.
//   ES is a share, ETF is an exchange fund. The ISIN is in the file.
//   A missing ISIN is filled from the NSE list or the Upstox cash book
//   when the symbol matches once. Indices, iNAV lines, bonds and
//   contracts are not part of this catalogue.
//
// https://api-global-stocks.dhan.co/api-data/us-stock-scrip-master.csv
//   US cash stocks. NYSE Arca is written AMEX, which is the name the
//   catalogues use for that tape. Every row carries an ISIN.
//
//   node dhan/dhan_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { parseCsv, isinOf, keepSold, cashBook, lookup, companyName } from "../indianCash.mjs";

const FILE = "https://images.dhan.co/api-data/api-scrip-master-detailed.csv";
const US_FILE = "https://api-global-stocks.dhan.co/api-data/us-stock-scrip-master.csv";
const US_VENUE = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  "NYSE ARCA": "AMEX",
  CBOE: "CBOE",
};

const response = await fetch(FILE);
if (!response.ok) throw new Error(`Dhan scrip master answered ${response.status}`);
const book = await cashBook();
const listings = [];
const seen = new Set();

for (const row of parseCsv(await response.text())) {
  if (row.SEGMENT.trim().toUpperCase() !== "E") continue;
  const exchange = row.EXCH_ID.trim().toUpperCase();
  if (exchange !== "NSE" && exchange !== "BSE") continue;
  const ticker = row.UNDERLYING_SYMBOL.trim();
  if (!ticker) continue;
  const kind = row.INSTRUMENT_TYPE.trim().toUpperCase();
  const etf = kind === "ETF";
  if (kind !== "ES" && kind !== "INVITU" && kind !== "REIT" && !etf) continue;
  const entry = lookup(book, exchange, ticker);
  const isin = isinOf(row.ISIN) || entry?.isin || "";
  if (!keepSold(exchange, row.SERIES, ticker, isin, etf)) continue;
  const key = `${exchange}|${ticker.toUpperCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = companyName(row.SYMBOL_NAME, ticker, entry);
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

const usResponse = await fetch(US_FILE);
if (!usResponse.ok) throw new Error(`Dhan US list answered ${usResponse.status}`);
for (const row of parseCsv(await usResponse.text())) {
  if (row.SEGMENT.trim().toUpperCase() !== "E") continue;
  if (row.INSTRUMENT_NAME.trim().toUpperCase() !== "EQUITY") continue;
  const exchange = US_VENUE[row.CUSTOM_EXCH.trim().toUpperCase()];
  const ticker = (row.TRADING_SYMBOL || row.SYMBOL || "").trim();
  const isin = isinOf(row.ISIN_CODE);
  if (!exchange || !ticker || !isin) continue;
  const key = `${exchange}|${ticker.toUpperCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = (row.SYMBOL_NAME || row.CUSTOM_SYMBOL || ticker).replace(/\s+/g, " ").trim();
  listings.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency: "USD",
    type: "EQ",
    raw: [ticker, name, exchange, isin].filter(Boolean).join(" "),
    isin,
  });
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("dhan-parsed.json", import.meta.url), JSON.stringify(stampRows(listings), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
