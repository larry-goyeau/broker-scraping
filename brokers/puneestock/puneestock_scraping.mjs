// What Pune E Stock Broking (PESB, Pune E Stock Broking Ltd, India) sells in
// shares and ETFs, with no login. It publishes no scrip master and no list
// of what it carries.
//
// NSE and BSE. The brokerage page prices "Equity Delivery Equity Intra-Day
// Equity Futures Equity Options Brokerage 0.3% 0.03% 0.03% Flat ₹ 30 per
// lot", with NSE and BSE transaction charges, and excludes no segment, group
// or kind of listed share. Orders go through its Aero and Breeze platforms
// (the ODIN web help broker-list.json links is an older front end), so the
// book is the whole NSE and BSE cash book of the day, shares and ETFs, minus
// suspended, delisted and not-yet-listed lines, rights entitlements and fund
// units that are not ETFs (../bajaj/indiaBook.mjs). One row per exchange for
// a title on both, in INR.
//
// No US or other foreign place: PESB offers NSE, BSE, currency and commodity
// trading only.
//
//   https://pesb.co.in/slabs-brokerage.php
//
//   node brokers/puneestock/puneestock_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://pesb.co.in/slabs-brokerage.php", [/Equity Delivery Equity Intra-Day Equity Futures Equity Options Brokerage 0\.3% 0\.03%/i]);

const india = wholeIndia(await indiaLists());
const rows = stampRows(withoutObligations(india));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("puneestock-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
