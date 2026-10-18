// Samco publishes the StockNote API scrip master as one public CSV, with no
// login.
//
// https://developers.stocknote.com/doc/ScripMaster.csv
//   nse_cm and bse_cm are the cash book; instrument EQ covers shares and
//   ETFs. NSE carries the series on the trading symbol. BSE symbols are
//   bare, so the BSE group, and every ISIN, come from the NSE list and the
//   Upstox cash book (indianCash.mjs). Rows that match no sold series are
//   debt, indices or iNAV lines and are left out. F&O, currency and
//   commodity segments are not part of this catalogue. Samco does not sell
//   US shares on samco.in, so there is no foreign market here.
//
//   node brokers/samco/samco_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { parseCsv, seriesOf, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FILE = "https://developers.stocknote.com/doc/ScripMaster.csv";
const SEGMENT = { nse_cm: "NSE", bse_cm: "BSE" };
const MIC = { NSE: "XNSE", BSE: "XBOM" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const book = await cashBook();
const listings = [];
const seen = new Set();

for (const row of parseCsv(await text(FILE))) {
  const exchange = SEGMENT[String(row.exchangeSegment).trim().toLowerCase()];
  if (!exchange) continue;
  if (String(row.instrument).trim().toUpperCase() !== "EQ") continue;
  const ticker = String(row.tradingSymbol).trim();
  if (!ticker) continue;
  const entry = lookup(book, exchange, ticker);
  const series = seriesOf(ticker) || entry?.series || "";
  const isin = entry?.isin || "";
  if (!keepSold(exchange, series, ticker, isin)) continue;
  // An exchange fund unit has an INF ISIN. The BSE F group (closed fund
  // units) is not a sold series and is already left out above.
  const etf = isin.startsWith("INF");
  const key = `${exchange}|${ticker.toUpperCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = companyName(row.name, ticker, entry);
  listings.push({
    query: ticker,
    ticker,
    name,
    exchange,
    mic: MIC[exchange],
    currency: "INR",
    type: etf ? "ETF" : "STOCK",
    isin,
    raw: [ticker, name, exchange, series, isin].filter(Boolean).join(" "),
  });
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("samco-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const written = withoutObligations(listings);
const counts = {};
for (const row of written) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${written.length} listings (${written.filter((row) => row.isin).length} with an ISIN)`, counts);
