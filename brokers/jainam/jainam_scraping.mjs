// What Jainam Broking (India) sells in shares and ETFs, with no login. It
// publishes no scrip master and no list of what it carries.
//
// NSE and BSE. The pricing page prices online equity orders with no excluded
// segment, group or kind of listed share: Premium "Equity Delivery - 0.4%",
// "Equity/Future Intraday - 0.04%"; DIY "Equity Delivery - ₹ 20/order". Call
// & trade costs ₹70 per order more, so the book is the whole NSE and BSE
// cash book of the day, shares and ETFs, minus suspended, delisted and
// not-yet-listed lines, rights entitlements and fund units that are not ETFs
// (../bajaj/indiaBook.mjs). One row per exchange for a title on both, in
// INR.
//
// No US or other foreign place: the site has a US market holidays page and
// names Jainam IFSC Mavens (GIFT City), but no page offers US or other
// foreign shares to clients.
//
//   https://www.jainam.in/pricing/
//
//   node brokers/jainam/jainam_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.jainam.in/pricing/", [/Equity Delivery - 0\.4%/i, /Equity Delivery - \S{1,8} ?20\/order/i]);

const india = wholeIndia(await indiaLists());
const rows = stampRows(withoutObligations(india));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("jainam-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
