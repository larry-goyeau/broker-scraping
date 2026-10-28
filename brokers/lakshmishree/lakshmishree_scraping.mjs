// What Lakshmishree (Lakshmishree Investment & Securities Pvt Ltd, India)
// sells in shares and ETFs, with no login. Lakshmishree publishes no scrip
// master and no list of what it carries.
//
// NSE and BSE. Its brokerage calculator prices equity delivery and
// intraday on the NSE and the BSE ("Rs 8 Per Executed Order", "Rs 17 Per
// Executed Order", or a fixed monthly plan) with no excluded segment,
// group or kind of listed share, so the book is the whole NSE and BSE cash
// book of the day, shares and ETFs, minus suspended, delisted and
// not-yet-listed lines, rights entitlements and fund units that are not
// ETFs (../bajaj/indiaBook.mjs). One row per exchange for a title on both,
// in INR.
//
// United States. The global investing page: "Invest in top US stocks and
// global themes securely from India" and "Buy global stocks and ETFs and
// track your investments from one platform", held with "top-tier US
// regulated clearing partners (e.g., DriveWealth/Apex)". It names no
// partner platform, no exchange, no excluded kind and no number of titles
// ("top" is not a count), so the book is the whole US exchange book of the
// day (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs, less warrants, rights, units, when-issued lines,
// listed notes and halted lines). One row per title, USD.
//
//   https://www.lakshmishree.com/brokerage-calculator/
//   https://www.lakshmishree.com/global-investing
//
//   node brokers/lakshmishree/lakshmishree_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.lakshmishree.com/brokerage-calculator/", [/Rs 8 Per Executed Order/i, /Rs 17 Per Executed Order/i, /Equity Delivery/i]);
await pageSays("https://www.lakshmishree.com/global-investing", [
  /Invest in top US stocks and global themes/i,
  /Buy global stocks and ETFs and track your investments/i,
]);

const india = wholeIndia(await indiaLists());
const us = await usBook();
const rows = stampRows(withoutObligations([...india, ...us]));
if (rows.length < 18000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("lakshmishree-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
