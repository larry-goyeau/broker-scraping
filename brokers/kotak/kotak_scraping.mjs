// Kotak Securities (Kotak Neo) publishes its scrip master as one public CSV
// per segment and per day, with no login.
//
// https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod/<YYYY-MM-DD>/transformed/nse_cm.csv
// https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod/<YYYY-MM-DD>/transformed/bse_cm.csv
//   The file for today only appears after the morning build, and there is
//   none for some holidays, so the newest date that answers is taken,
//   walking back a week. The transformed-v1 files carry the same rows with
//   one more column. pGroup is the NSE series or the BSE group, and the ISIN
//   is on the row. Indices, government and corporate debt series, MF units
//   on the NSE (series MF), BSE InvIT units (IF), iNAV lines and rights
//   entitlements are not part of this catalogue. NFO, BFO, CDS and MCX are
//   contracts.
//
//   node brokers/kotak/kotak_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { parseCsv, isinOf, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

const BASE = "https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod";
const SEGMENTS = [
  { file: "nse_cm", exchange: "NSE", mic: "XNSE" },
  { file: "bse_cm", exchange: "BSE", mic: "XBOM" },
];
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

async function latest() {
  for (let offset = 0; offset < 8; offset += 1) {
    const date = day(offset);
    const texts = [];
    for (const segment of SEGMENTS) {
      const response = await fetch(`${BASE}/${date}/transformed/${segment.file}.csv`, { headers: HEADERS });
      if (!response.ok) break;
      texts.push(await response.text());
    }
    if (texts.length === SEGMENTS.length) return { date, texts };
  }
  throw new Error("No Kotak scrip master answered in the last week");
}

const { date, texts } = await latest();
const book = await cashBook();
const listings = [];
const seen = new Set();

SEGMENTS.forEach((segment, index) => {
  for (const row of parseCsv(texts[index])) {
    const exchange = String(row.pExchange || "").trim().toUpperCase();
    if (exchange !== segment.exchange) continue;
    const ticker = String(row.pTrdSymbol || "").trim();
    if (!ticker) continue;
    const series = String(row.pGroup || "").trim().toUpperCase();
    const entry = lookup(book, exchange, ticker);
    const isin = isinOf(row.pISIN) || entry?.isin || "";
    if (exchange === "NSE" && !NSE_SERIES.has(series)) continue;
    if (/^INAV/i.test(String(row.pDesc || "").trim())) continue;
    if (!keepSold(exchange, series, ticker, isin)) continue;
    if (rightsEntitlement(ticker, isin)) continue;
    const key = `${exchange}|${ticker.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = companyName(row.pDesc, ticker, entry);
    listings.push({
      query: ticker,
      ticker,
      name,
      exchange,
      mic: segment.mic,
      currency: "INR",
      type: "EQ",
      isin,
      raw: [ticker, name, exchange, series, isin].filter(Boolean).join(" "),
    });
  }
});

const counts = {};
for (const row of listings) counts[row.exchange] = (counts[row.exchange] || 0) + 1;
for (const [exchange, floor] of Object.entries(FLOOR)) {
  if ((counts[exchange] || 0) < floor) throw new Error(`${exchange} read looks short: ${counts[exchange] || 0} < ${floor}`);
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("kotak-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const withIsin = listings.filter((row) => row.isin).length;
console.error(`scrip master of ${date}: ${JSON.stringify(counts)}, ${listings.length} listings (${withIsin} with an ISIN)`);
