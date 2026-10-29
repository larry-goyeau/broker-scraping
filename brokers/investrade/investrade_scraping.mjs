// What Investrade (Investrade Discount Securities, Northbrook, Illinois, a
// division of Regal Securities; the same schedule as ../eoption) sells in
// shares and exchange-traded funds, with no login. Its commissions page
// charges "Stocks and ETFs Stock and ETF Trades $0", and its FAQ answers
// "Can I trade Pink Sheet or Bulletin Board stocks through Investrade? No,
// we do not allow the entry of Pink Sheet or Bulletin Board stocks through
// our trading platform". It prints no list of titles and names no exchange.
//
//   https://investrade.com/commissions-fees/
//   https://investrade.com/faq/
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt; warrants, rights, units, when-issued lines
// and listed notes are left out there, bonds by withoutObligations. OTC
// Markets lines are not added (the FAQ above). "Foreign Stocks $39.00" and
// "Investrade Discount Securities can purchase some, but not all, foreign
// securities" concern shares outside the US exchange book, which are not
// here. The US is one NBBO market: one row per title on its primary
// listing, in dollars.
//
// Fees: "Stock and ETF Trades $0", "Broker-Assisted Orders $15.00", "Fees &
// Commissions effective 6/24/2026" (commissions page; the Discount
// Disclosure PDF says each trade pays a commission, the schedule sets it).
//   https://investrade.com/commissions-fees/
//   https://investrade.com/wp-content/uploads/Discount-Disclosure.pdf
//
//   node brokers/investrade/investrade_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://investrade.com/commissions-fees/", [/Stock and ETF Trades \$0/i, /Broker-Assisted Orders \$15\.00/i]);
await checkPage("https://investrade.com/faq/", [/we do not allow the entry of Pink Sheet or Bulletin Board stocks through our trading platform/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("investrade-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
