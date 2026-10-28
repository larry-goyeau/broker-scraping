// What Bonanza (Bonanza Portfolio Ltd, India) sells in shares and ETFs,
// with no login. Bonanza's online retail broking runs on its Bigul brand
// ("Bonanza Portfolio Limited is a member of NSE & BSE", bigul.co), and its
// US offer runs through its GIFT City arm, Bonanza IFSC, which the
// "Global Investing" link on bonanzagroup.com opens.
//
// NSE and BSE: Bigul's own instrument master. Bigul's Symphony XTS
// market-data API serves the NSECM and BSECM masters with no login, as
// ../nirmalbang reads its own; each line carries the series or group and
// the ISIN. Shares (STOCK) and ETFs (INF lines, ETF type) are typed and
// filtered as in ./../bajaj/indiaBook.mjs: debt series, iNAV lines, fund
// units that are not ETFs, rights entitlements, BSE scrips the BSE lists as
// Suspended or Delisted and NSE lines listed after today are left out. One
// row per exchange for a title on both, in INR. Fees: "Rs 18* Flat
// brokerage per Order" (bigul.co/pricing).
//
// United States: Bonanza IFSC says, for resident Indians, "Direct Access To
// US Stocks & ETF Get Direct Access 12000+ Stocks and ETFs Listed in US Stock
// Exchanges" and prices "US Stocks / ETFs" at 0.25% (minimum $1) a trade
// (bonanzaifsc.com/pricing). No list is published. Under the owner's rule
// of 2026-10-25 a stated count is the N most popular titles of the place,
// so the book is the 12,000 lines of the US exchange book of the day
// (../wellstrade/usBook.mjs) with the largest traded value (last close times
// 30-day average volume, ./../bajaj/usTop.mjs), stocks and ETFs together as
// the page counts them. The number is read from the page at run time. The
// page names no exchange and no excluded kind. One row per title, USD.
//
// Left out: NSE International Exchange (GIFT City), which broker-list.json
// has as a place. Bonanza IFSC trades GIFT Nifty and Indian single-stock
// derivatives on NSE IX and India INX, and its product updates note "Top 50
// US Stocks" listed for IFSC accounts (NSE IX's unsponsored depository
// receipts); those are not shares or ETFs on a place this project prices,
// and Bonanza publishes no list of them.
//
//   https://bonanzagroup.com/
//   https://bonanzaifsc.com/
//   https://bonanzaifsc.com/pricing/
//   https://www.bigul.co/pricing
//   https://trading.bigul.co/apimarketdata/instruments/master
//     POST {"exchangeSegmentList":["NSECM","BSECM"]}
//
//   node brokers/bonanza/bonanza_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { indiaLists, masterIndia, xtsMaster } from "../bajaj/indiaBook.mjs";
import { usPopular } from "../bajaj/usTop.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

const MASTER = "https://trading.bigul.co/apimarketdata/instruments/master";

await pageSays("https://bonanzagroup.com/", [/Global Investing/i, /bonanzaifsc\.com/i], { raw: true });
await pageSays("https://www.bigul.co/pricing", [/Bonanza Portfolio Limited is a member of NSE & BSE/i, /Flat brokerage per Order/i]);
const ifsc = await pageSays("https://bonanzaifsc.com/", [/For Resident Indians :- Direct Access To US Stocks & ETF Get Direct Access [\d,]+\+ Stocks and ETFs Listed in US Stock Exchanges/i]);
const stated = Number(ifsc.match(/For Resident Indians :- Direct Access To US Stocks & ETF Get Direct Access ([\d,]+)\+ Stocks and ETFs/i)[1].replace(/,/g, ""));
if (!(stated >= 1000)) throw new Error(`Bonanza IFSC states ${stated} US titles`);

const lists = await indiaLists();
const india = masterIndia(lists, await xtsMaster(MASTER));
const book = await usBook();
const us = await usPopular(book, stated);
const rows = stampRows(withoutObligations([...india, ...us]));
if (rows.length < 18000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("bonanza-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
const { report } = us;
console.error(`US: ${stated} stated, ${report.ranked} in the book (${report.valued} with a traded value, ${report.sizedOnly} by size only, ${report.unknown} unknown to the scanner), ${report.kept} kept; dropped ${report.dropped.length}: ${report.dropped.slice(0, 40).join(" ")}${report.dropped.length > 40 ? " ..." : ""}`);
