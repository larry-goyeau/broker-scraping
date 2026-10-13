// Paytm Money publishes the cash book as two public files, with no login.
//
// https://developer.paytmmoney.com/data/v1/scrips/equity_security_master.csv
//   ES is a share. NSE and BSE. The series is on the row.
// https://developer.paytmmoney.com/data/v1/scrips/etf_security_master.csv
//   ETF is an exchange fund, kept apart from the share file.
//
// There is no ISIN. It is joined from the NSE list and the Upstox cash
// book when the symbol matches. Options, futures and indices are other
// files and are not here. A preference (E1) and the SZ series are not a
// sold series and stay out. An iNAV stays out.
//
//   https://developer.paytmmoney.com/docs/api/security-master/
//
//   node brokers/paytmmoney/paytmmoney_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { parseCsv, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

const FILES = [
  ["https://developer.paytmmoney.com/data/v1/scrips/equity_security_master.csv", false],
  ["https://developer.paytmmoney.com/data/v1/scrips/etf_security_master.csv", true],
];

const book = await cashBook();
const listings = [];
const seen = new Set();

for (const [url, etf] of FILES) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  for (const row of parseCsv(await response.text())) {
    const exchange = row.exchange.trim().toUpperCase();
    if (exchange !== "NSE" && exchange !== "BSE") continue;
    const kind = row.instrument_type.trim().toUpperCase();
    if (etf ? kind !== "ETF" : kind !== "ES") continue;
    const ticker = row.symbol.trim();
    if (!ticker) continue;
    const entry = lookup(book, exchange, ticker);
    const isin = entry?.isin || "";
    if (!keepSold(exchange, row.series, ticker, isin, etf)) continue;
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
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("paytmmoney-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
