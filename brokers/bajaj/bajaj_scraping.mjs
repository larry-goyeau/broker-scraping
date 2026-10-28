// What Bajaj Broking (Bajaj Financial Securities Ltd, India) sells in shares
// and ETFs, with no login. Bajaj publishes no list of its own: its script
// master is only sent through customer care. Its pages name two places.
//
// NSE and BSE. "you can buy and sell stocks on NSE and BSE exchanges"
// (US stocks page, Our Offerings), and the pricing page prices equity
// delivery and intraday on every plan (Freedom Pack Rs20/order, Professional
// Pack Rs10/order, Signature Pack 0.2% on delivery). No page names a
// segment, a group or a kind of listed share it does not take, and its
// knowledge centre and ETF screener cover ETFs, so the book is the whole NSE
// and BSE cash book of the day, shares and ETFs, minus suspended, delisted
// and not-yet-listed lines, rights entitlements and fund units that are not
// ETFs (./indiaBook.mjs). One row per exchange for a title on both, in INR.
//
// United States. "You can invest in US-listed stocks through Bajaj
// Broking's partnership with Vested" and "Investors can access US-listed
// stocks traded on major exchanges such as NASDAQ and NYSE" (US stocks
// page; "such as" names no closed set, and the US exchanges are one NBBO
// market). Vested publishes no list to the public and Bajaj names no
// exception (no excluded board, kind or price), and states no number of
// US titles, so the book is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas exchanges, less warrants, rights, units, when-issued lines,
// listed notes and lines with an open trade halt). Vested's own restrictions
// are not applied: Bajaj's pages do not state them. One row per title, USD.
//
// OTC Markets: the same page prices "Invest in OTC Securities (including
// European companies)" at 0.5% (Basic) or 0.25% (Premium), and
// broker-list.json has OTC Markets as a place. No tier is named, so
// the OTC Markets lines of the four tiers with a public quote, OTCQX,
// OTCQB, OTCID and Pink Limited (../moomoous/otcBook.mjs; owner rule: the
// tiers the broker names, else all of them).
//
//   https://www.bajajbroking.in/us-stocks
//   https://www.bajajbroking.in/pricing
//
//   node brokers/bajaj/bajaj_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { indiaLists, wholeIndia } from "./indiaBook.mjs";
import { pageSays } from "./pageSays.mjs";

await pageSays("https://www.bajajbroking.in/us-stocks", [
  /you can buy and sell stocks on NSE and BSE exchanges/i,
  /invest in US-listed stocks through Bajaj Broking's partnership with Vested/i,
  /US-listed stocks traded on major exchanges such as NASDAQ and NYSE/i,
  /Invest in OTC Securities \(including European companies\)/i,
]);

const india = wholeIndia(await indiaLists());
const us = await usBook();
const otc = await otcBook(us);
const rows = stampRows(withoutObligations([...india, ...us, ...otc.rows]));
if (rows.length < 18000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("bajaj-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`India left out: ${Object.entries(india.left).map(([why, n]) => `${n} ${why}`).join(", ")}`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
console.error(otc.summary);
