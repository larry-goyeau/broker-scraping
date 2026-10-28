// What JM Financial (JM Financial Services Ltd, India) sells in shares and
// ETFs, with no login.
//
// NSE and BSE. JM Financial Services' online platform is BlinkX, which
// publishes its instrument list as one public CSV per exchange in the Kite
// layout (the same files ../blinkx reads), and its charges page is the
// tariff ("Zero brokerage up to Rs25 crore in Cash ... After the turnover
// limit, standard brokerage applies: Cash Delivery 0.25%, Intraday Cash
// 0.01%"). The equity lines are typed and filtered by ../bajaj/indiaBook.mjs:
// the ISIN and BSE group come from the cash book; debt series, iNAV lines,
// fund units that are not ETFs, rights entitlements, BSE scrips the BSE
// lists as Suspended or Delisted and NSE lines listed after today are left
// out. One row per exchange for a title on both, in INR.
//
// United States. "Invest in US stocks and ETFs via our partner Stockal"
// and "U.S. Investing is offered through the digital trading platform of
// Stockal" (US investing page). Stockal (now Borderless) publishes no list
// to the public, and JM names no excluded exchange, kind or price and no
// number of titles, so the book is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs, less warrants, rights, units, when-issued lines,
// listed notes and halted lines). One row per title, USD.
//
//   https://www.jmfinancialservices.in/invest-in-us-investing
//   https://www.blinkx.in/charges
//   https://api.blinkx.in/instruments/NSE
//   https://api.blinkx.in/instruments/BSE
//
//   node brokers/jmfinancial/jmfinancial_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { indiaLists, masterIndia, kiteMaster } from "../bajaj/indiaBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.jmfinancialservices.in/invest-in-us-investing", [
  /Invest in US stocks and ETFs via our partner Stockal/i,
  /U\.S\. Investing is offered through the digital trading platform of Stockal/i,
]);
await pageSays("https://www.blinkx.in/charges", [/standard brokerage applies: Cash Delivery 0\.25%/i]);

const lists = await indiaLists();
const india = masterIndia(lists, await kiteMaster(lists, [
  { url: "https://api.blinkx.in/instruments/NSE", exchange: "NSE" },
  { url: "https://api.blinkx.in/instruments/BSE", exchange: "BSE" },
]));
const us = await usBook();
const rows = stampRows(withoutObligations([...india, ...us]));
if (rows.length < 18000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("jmfinancial-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
