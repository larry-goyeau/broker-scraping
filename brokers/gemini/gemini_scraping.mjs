// What Gemini (Gemini Stocks; broker-dealer Gemini Galactic Markets, LLC,
// clearing and custody Apex Clearing) sells in shares and exchange-traded
// funds, with no login. Its Form CRS: "Our platform allows you to buy and
// sell equity securities (stocks and exchange-traded funds) in a
// self-directed Investing Account", "We do not currently offer margin
// lending, options trading, or other complex products"; its stocks page:
// "Thousands of Stocks and ETFs. Access to exchange-listed stocks and ETFs,
// all in one place".
//
//   https://www.gemini.com/legal/form-crs
//   https://www.gemini.com/stocks
//
// No list, no number ("thousands"), no exchange named, so the catalogue is
// the whole US exchange book of the day (../wellstrade/usBook.mjs): shares,
// ADRs, REITs, partnership units, preferreds, closed-end funds and ETFs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt. Left out: ETNs (notes,
// not "equity securities (stocks and exchange-traded funds)"); warrants,
// rights, units, when-issued lines and listed notes (usBook); bonds
// (withoutObligations). OTC lines: "exchange-listed" only, none added. The
// US is one NBBO market: one row per title on its primary listing, in
// dollars.
//
// Remarks, not removals: "Gemini Stocks is currently live for U.S.
// residents except those in Guam, and Texas"; cash accounts only.
//
// Fees: "We currently charge no commissions on equity trades. Regulatory
// transaction fees (SEC fees and FINRA Trading Activity Fees) apply to sell
// orders" (Form CRS); "Trade Gemini Stocks without commission" (stocks
// page).
//   https://www.gemini.com/legal/form-crs
//
//   node brokers/gemini/gemini_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://www.gemini.com/legal/form-crs", [
  /buy and sell equity securities \(stocks and exchange-traded funds\) in a self-directed Investing Account/i,
  /We currently charge no commissions on equity trades/i,
  /Apex Clearing/i,
]);
await checkPage("https://www.gemini.com/stocks", [/Access to exchange-listed stocks and ETFs/i]);

const book = await usBook();
const etns = book.filter((row) => row.type === "ETN");
const rows = stampRows(withoutObligations(book.filter((row) => row.type !== "ETN")));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("gemini-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}; ${etns.length} ETNs left out`);
