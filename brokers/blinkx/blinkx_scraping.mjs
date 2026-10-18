// BlinkX (JM Financial) publishes its instrument list as one public CSV per
// exchange, in the Kite layout, with no login.
//
// https://api.blinkx.in/instruments/NSE
// https://api.blinkx.in/instruments/BSE
//   https://api.blinkx.in/instruments is the same list with the NFO, BFO,
//   CDS and MCX contracts added. An NSE trading symbol carries its series
//   (RELIANCE-EQ). A BSE symbol does not, so the group is taken from the
//   Upstox cash book for that same symbol. There is no ISIN on the row; it
//   is joined from the NSE equity list and Upstox. Indices (no trading
//   symbol), debt series, iNAV lines and rights entitlements are not part
//   of this catalogue.
//
//   node brokers/blinkx/blinkx_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { parseCsv, seriesOf, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

const FILES = [
  { url: "https://api.blinkx.in/instruments/NSE", exchange: "NSE", mic: "XNSE" },
  { url: "https://api.blinkx.in/instruments/BSE", exchange: "BSE", mic: "XBOM" },
];
const FLOOR = { NSE: 2500, BSE: 3500 };
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };

// An NSE line must carry an NSE series; ZP and the like are BSE codes,
// and on the NSE they are debt.
const NSE_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST", "IV", "RR"]);

// A rights entitlement has security code 20 in its ISIN (INE002A20018).
const rightsEntitlement = (ticker, isin) => /-RE\d*$/i.test(ticker) || /^INE.{4}20/.test(isin);

const book = await cashBook();
const listings = [];
const seen = new Set();

for (const file of FILES) {
  const response = await fetch(file.url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${file.url} answered ${response.status}`);
  for (const row of parseCsv(await response.text())) {
    const exchange = String(row.exchange || "").trim().toUpperCase();
    if (exchange !== file.exchange) continue;
    if (String(row.instrument_type || "").trim().toUpperCase() !== "EQ") continue;
    const ticker = String(row.tradingsymbol || "").trim();
    if (!ticker) continue;
    const entry = lookup(book, exchange, ticker);
    const series = exchange === "NSE" ? seriesOf(ticker) : entry?.series || "";
    if (!series) continue;
    const isin = entry?.isin || "";
    if (exchange === "NSE" && !NSE_SERIES.has(series)) continue;
    if (/^INAV/i.test(String(row.name || "").trim())) continue;
    if (!keepSold(exchange, series, ticker, isin)) continue;
    if (rightsEntitlement(ticker, isin)) continue;
    const key = `${exchange}|${ticker.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = companyName(row.name, ticker, entry);
    listings.push({
      query: ticker,
      ticker,
      name,
      exchange,
      mic: file.mic,
      currency: "INR",
      type: "EQ",
      isin,
      raw: [ticker, name, exchange, series, isin].filter(Boolean).join(" "),
    });
  }
}

const counts = {};
for (const row of listings) counts[row.exchange] = (counts[row.exchange] || 0) + 1;
for (const [exchange, floor] of Object.entries(FLOOR)) {
  if ((counts[exchange] || 0) < floor) throw new Error(`${exchange} read looks short: ${counts[exchange] || 0} < ${floor}`);
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("blinkx-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${JSON.stringify(counts)}, ${listings.length} listings (${withIsin} with an ISIN)`);
