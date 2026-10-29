// What Stoxkart (SEBI INZ000196835, India) sells in shares and ETFs, with no
// login. It publishes no scrip master and no list of what it carries.
//
// NSE and BSE. The pricing page: "Access 5,000+ NSE & BSE companies",
// Standard Plan "₹20 /per executed order" (equity delivery and intraday
// "Brokerage ₹20 per executed order"), or the Smart Trader Plan at ₹99 a
// month with ₹0 brokerage. No segment, group or kind of listed share is
// excluded. "5,000+" is a lower bound, not a cut: the day's book holds about
// 5,590 distinct companies (2026-10-28), so the stated figure is the whole
// book, not a top-N list; so the book is the whole NSE and BSE cash book of
// the day, shares and ETFs, minus suspended, delisted and not-yet-listed
// lines, rights entitlements and fund units that are not ETFs
// (../bajaj/indiaBook.mjs). One row per exchange for a title on both, in
// INR.
//
// No US or other foreign place: the site offers NSE, BSE, F&O, currency and
// commodity only.
//
//   https://www.stoxkart.com/pricing
//
//   node brokers/stoxkart/stoxkart_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.stoxkart.com/pricing", [/Access 5,000\+ NSE & BSE companies/i, /Brokerage \S{1,8}20 per executed order/i]);

const india = wholeIndia(await indiaLists());
const rows = stampRows(withoutObligations(india));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("stoxkart-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
