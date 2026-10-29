// What Aries (Aries Financial; broker-dealer Ram Financial LLC, clearing
// Apex) sells in shares and exchange-traded funds, with no login. Its fee
// schedule, in the help center, prices "U.S.-Listed Stocks & ETFs $0" and
// adds "Some ADRs are subject to custody fees"; the help center's articles
// on buying a stock and on extended hours name no list, no exchange and no
// excluded segment. No page names OTC Markets lines.
//
//   https://help.aries.com/hc/en-us/articles/24780924217372-Fee-Schedule
//   https://help.aries.com/hc/en-us/articles/29042945500444-Extended-Hours-Trading
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt; warrants, rights, units, when-issued lines
// and listed notes are left out there, bonds by withoutObligations. The
// broker list also gives Aries an OTC Markets place, but no Aries page
// says OTC lines can be traded (the fee schedule prices "U.S.-Listed"
// titles only), so none are added. The US is one NBBO market: one row per
// title on its primary listing, in dollars.
//
// Fees: "U.S.-Listed Stocks & ETFs $0"; options on stocks and ETFs $0,
// index options $0.55 a contract (fee schedule).
//   https://help.aries.com/hc/en-us/articles/24780924217372-Fee-Schedule
//
//   node brokers/aries/aries_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://help.aries.com/hc/en-us/articles/24780924217372-Fee-Schedule", [
  /U\.S\.-Listed Stocks & ETFs \$0/i,
  /Ram Financial/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("aries-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
