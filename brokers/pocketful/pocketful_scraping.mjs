// Pocketful publishes one public contract dump, with no login.
//
// https://media.pocketful.in/contracts_dump/latest/contracts_dump.csv
//   STOCK and ETF are the cash book. NSE carries the series on the
//   trading symbol. BSE symbols are bare, so that series comes from
//   the Upstox cash book. The ISIN is on the row. NFO, BFO, MCX,
//   bonds and the mutual-fund rows are not part of this catalogue.
//
//   node pocketful/pocketful_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { parseCsv, isinOf, seriesOf, keepSold, cashBook, lookup, companyName } from "../indianCash.mjs";

const FILE = "https://media.pocketful.in/contracts_dump/latest/contracts_dump.csv";

const response = await fetch(FILE);
if (!response.ok) throw new Error(`Pocketful contract dump answered ${response.status}`);
const book = await cashBook();
const listings = [];
const seen = new Set();

for (const row of parseCsv(await response.text())) {
  const exchange = row.exchange.trim().toUpperCase();
  if (exchange !== "NSE" && exchange !== "BSE") continue;
  const kind = row.asset_class.trim().toUpperCase();
  if (kind !== "STOCK" && kind !== "ETF") continue;
  const ticker = (row.trading_symbol || row.symbol).trim();
  if (!ticker) continue;
  const entry = lookup(book, exchange, ticker);
  const series = seriesOf(ticker) || entry?.series || "";
  const isin = isinOf(row.isin) || entry?.isin || "";
  if (!keepSold(exchange, series, ticker, isin, kind === "ETF")) continue;
  const key = `${exchange}|${ticker.toUpperCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = companyName(row.company || row.display_name, ticker, entry);
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
fs.writeFileSync(new URL("pocketful-parsed.json", import.meta.url), JSON.stringify(stampRows(listings), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
