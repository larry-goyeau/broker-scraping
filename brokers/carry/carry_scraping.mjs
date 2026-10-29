// What Carry (Global Carry LLC, introducing broker; custody DriveWealth
// LLC; accounts through Carry Advisors LLC) sells in shares and
// exchange-traded funds, with no login. Its equities page: "Access
// thousands of stocks, ETFs, and mutual funds with commission-free
// trading", "You can trade most U.S. publicly listed stocks, ETFs, and
// mutual funds through Carry, including securities from major exchanges
// like NYSE, NASDAQ, TSX, and others", and "Does Carry offer foreign
// stocks? No, we don't offer direct foreign stock trading. However, we do
// offer American Depositary Receipts (ADRs) ... trading on U.S. exchanges".
//
//   https://carry.com/equities
//
// The page names no list. The exchanges are given as examples ("like ...
// and others"), so (owner rule, 2026-10-25) the place is the whole US;
// TSX in that sentence is not a place of its own, since the same page says
// no foreign shares are traded. "Thousands" is not a number. So the
// catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt; warrants, rights, units, when-issued lines
// and listed notes are left out there, bonds by withoutObligations, mutual
// funds are not exchange-traded and are not here. OTC Markets lines are not
// named and are not added. The US is one NBBO market: one row per title on
// its primary listing, in dollars.
//
// Remarks, not removals: every account needs an active Carry Core or Pro
// membership; equities accounts are self-directed and pay no advisory fee.
//
// Fees: commission-free trading; membership "Core $299 /year", "Pro $499
// /year" (same page); "No advisory fees apply to self-directed equities
// accounts".
//   https://carry.com/equities
//
//   node brokers/carry/carry_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://carry.com/equities", [
  /stocks, ETFs, and mutual funds with commission-free trading/i,
  /trade most U\.S\. publicly listed stocks, ETFs, and mutual funds through Carry, including securities from major exchanges like NYSE, NASDAQ/i,
  /we don't offer direct foreign stock trading/i,
  /Core \$299 \/year/i,
  /DriveWealth/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("carry-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
