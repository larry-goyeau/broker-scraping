// Fyers publishes one public file per segment, with no login. The cash
// files have no header. Column 2 is the company name, column 6 the ISIN,
// column 10 the symbol with its series (NSE:20MICRONS-EQ).
//
// https://public.fyers.in/sym_details/NSE_CM.csv
// https://public.fyers.in/sym_details/BSE_CM.csv
//
// INDEX and the debt series sit in the same file. They are not part of
// this catalogue. There is no public flag for a mutual fund that can be
// bought, so only the exchange-listed share and ETF stay.
//
//   node fyers/fyers_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { parseGrid, isinOf, seriesOf, keepSold } from "../indianCash.mjs";

const FILES = [
  ["NSE", "https://public.fyers.in/sym_details/NSE_CM.csv"],
  ["BSE", "https://public.fyers.in/sym_details/BSE_CM.csv"],
];

const listings = [];
const seen = new Set();

for (const [exchange, url] of FILES) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  for (const cells of parseGrid(await response.text())) {
    const symbol = cells[9] || "";
    const ticker = symbol.includes(":") ? symbol.split(":").pop() : symbol;
    if (!ticker) continue;
    const isin = isinOf(cells[5]);
    if (!keepSold(exchange, seriesOf(ticker), ticker, isin)) continue;
    const key = `${exchange}|${ticker.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = String(cells[1] || "").replace(/\s+/g, " ").trim() || ticker;
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
fs.writeFileSync(new URL("fyers-parsed.json", import.meta.url), JSON.stringify(stampRows(listings), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
