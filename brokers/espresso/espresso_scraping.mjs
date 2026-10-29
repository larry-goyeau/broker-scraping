// What Espresso (Espresso Financial Services Pvt Ltd, India) sells in shares
// and ETFs, with no login. It publishes no scrip master and no list of what
// it carries.
//
// NSE and BSE. The charges page: equity delivery "Zero brokerage for full
// cash-and-carry orders", intraday "0.03% or Rs 20 for every executed order
// (whichever is lower)". No segment, group or kind of listed share is
// excluded, so the book is the whole NSE and BSE cash book of the day,
// shares and ETFs, minus suspended, delisted and not-yet-listed lines,
// rights entitlements and fund units that are not ETFs
// (../bajaj/indiaBook.mjs). One row per exchange for a title on both, in
// INR.
//
// No US or other foreign place: Espresso offers Indian equity, F&O,
// commodity and currency only.
//
//   https://www.myespresso.com/charges
//
//   node brokers/espresso/espresso_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.myespresso.com/charges", [/Zero brokerage for full cash-and-carry orders/i]);

const india = wholeIndia(await indiaLists());
const rows = stampRows(withoutObligations(india));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("espresso-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
