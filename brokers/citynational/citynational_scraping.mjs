// What City National Bank (Los Angeles; brokerage RBC Securities, member
// FINRA/SIPC) sells online in shares and exchange-traded funds, with no
// login. Its self-directed investing page: "Manage your investments your
// way with a RBC Securities online brokerage account", "Easily trade
// stocks, mutual funds, exchange traded funds (ETFs) and options online".
// The RBC Securities commission schedule it links prices "Equity
// Commissions" for "Online Brokerage", and its note 1 says "These
// commissions and fees apply to securities including, but not limited to
// listed and over-the-counter stocks, warrants, and exchange traded funds
// (ETFs)": OTC shares are traded online at the same rate.
//
//   https://www.cnb.com/personal-banking/wealth-management/self-directed-investing.html
//   https://www.cnb.com/content/dam/cnb/personal-banking/investments-wealth-management/documents/RBC-Securities-Commission-and-Transaction-Fee-Schedule-66523.pdf
//
// No list and no exchange is named, so:
// - United States: the whole US exchange book of the day
//   (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
//   preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
//   American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
//   lines with an open trade halt; warrants, rights, units, when-issued
//   lines and listed notes are left out there, bonds by withoutObligations.
// - OTC Markets (not in the broker list's row, added from the schedule's
//   note above): no tier is named, so (owner rule, 2026-10-25) the four
//   tiers with a public quote, OTCQX, OTCQB, OTCID and Pink Limited
//   (../moomoous/otcBook.mjs).
// "International Equities Settlement/Clearance $75.00" concerns shares
// outside the US books and is not a place here. The US is one NBBO market:
// one row per title on its primary listing, in dollars.
//
// Remarks, not removals: the account is opened by phone with an advisor,
// then traded online through City National Online.
//
// Fees (schedule dated May 29, 2026): online equities "1 - 5,000 shares
// $19.95", "Over 5,000 shares $19.95 + 1¢ per share"; equities under $1.00
// "the lower of the online brokerage rates, or 5% of principal with a
// $19.95 minimum". The page adds: "Private Banking clients and Preferred
// Banking clients ... qualify for commission-free online equity trades $5
// or more per share and no more than 5,000 shares per trade".
//
//   node brokers/citynational/citynational_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.cnb.com/personal-banking/wealth-management/self-directed-investing.html", [
  /RBC Securities online brokerage account/i,
  /Easily trade stocks, mutual funds, exchange traded funds \(ETFs\) and options online/i,
  /qualify for commission-free online equity trades \$5 or more per share/i,
]);
await checkPage("https://www.cnb.com/content/dam/cnb/personal-banking/investments-wealth-management/documents/RBC-Securities-Commission-and-Transaction-Fee-Schedule-66523.pdf", [
  /listed and over-the-counter stocks, warrants, and exchange traded funds/i,
  /Online Brokerage 1 - 5,000 shares[ .]*\$19\.95/i,
], { pdf: true });

const us = await usBook();
const otc = await otcBook(us);
const rows = stampRows(withoutObligations([...us, ...otc.rows]));
if (rows.length < 20000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("citynational-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}; ${otc.summary}`);
