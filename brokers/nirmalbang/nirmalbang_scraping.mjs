// Nirmal Bang publishes the instrument master of its Symphony XTS market-data
// API with no login. One POST returns both cash segments as pipe-delimited
// text.
//
// POST https://xts.nirmalbang.com/apimarketdata/instruments/master
//   body {"exchangeSegmentList":["NSECM","BSECM"]}
//   Fields: segment | instrument id | type | name | description | series |
//   name with series | id | band high | band low | freeze qty | tick | lot |
//   multiplier | display name | ISIN | ... The series is the NSE series or
//   the BSE group. The ISIN is on the row. Debt series, BSE InvIT units
//   (IF), NS/NT/SPOT lines, iNAV lines and rights entitlements are not part
//   of this catalogue. NSEFO, BSEFO, NSECD and MCXFO are contracts.
//
//   node brokers/nirmalbang/nirmalbang_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { isinOf, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

const URL_MASTER = "https://xts.nirmalbang.com/apimarketdata/instruments/master";
const SEGMENTS = { NSECM: { exchange: "NSE", mic: "XNSE" }, BSECM: { exchange: "BSE", mic: "XBOM" } };
const FLOOR = { NSE: 2500, BSE: 3500 };
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  "Content-Type": "application/json",
};

// An NSE line must carry an NSE series; ZP and the like are BSE codes,
// and on the NSE they are debt.
const NSE_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST", "IV", "RR"]);

// A rights entitlement has security code 20 in its ISIN (INE002A20018).
const rightsEntitlement = (ticker, isin) => /-RE\d*$/i.test(ticker) || /^INE.{4}20/.test(isin);

const response = await fetch(URL_MASTER, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({ exchangeSegmentList: Object.keys(SEGMENTS) }),
});
if (!response.ok) throw new Error(`Nirmal Bang master answered ${response.status}`);
const payload = await response.json();
if (payload.type !== "success" || typeof payload.result !== "string") throw new Error(`Nirmal Bang master: ${payload.description || "no result"}`);

const book = await cashBook();
const listings = [];
const seen = new Set();

for (const line of payload.result.split("\n")) {
  const cells = line.split("|");
  const segment = SEGMENTS[cells[0]];
  if (!segment) continue;
  const { exchange, mic } = segment;
  const ticker = String(cells[3] || "").trim();
  if (!ticker) continue;
  const series = String(cells[5] || "").trim().toUpperCase();
  const entry = lookup(book, exchange, ticker);
  const isin = isinOf(cells[15]) || entry?.isin || "";
  if (exchange === "NSE" && !NSE_SERIES.has(series)) continue;
  if (/^INAV/i.test(String(cells[18] || "").trim())) continue;
  if (!keepSold(exchange, series, ticker, isin)) continue;
  if (rightsEntitlement(ticker, isin)) continue;
  const key = `${exchange}|${ticker.toUpperCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  // The NSE description ends in the series (RELIANCE INDUSTRIES LTD-EQ).
  const printed = String(cells[18] || "").replace(new RegExp(`-${series}$`), "");
  const name = companyName(printed, ticker, entry);
  listings.push({
    query: ticker,
    ticker,
    name,
    exchange,
    mic,
    currency: "INR",
    type: "EQ",
    isin,
    raw: [ticker, name, exchange, series, isin].filter(Boolean).join(" "),
  });
}

const counts = {};
for (const row of listings) counts[row.exchange] = (counts[row.exchange] || 0) + 1;
for (const [exchange, floor] of Object.entries(FLOOR)) {
  if ((counts[exchange] || 0) < floor) throw new Error(`${exchange} read looks short: ${counts[exchange] || 0} < ${floor}`);
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("nirmalbang-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${JSON.stringify(counts)}, ${listings.length} listings (${withIsin} with an ISIN)`);
