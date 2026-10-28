// What Webull South Africa (Webull Securities South Africa (Pty) Ltd, FSP
// 50863, webull.co.za) sells, with no login. Its only live market is the
// US ("SA Stocks (Coming soon)" in the site menu); the US stocks page says
// "Easily invest in Stocks and ETFs with Webull" and "Trade stocks,
// options, and ETFs effortlessly". The footer says "International
// financial products and services are offered to self-directed clients by
// Webull Securities (Australia) Pty Ltd", so the account sits with Webull
// Australia. No webull.co.za page names a board, a segment or a kind of
// listed share or fund left out, so the catalogue is the whole US exchange
// book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt.
//
//   https://www.webull.co.za/us-stocks
//   https://www.webull.co.za/help/category/252   (Trading in US Markets FAQ)
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no webull.co.za
// page offers them, and Webull Australia, which holds the account, says
// "We can only support liquidation of OTC stocks if you have positions of
// OTC symbols" (https://www.webull.com.au/help/faq/1460). The US is one
// NBBO market: one row per title, on its primary listing, in dollars.
//
// Remarks, not removals: "South African residents must obtain the necessary
// tax clearance certificates to use their foreign investment allowance
// when funding their international investment account" (footer); ADRs
// carry a DTC custody fee of "US$ 0.01 – 0.03 per Share".
//
// Fees (US Stocks/ETFs: "US$ 0 for the First Month", then "US$ 0.0025 x
// Total Trade Amount After the First Month(Min. US$0.50)", plus the CAT and
// SEC pass-through fees; "FX Transfer Fee 50BP"):
//   https://www.webull.co.za/pricing
//
//   node brokers/webullsouthafric/webullsouthafric_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.webull.co.za/pricing", [
  /US Stocks\/ETFs/,
  /US\$ 0\.0025 x Total Trade Amount After the First Month\s*\(Min\. US\$0\.50\)/,
]);
await pause();
await evidence("https://www.webull.co.za/us-stocks", [
  /Easily invest in Stocks and ETFs with Webull/,
  /SA Stocks \(Coming soon\)/,
  /offered to self-directed clients by Webull Securities \(Australia\)/,
]);
await pause();
await evidence("https://www.webull.com.au/help/faq/1460-Does-Webull-support-OTC-trading", [
  /only support liquidation of OTC stocks/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("webullsouthafric-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
