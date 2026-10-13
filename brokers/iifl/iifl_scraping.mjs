// IIFL Securities publishes the cash book as one public file, with no login.
//
// http://content.indiainfoline.com/IIFLTT/Scripmaster.csv
//   Exch N is the NSE and B is the BSE. ExchType C is the cash book.
//   AllowedToTrade Y is a line that can be bought. The ISIN is on the
//   row. Name is the ticker. On the BSE the series is EQ or BE, not the
//   group, except XT and MT. Derivatives, currency and commodities are
//   other segments and are not here. Debt, a preference, a rights
//   entitlement and an iNAV stay out.
//
//   https://api.iiflsecurities.com/scrip-master.html
//
//   node brokers/iifl/iifl_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { parseCsv, isinOf, keepSold } from "../../indianCash.mjs";

const FILE = "http://content.indiainfoline.com/IIFLTT/Scripmaster.csv";
const EXCHANGE = { N: "NSE", B: "BSE" };

const response = await fetch(FILE);
if (!response.ok) throw new Error(`${FILE} answered ${response.status}`);

const listings = [];
const seen = new Set();

for (const row of parseCsv(await response.text())) {
  if (String(row.ExchType || "").trim().toUpperCase() !== "C") continue;
  if (String(row.AllowedToTrade || "").trim().toUpperCase() !== "Y") continue;
  const exchange = EXCHANGE[String(row.Exch || "").trim().toUpperCase()];
  if (!exchange) continue;
  const ticker = String(row.Name || "").trim().toUpperCase();
  if (!ticker || /-RE\d*$/.test(ticker)) continue;
  const series = String(row.Series || "").trim().toUpperCase();
  const isin = isinOf(row.ISIN);
  if (!isin || !keepSold(exchange, series, ticker, isin)) continue;
  const key = `${exchange}|${isin}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = String(row.FullName || "").replace(/\s+/g, " ").trim() || ticker;
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
fs.writeFileSync(new URL("iifl-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${listings.length} listings (${withIsin} with an ISIN)`);
