// What Ameriprise Financial Services (Ameriprise Brokerage) sells online in
// shares and exchange-traded funds, with no login. Its trading help page:
// "Only non-managed, non-restricted brokerage accounts are eligible for
// online trading" and "What types of securities can I trade online? You can
// trade stocks and options ... In addition, you can place trades to
// liquidate no-load mutual funds". Its Regulation Best Interest disclosure
// prices "equities, ETPs, and ETFs, when placed online in a self-directed
// brokerage account". No list of titles and no exchange is named.
//
//   https://www.ameriprise.com/secure/help/trading
//   https://www.ameriprise.com/binaries/content/assets/ampcom/legal/regbi.pdf
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs (exchange-traded products,
// "ETPs") on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas
// Stock Exchange, less the lines with an open trade halt; warrants, rights,
// units, when-issued lines and listed notes are left out there, bonds by
// withoutObligations. OTC Markets lines are not named and are not added.
// Orders placed through the financial advisor are not online and are not
// the reason for any row. The US is one NBBO market: one row per title on
// its primary listing, in dollars.
//
// Remarks, not removals: online trading needs a non-managed, non-restricted
// brokerage account (most Ameriprise clients work through an advisor).
//
// Fees: "Commissions on equities, ETPs, and ETFs, when placed online in a
// self-directed brokerage account, range from $0 to generally $19.95" (Reg
// BI disclosure; owner rule: a discretionary range is read at its top), and
// "Retail Order Handling Fees $6 per trade" (brokerage fee schedule).
//   https://www.ameriprise.com/binaries/content/assets/ampcom/legal/regbi.pdf
//   https://www.ameriprise.com/customer-service/brokerage-accounts-custodial-fees
//
//   node brokers/ameriprise/ameriprise_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.ameriprise.com/secure/help/trading", [
  /Only non-managed, non-restricted brokerage accounts are eligible for online trading/i,
  /What types of securities can I trade online\? You can trade stocks and options/i,
]);
await checkPage("https://www.ameriprise.com/binaries/content/assets/ampcom/legal/regbi.pdf", [
  /Commissions on equities, ETPs, and ETFs, when placed online in a self- ?directed brokerage account, range from \$0 to generally \$19\.95/i,
], { pdf: true });
await checkPage("https://www.ameriprise.com/customer-service/brokerage-accounts-custodial-fees", [/Retail Order Handling Fees? \$6 per trade/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("ameriprise-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
