// What Thrivent (Thrivent Investment Management Inc., broker-dealer;
// clearing and custody National Financial Services, a Fidelity company)
// sells online in shares and exchange-traded funds, with no login. Its
// clients trade through Fidelity's Wealthscape Investor site; Thrivent's
// guide to it: "Place trades (retail brokerage only)" and "From these
// pages, you can trade mutual funds, stocks and exchange-traded funds (ETFs)
// and receive verification of your order(s)". No list of titles and no
// exchange is named.
//
//   https://www.thrivent.com/files/34965_Navigating_Wealthscape_Investor.pdf
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt; warrants, rights, units, when-issued lines
// and listed notes are left out there, bonds by withoutObligations. OTC
// Markets lines are not named and are not added. The US is one NBBO market:
// one row per title on its primary listing, in dollars.
//
// Remarks, not removals: retail brokerage accounts only (advisory programs
// trade through the advisor); a Thrivent financial professional opens the
// account.
//
// Fees: Thrivent's Regulation Best Interest disclosure gives the ceilings
// of its transaction-based fees, "they will vary; however, they will not
// exceed the applicable rates shown": "Stocks 5.00% Exchange-Traded
// Products 5.00% Closed End Funds 5.00%" (owner rule: a discretionary range
// is read at its top).
//   https://www.thrivent.com/privacy-and-security/files/36033A.pdf
//
//   node brokers/thrivent/thrivent_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.thrivent.com/files/34965_Navigating_Wealthscape_Investor.pdf", [
  /Place trades \(retail brokerage only\)/i,
  /you can trade mutual funds, stocks and exchange-traded funds \(ETFs\)/i,
], { pdf: true });
await checkPage("https://www.thrivent.com/privacy-and-security/files/36033A.pdf", [
  /will not exceed the applicable rates shown/i,
  /Stocks 5\.00% Exchange-Traded Products 5\.00% Closed End Funds 5\.00%/i,
], { pdf: true });

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("thrivent-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
