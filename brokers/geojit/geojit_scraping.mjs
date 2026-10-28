// What Geojit Financial Services (India) sells in shares and ETFs, with no
// login. Geojit publishes no scrip master and no list of what it carries.
//
// NSE and BSE. The brokerage page prices "Delivery-Based Equity Trading
// 0.30%" and "Intraday Equity Trading 0.03%" (GinvestMax) with no excluded
// segment, group or kind of listed share, so the book is the whole NSE and
// BSE cash book of the day, shares and ETFs, minus suspended, delisted and
// not-yet-listed lines, rights entitlements and fund units that are not ETFs
// (../bajaj/indiaBook.mjs). One row per exchange for a title on both, INR.
//
// United States. Geojit's "Global Investments" link opens Geojit IFSC (its
// GIFT City arm, an introducing broker): "Invest in select international
// equities and ETFs, including U.S. markets, via IFSC-registered Global
// Access Providers" and "Geojit IFSC has engaged View Trade IFSC as its
// Global Access Provider (GAP)". The tariff prices only "US listed stocks
// and ETFs" (Equity Brokerage 0.25%). "Select" is not a list and no number
// is given, and no page names an excluded exchange, kind or price, so the
// book is the whole US exchange book of the day (../wellstrade/usBook.mjs:
// shares, ADRs, REITs, preferreds, closed-end funds, ETFs and ETNs, less
// warrants, rights, units, when-issued lines, listed notes and halted
// lines). Older reports name Stockal as the partner; Geojit's pages now
// name View Trade, whose restrictions they do not state. One row per title,
// USD.
//
// Left out: NSE International Exchange, which broker-list.json has as a
// place. Geojit IFSC is a member there for index, single-stock, currency
// and commodity derivatives and depository receipts; it publishes no list
// of shares or ETFs it offers on NSE IX.
//
//   https://www.geojit.com/brokerage-charges
//   https://www.geojitifsc.com/invest_in_global_stocks.html
//
//   node brokers/geojit/geojit_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.geojit.com/", [/Global Investments/i, /geojitifsc\.com\/invest_in_global_stocks/i], { raw: true });
await pageSays("https://www.geojit.com/brokerage-charges", [/For Delivery-Based Equity Trading 0\.30%/i]);
await pageSays("https://www.geojitifsc.com/invest_in_global_stocks.html", [
  /Invest in select international equities and ETFs, including U\.S\. markets/i,
  /engaged View Trade IFSC as its Global Access Provider/i,
  /US listed stocks and ETFs/i,
]);

const india = wholeIndia(await indiaLists());
const us = await usBook();
const rows = stampRows(withoutObligations([...india, ...us]));
if (rows.length < 18000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("geojit-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
