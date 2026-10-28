// What SBI Securities (SBICAP Securities Ltd, India) sells in shares and
// ETFs, with no login. SBI Securities publishes no scrip master and no list
// of what it carries. Its site is one Angular application; the text below
// is read from its main bundle (main.<hash>.js, named in the home page).
//
// NSE and BSE. The plan table prices equity delivery, intraday and ETFs on
// every plan (SUVIDHA: delivery 0.50%, intraday 0.50%, "ETF^" Rs.20 per
// order; PRO plans), with no excluded segment, group or kind of listed
// share, so the book is the whole NSE and BSE cash book of the day, shares
// and ETFs, minus suspended, delisted and not-yet-listed lines, rights
// entitlements and fund units that are not ETFs (../bajaj/indiaBook.mjs).
// One row per exchange for a title on both, in INR.
//
// United States. The US investing page: "Invest seamlessly in US stocks,
// fractional shares, and ETFs with SBICAP Securities, powered by
// Appreciate", priced "0.25% of the transaction value under the Basic Plan"
// plus a platform fee per share. Appreciate publishes no list to the public,
// and SBI names no excluded exchange, kind or price and no number of
// titles, so the book is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs, less warrants, rights, units, when-issued lines,
// listed notes and halted lines). One row per title, USD.
//
// Left out: NSE International Exchange and India International Exchange,
// which broker-list.json has as places. The US page shows them under "Dual
// Exchange Connectivity" with GIFT City and IFSCA: they are the IFSC route
// the US orders take, not a market whose shares or ETFs SBI lists.
//
//   https://www.sbisecurities.in/  (main.<hash>.js)
//
//   node brokers/sbisecurities/sbisecurities_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import { pageSays, plainText } from "../bajaj/pageSays.mjs";

const SITE = "https://www.sbisecurities.in/";
const home = await pageSays(SITE, [/src="main\.[0-9a-f]+\.js"/], { raw: true });
const main = home.match(/src="(main\.[0-9a-f]+\.js)"/)[1];
// The bundle holds the page text in JavaScript strings: escaped line breaks
// and tags are taken out before the sentences are looked for.
const bundle = plainText((await pageSays(`${SITE}${main}`, [], { raw: true })).replace(/\\n/g, " "));
for (const pattern of [
  /Invest seamlessly in US stocks, fractional shares, and ETFs with/,
  /SBICAP Securities, powered by Appreciate/,
  /Brokerage is charged at 0\.25% of the transaction value under the Basic Plan/,
  /"SUVIDHA"\),s\(\),r\(\d+,"td"\),l\(\d+,"0\.50%"\)/,
  /"ETF\^"/,
]) {
  if (!pattern.test(bundle)) throw new Error(`${main} no longer says ${pattern}`);
}

const india = wholeIndia(await indiaLists());
const us = await usBook();
const rows = stampRows(withoutObligations([...india, ...us]));
if (rows.length < 18000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("sbisecurities-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
