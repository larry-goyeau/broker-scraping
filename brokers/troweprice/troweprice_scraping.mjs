// What T. Rowe Price Brokerage (T. Rowe Price Investment Services, Inc.;
// accounts carried by Pershing LLC) sells online in shares and
// exchange-traded funds, with no login. Its brokerage page: "Buy and sell
// stocks, ETFs, options, or mutual funds from our website or mobile app",
// "Outside ETFs are also available", "Enjoy $0 commission trading on stocks
// and ETFs online". Its commission schedule prices "Stocks" and "ETFs" at
// "$0" online, and "Foreign securities orders" at a fee "based on rate for
// country of origin. Ranges from $21-$121 per purchase or sale, in addition
// to the applicable commission", footnoted "Orders for foreign stocks that
// trade as an equivalent on U.S. OTC Bulletin Board or Pink Sheet Markets":
// OTC lines are traded, and only the foreign ones carry a surcharge.
//
//   https://www.troweprice.com/personal-investing/accounts/brokerage/
//   https://www.troweprice.com/content/dam/iinvestor/Forms/brokerage-commission-schedule.pdf
//
// No list and no exchange is named, so:
// - United States: the whole US exchange book of the day
//   (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
//   preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
//   American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
//   lines with an open trade halt; warrants, rights, units, when-issued
//   lines and listed notes are left out there, bonds by withoutObligations.
// - OTC Markets: no tier is named, so (owner rule, 2026-10-25) the four
//   tiers with a public quote, OTCQX, OTCQB, OTCID and Pink Limited
//   (../moomoous/otcBook.mjs; Grey and Expert Market out; warrants, rights,
//   debt lines, mutual funds and symbols also on a US exchange out there).
// The US is one NBBO market: one row per title on its primary listing, in
// dollars; an OTC title is one row on "OTC Markets".
//
// Fees: "$0 commission on all stocks and ETF trades" online;
// representative-assisted $25 ($9.95 for the Enhanced Personal Services
// tier); foreign securities orders $21-$121 on top (commission schedule).
//   https://www.troweprice.com/personal-investing/accounts/brokerage/commissions-and-fees.html
//
//   node brokers/troweprice/troweprice_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.troweprice.com/personal-investing/accounts/brokerage/", [
  /Buy and sell stocks, ETFs, options, or mutual funds from our website or mobile app/i,
  /Enjoy \$0 commission trading on stocks and ETFs online/i,
]);
await checkPage("https://www.troweprice.com/content/dam/iinvestor/Forms/brokerage-commission-schedule.pdf", [
  /Stocks2? \$0/i,
  /Orders for foreign stocks that trade as an equivalent on U\.S\. OTC Bulletin Board or Pink Sheet Markets/i,
], { pdf: true });

const us = await usBook();
const otc = await otcBook(us);
const rows = stampRows(withoutObligations([...us, ...otc.rows]));
if (rows.length < 20000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("troweprice-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}; ${otc.summary}`);
