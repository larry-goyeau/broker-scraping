// Nubra publishes its reference data as one public JSON per exchange and per
// day, with no login (about 37 MB for the NSE, 19 MB for the BSE).
//
// https://api.nubra.io/refdata/refdata/<YYYY-MM-DD>?exchange=NSE
// https://api.nubra.io/refdata/refdata/<YYYY-MM-DD>?exchange=BSE
//   Today's date is asked first, walking back a week if it does not answer.
//   The cash lines are derivative_type STOCK; the rest are options and
//   futures. The series is the NSE series or the BSE group, and the ISIN is
//   on the row. Nubra's NSE cash list is the main board only (EQ, BE, BZ):
//   it has no SME, REIT or InvIT lines, and its BSE list has no ETFs, so
//   neither is in this catalogue. BSE NS/NT lines, InvIT units (IF), debt
//   (F), warrants (W) and rights entitlements (R) are left out too.
//
//   node brokers/nubra/nubra_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { isinOf, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

const BASE = "https://api.nubra.io/refdata/refdata";
const VENUES = { NSE: "XNSE", BSE: "XBOM" };
const FLOOR = { NSE: 2500, BSE: 3500 };
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };

// An NSE line must carry an NSE series; ZP and the like are BSE codes,
// and on the NSE they are debt.
const NSE_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST", "IV", "RR"]);

// A rights entitlement has security code 20 in its ISIN (INE002A20018).
const rightsEntitlement = (ticker, isin) => /-RE\d*$/i.test(ticker) || /^INE.{4}20/.test(isin);

function day(offset) {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000 - offset * 86400 * 1000);
  return ist.toISOString().slice(0, 10);
}

async function refdata(exchange) {
  for (let offset = 0; offset < 8; offset += 1) {
    const response = await fetch(`${BASE}/${day(offset)}?exchange=${exchange}`, { headers: HEADERS });
    if (!response.ok) continue;
    const payload = await response.json();
    if (Array.isArray(payload.refdata) && payload.refdata.length) return payload.refdata;
  }
  throw new Error(`No Nubra ${exchange} refdata answered in the last week`);
}

const book = await cashBook();
const listings = [];
const seen = new Set();

for (const [exchange, mic] of Object.entries(VENUES)) {
  for (const row of await refdata(exchange)) {
    if (String(row.derivative_type || "").toUpperCase() !== "STOCK") continue;
    if (String(row.exchange || "").toUpperCase() !== exchange) continue;
    const ticker = String(row.stock_name || "").trim();
    if (!ticker) continue;
    const series = String(row.series || "").trim().toUpperCase();
    const entry = lookup(book, exchange, ticker);
    const isin = isinOf(row.isin) || entry?.isin || "";
    if (exchange === "NSE" && !NSE_SERIES.has(series)) continue;
    if (!keepSold(exchange, series, ticker, isin)) continue;
    if (rightsEntitlement(ticker, isin)) continue;
    const key = `${exchange}|${ticker.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = companyName("", ticker, entry);
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
}

const counts = {};
for (const row of listings) counts[row.exchange] = (counts[row.exchange] || 0) + 1;
for (const [exchange, floor] of Object.entries(FLOOR)) {
  if ((counts[exchange] || 0) < floor) throw new Error(`${exchange} read looks short: ${counts[exchange] || 0} < ${floor}`);
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("nubra-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`${JSON.stringify(counts)}, ${listings.length} listings (${withIsin} with an ISIN)`);
