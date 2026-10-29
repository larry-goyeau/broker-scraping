// What Aditya Birla Money (Aditya Birla Money Ltd, India) sells in shares
// and ETFs, with no login. It publishes no scrip master and no list of what
// it carries.
//
// NSE and BSE. Its "ABML Digital Only Offer" prices online orders with no
// excluded segment, group or kind of listed share: "Standard Plan Delivery
// 0.10% Intraday & Futures 0.01%", or Trade5 / Trade10 ("Rs. 5 per order",
// "Rs. 10 per order" after a subscription), so the book is the whole NSE and
// BSE cash book of the day, shares and ETFs, minus suspended, delisted and
// not-yet-listed lines, rights entitlements and fund units that are not ETFs
// (../bajaj/indiaBook.mjs). One row per exchange for a title on both, in
// INR.
//
// United States. The "US investing" page: "Invest in US Stock Markets",
// through "View Trade Securities Inc. (Member FINRA, SIPC)", with custody at
// Apex Clearing holding "stocks / ETFs / Fractional shares listed on US
// markets"; account opening "is 100% paperless and online". Fees: Gold plan
// "$0.01/Share subject to minimum of $1.99", Platinum minimum $0.49. No
// list, no number of titles and no excluded exchange or kind is given, so
// the book is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs, less warrants, rights, units, when-issued lines,
// listed notes and halted lines). One row per title on its primary listing
// (one NBBO market), USD.
//
// The old adityabirlamoney.com domain no longer answers; the broker's pages
// are on stocksandsecurities.adityabirlacapital.com.
//
//   https://stocksandsecurities.adityabirlacapital.com/campaign.aspx
//   https://stocksandsecurities.adityabirlacapital.com/global-investing
//
//   node brokers/adityabirlamoney/adityabirlamoney_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://stocksandsecurities.adityabirlacapital.com/campaign.aspx", [/Standard Plan Delivery 0\.10% Intraday & Futures 0\.01%/i]);
await pageSays("https://stocksandsecurities.adityabirlacapital.com/global-investing", [/Invest in US Stock Markets/i, /partnered with View Trade Securities Inc/i, /stocks \/ ETFs \/ Fractional shares listed on US markets/i, /\$0\.01\/Share subject to minimum of \$1\.99/i]);

const india = wholeIndia(await indiaLists());
const us = await usBook();
const rows = stampRows(withoutObligations([...india, ...us]));
if (rows.filter((row) => row.currency === "INR").length < 7000) throw new Error(`only ${rows.length} rows`);
if (rows.filter((row) => row.currency === "USD").length < 8000) throw new Error(`only ${rows.filter((row) => row.currency === "USD").length} US rows`);
fs.writeFileSync(new URL("adityabirlamoney-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.currency === "USD" ? "US" : row.exchange} ${row.type}`] = (counts[`${row.currency === "USD" ? "US" : row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
