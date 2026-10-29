// What Finance House Securities (FHS, Abu Dhabi) sells, with no login:
// every share and ETF of the Abu Dhabi Securities Exchange and the Dubai
// Financial Market, its two places, through the FHS Mobile Trading app and
// its e-trade account. The app's store page says it "grants you access to
// both ADX and DFM while allowing you to easily ... buy and sell stocks";
// the site's "Timing & Commissions" page gives the rates of both markets
// and nothing else. No page names a list of its own or excludes a board, so
// the book is both exchanges' own listings, read by
// ../alwathbah/uaeBook.mjs (what is kept and left out is written there).
// ETFs are kept: a whole-exchange broker sells them in the same book.
// Nasdaq Dubai is named nowhere and is left out. Everything trades in
// dirhams.
//
// Fees: "Timing & Commissions", "Broker commission 0.001250 AED 0.001250
// AED" (0.125% on DFM and on ADX), market 0.05% / 0.025%, CSD and SCA
// 0.05% each on DFM, a DFM order fee of AED 10; "All fees and commission
// are subject to VAT except SCA fees". The page dates the rates to 01
// September 2021.
//
//   https://www.fhs.ae/en/markets-html/timing-commissions/
//   https://apps.apple.com/us/app/fhs-mobile-trading/id1046375687
//
//   node brokers/financehouse/financehouse_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { adxListings, dfmListings } from "../alwathbah/uaeBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const FEES = "https://www.fhs.ae/en/markets-html/timing-commissions/";
const APP = "https://itunes.apple.com/lookup?id=1046375687";
const FLOOR = { "DFM STOCK": 55, "ADX STOCK": 80, "ADX ETF": 10 };

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8217;|&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

const fees = textOf(await get(FEES));
for (const pattern of [/Broker commission 0\.001250 AED 0\.001250 AED/, /DFM ADX/]) {
  if (!pattern.test(fees)) throw new Error(`${FEES} no longer says ${pattern}`);
}
const app = JSON.parse(await get(APP))?.results?.[0]?.description || "";
if (!/grants you access to both ADX and DFM/.test(app)) throw new Error(`the FHS Mobile Trading store page no longer says it grants access to both ADX and DFM`);
if (/Nasdaq Dubai/i.test(fees + app)) console.error("FHS now names Nasdaq Dubai: consider adding it");

const [dfm, adx] = await Promise.all([dfmListings(), adxListings()]);
const kept = stampRows(withoutObligations([...adx.rows, ...dfm.rows]));

const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, floor] of Object.entries(FLOOR)) if ((count[key] || 0) < floor) throw new Error(`only ${count[key] || 0} ${key} rows`);
fs.writeFileSync(new URL("financehouse-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const skipped = (leftOut) => Object.entries(leftOut).map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `financehouse: ${kept.length} rows; ` +
    Object.entries(count).map(([key, value]) => `${key} ${value}`).join(", ") +
    `. Left out: ADX ${skipped(adx.leftOut)}; DFM ${skipped(dfm.leftOut)}.`
);
