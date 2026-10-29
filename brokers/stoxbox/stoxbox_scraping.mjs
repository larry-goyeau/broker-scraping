// What StoxBox (BP Equities Pvt Ltd, India) sells in shares and ETFs, with
// no login. It publishes no scrip master and no list of what it carries.
//
// NSE and BSE. The trading charges page: "Equity delivery ... Brokerage
// 0.30% or 3P/ share (whichever is higher)", intraday "0.03% or 3P/ share".
// No segment, group or kind of listed share is excluded, so the book is the
// whole NSE and BSE cash book of the day, shares and ETFs, minus suspended,
// delisted and not-yet-listed lines, rights entitlements and fund units that
// are not ETFs (../bajaj/indiaBook.mjs). One row per exchange for a title on
// both, in INR.
//
// No US or other foreign place: StoxBox offers equities, F&O and mutual
// funds only. StoxBox is BP Equities' online platform; BP Wealth
// (bpwealth.com, the same SEBI registration INZ000176539) has no separate
// catalogue.
//
//   https://stoxbox.in/trading-charges/
//
//   node brokers/stoxbox/stoxbox_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://stoxbox.in/trading-charges/", [/Brokerage 0\.30% or 3P\/ share \(whichever is higher\)/i]);

const india = wholeIndia(await indiaLists());
const rows = stampRows(withoutObligations(india));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("stoxbox-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
