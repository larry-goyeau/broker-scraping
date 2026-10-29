// What Indbank Merchant Banking Services (Indian Bank's broking arm, India)
// sells in shares and ETFs, with no login. It publishes no scrip master and
// no list of what it carries.
//
// NSE and BSE. The home page: "Online stock trading and investing platform
// for all – Stocks, F&O, ETFs and IPO" (IndFortune app). The individual
// account opening form carries the brokerage slabs: "Cash Segment 0.10%
// 0.50% 0.05 Paise" (intraday, delivery, minimum). No segment, group or kind
// of listed share is excluded, so the book is the whole NSE and BSE cash
// book of the day, shares and ETFs, minus suspended, delisted and
// not-yet-listed lines, rights entitlements and fund units that are not ETFs
// (../bajaj/indiaBook.mjs). One row per exchange for a title on both, in
// INR.
//
// No US or other foreign place: Indbank offers Indian shares, F&O, ETFs,
// IPOs, bonds and NPS only.
//
//   https://www.indbankonline.com/
//   https://www.indbankonline.com/wp-content/uploads/2025/10/Account-Opening-Form1new-INDIVIDUAL.pdf
//
//   node brokers/indbank/indbank_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.indbankonline.com/", [/Online stock trading and investing platform for all \S{1,10} ?Stocks, F&O, ETFs and IPO/i]);

// The fee schedule is a PDF; it must still be there.
const pdf = await fetch("https://www.indbankonline.com/wp-content/uploads/2025/10/Account-Opening-Form1new-INDIVIDUAL.pdf", { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Range: "bytes=0-1023" }, signal: AbortSignal.timeout(60_000) });
if (!pdf.ok || !(await pdf.text()).startsWith("%PDF")) throw new Error(`the brokerage PDF is gone: ${pdf.status}`);

const india = wholeIndia(await indiaLists());
const rows = stampRows(withoutObligations(india));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("indbank-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
