// What eOption (eOption, a division of Regal Securities, Glenview,
// Illinois; clearing Hilltop Securities) sells in shares and exchange-traded
// funds, with no login. Its commission schedule charges "Stocks and ETFS
// Market or Limit (Unlimited Shares) $0" online, and its FAQ answers "Can I
// trade Pink Sheet or Bulletin Board stocks through eOption? No, we do not
// allow the entry of Pink Sheet or Bulletin Board stocks through our trading
// platform". It prints no list of titles and names no exchange.
//
//   https://www.eoption.com/rates/
//   https://www.eoption.com/faq/
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt; warrants, rights, units, when-issued lines
// and listed notes are left out there, bonds by withoutObligations. OTC
// Markets lines are not added (the FAQ above). "Foreign Stocks $39.00" is a
// separate line of the schedule for shares outside the US exchange book and
// is not here. The US is one NBBO market: one row per title on its primary
// listing, in dollars.
//
// Fees: "$0 per stock & etf trades" (home page); broker-assisted orders
// "Additional $15.00"; Auto Trade desk orders $2.00 (rates page).
//   https://www.eoption.com/rates/
//
//   node brokers/eoption/eoption_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.eoption.com/rates/", [/Stocks and ETFS Market or Limit \(Unlimited Shares\) \$0/i, /Broker-Assisted Orders Additional \$15\.00/i]);
await checkPage("https://www.eoption.com/faq/", [/we do not allow the entry of Pink Sheet or Bulletin Board stocks through our trading platform/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("eoption-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
