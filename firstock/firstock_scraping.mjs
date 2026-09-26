// Firstock publishes one public file per segment, with no login.
//
// https://api.firstock.in/V1/symbols/NSE
// https://api.firstock.in/V1/symbols/BSE
//
// The series is the suffix of the trading symbol. On BSE the symbol is
// bare, so the series is taken from the Upstox cash book. The ISIN is
// on the row. NFO, BFO, indices and debt series are not part of this
// catalogue.
//
//   node firstock/firstock_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { parseCsv, isinOf, seriesOf, keepSold, cashBook, lookup, companyName } from "../indianCash.mjs";

const FILES = [
  "https://api.firstock.in/V1/symbols/NSE",
  "https://api.firstock.in/V1/symbols/BSE",
];

const book = await cashBook();
const listings = [];
const seen = new Set();

for (const url of FILES) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  for (const row of parseCsv(await response.text())) {
    const exchange = row.Exchange.trim().toUpperCase();
    if (exchange !== "NSE" && exchange !== "BSE") continue;
    const ticker = row.TradingSymbol.trim();
    if (!ticker) continue;
    const entry = lookup(book, exchange, ticker);
    const series = seriesOf(ticker) || entry?.series || "";
    const isin = isinOf(row.ISIN) || entry?.isin || "";
    if (!keepSold(exchange, series, ticker, isin)) continue;
    const key = `${exchange}|${ticker.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = companyName(row.CompanyName, ticker, entry);
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
fs.writeFileSync(new URL("firstock-parsed.json", import.meta.url), JSON.stringify(stampRows(listings), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
