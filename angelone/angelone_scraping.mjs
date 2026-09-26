// Angel One publishes the exchange master as one public file, with no login.
//
// https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json
//   A cash NSE symbol carries its series (ADANIENSOL-EQ). A cash BSE
//   symbol does not, so the series is taken from the Upstox cash book
//   for that same symbol. There is no ISIN. It is joined from the NSE
//   list and from Upstox. AMXIDX is an index. Bonds and contracts are
//   not part of this catalogue.
//
//   node angelone/angelone_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";
import { seriesOf, keepSold, cashBook, lookup, companyName } from "../indianCash.mjs";

const FILE = "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json";

const response = await fetch(FILE);
if (!response.ok) throw new Error(`Angel One scrip master answered ${response.status}`);
const book = await cashBook();
const listings = [];
const seen = new Set();

for (const row of await response.json()) {
  const exchange = String(row.exch_seg || "").trim().toUpperCase();
  if (exchange !== "NSE" && exchange !== "BSE") continue;
  if (String(row.instrumenttype || "").trim().toUpperCase() === "AMXIDX") continue;
  const ticker = String(row.symbol || "").trim();
  if (!ticker) continue;
  const entry = lookup(book, exchange, ticker);
  const series = exchange === "BSE" ? entry?.series || "" : seriesOf(ticker);
  if (!series) continue;
  const isin = entry?.isin || "";
  if (!keepSold(exchange, series, ticker, isin)) continue;
  const key = `${exchange}|${ticker.toUpperCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = companyName(row.name, ticker, entry);
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
fs.writeFileSync(new URL("angelone-parsed.json", import.meta.url), JSON.stringify(stampRows(listings), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
