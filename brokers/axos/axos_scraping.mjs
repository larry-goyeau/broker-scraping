// What Axos Self-Directed Trading (Axos Invest LLC, Axos Clearing) sells in
// shares and exchange-traded funds, with no login. Its page: "commission-
// free equity and exchange-traded funds, and 10,000+ mutual funds", "Stocks
// $0 per trade, ETFs $0 per trade", and two limits in its notes: "ETFs are
// limited to those ETFs which are not leveraged or the inverse of any index
// of which the ETF is tracking", and "$0 Stocks are limited to stock listed
// on an exchange in the United States. Foreign exchange, stocks listed over
// the counter, and large block transactions requiring special handling may
// include charges."
//
//   https://www.axos.com/invest/self-directed-trading
//
// No list of titles and no exchange is named, so the catalogue is the whole
// US exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs,
// REITs, partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt; warrants, rights,
// units, when-issued lines and listed notes are left out there, bonds by
// withoutObligations. Then the ETF rule: exchange-traded products whose
// name says leveraged or inverse are left out (the name tests of
// ../cashapp/usScreen.mjs; ETNs are read the same way, an ETN being an
// exchange-traded product tracking an index). The US is one NBBO market:
// one row per title on its primary listing, in dollars.
//
// OTC Markets is not added, although the broker list gives Axos that place:
// the only OTC words on Axos's pages are the note above, which puts OTC
// orders among those "requiring special handling" at a charge the schedule
// does not print, and no page says they can be placed online.
//
// Fees: "Stocks $0 per trade", "ETFs $0 per trade" (page); the fee
// schedule: "Equities free"; "Commissions, service, contract, regulatory
// and exception fees still apply".
//   https://www.axos.com/documents/axos-invest-self-directed-trading-fee-schedule
//
//   node brokers/axos/axos_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { inverse, leveraged } from "../cashapp/usScreen.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.axos.com/invest/self-directed-trading", [
  /Stocks \$0 per trade \* ETFs \$0 per trade/i,
  /ETFs are limited to those ETFs which are not leveraged or the inverse of any index/i,
  /\$0 Stocks are limited to stock listed on an exchange in the United States/i,
]);
await checkPage("https://www.axos.com/documents/axos-invest-self-directed-trading-fee-schedule", [/Equities free/i], { pdf: true });

const book = await usBook();
const left = { leveraged: [], inverse: [] };
const kept = [];
for (const row of book) {
  if (row.type !== "STOCK" && leveraged(row.name)) left.leveraged.push(row.ticker);
  else if (row.type !== "STOCK" && inverse(row.name)) left.inverse.push(row.ticker);
  else kept.push(row);
}
const rows = stampRows(withoutObligations(kept));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["TQQQ", "SQQQ", "SH"]) if (rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} should be left out`);
fs.writeFileSync(new URL("axos-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}; left out ${left.leveraged.length} leveraged and ${left.inverse.length} inverse products`);
