// What Way2Wealth (India) sells in shares and ETFs, with no login. It
// publishes no scrip master and no list of what it carries.
//
// NSE and BSE. The online trading page: "DELIVERY BASED TRADE: 0.40% or 10
// paisa per share- whichever is higher. INTRADAY TRADE (Square off during
// the day): 0.04% per side or 5 paisa per share", minimum Rs. 25 per
// contract. No segment, group or kind of listed share is excluded, so the
// book is the whole NSE and BSE cash book of the day, shares and ETFs, minus
// suspended, delisted and not-yet-listed lines, rights entitlements and fund
// units that are not ETFs (../bajaj/indiaBook.mjs). One row per exchange for
// a title on both, in INR.
//
// Left out: "Global Investing". The site gives "Access to Global Investments
// for our clients in a referral arrangement with India INX-GA (BSE's IFSC
// entity) thru Interactive Brokers LLC": the account is opened with
// Interactive Brokers, not Way2Wealth, so it is not this broker's catalogue.
//
// The site answers slowly and sometimes not at all; pageSays retries.
//
//   https://www.way2wealth.com/offerings/online-trading/
//
//   node brokers/way2wealth/way2wealth_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.way2wealth.com/offerings/online-trading/", [/DELIVERY BASED TRADE: 0\.40% or 10 paisa per share/i]);

const india = wholeIndia(await indiaLists());
const rows = stampRows(withoutObligations(india));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("way2wealth-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
