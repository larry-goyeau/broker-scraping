// What OnePay Invest (One Growth Securities LLC, a subsidiary of OnePay;
// brokerage and custody DriveWealth) sells in shares and exchange-traded
// funds, with no login. Its help article: "You can trade most U.S.-listed
// stocks on the NYSE or Nasdaq and a selection of ETFs. Penny stocks,
// mutual funds, derivatives, options and OTC investments are currently not
// offered through OnePay".
//
//   https://www.onepay.com/help-center/articles/about-onepay-invest
//
// The two markets are a closed list, the ETF selection is not published
// and no count is given. So the catalogue is the US exchange book of the
// day (../wellstrade/usBook.mjs) cut to NYSE and Nasdaq, "NYSE" read as the
// NYSE-named markets (NYSE, NYSE American, NYSE Arca, NYSE Texas;
// NYSE_NASDAQ in ../tfcapital/usTop.mjs), with:
// - shares (with ADRs, REITs, partnership units, preferreds and closed-end
//   funds) less the penny stocks, read as a last close under $5 (the SEC's
//   line) on TradingView's US scanner (../cashapp/usScreen.mjs); a share
//   the scanner does not carry is kept;
// - ETFs: all of them on those markets (owner rule: a selection with no
//   list is the whole listing); ETNs out (notes, neither stocks nor ETFs);
// - warrants, rights, units, when-issued lines and listed notes left out in
//   usBook, bonds by withoutObligations; no OTC lines.
// "Most" stocks is not a rule that names any title, so nothing else is
// removed. The US is one NBBO market: one row per title on its primary
// listing, in dollars.
//
// Fees: "Your OnePay Invest account has no trading commissions or
// maintenance fees. When you sell investments, small SEC and FINRA
// regulatory fees may apply" (same article).
//
//   node brokers/onepay/onepay_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { quoteOf, usQuotes } from "../cashapp/usScreen.mjs";
import { NYSE_NASDAQ } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const PENNY = 5;

await checkPage("https://www.onepay.com/help-center/articles/about-onepay-invest", [
  /You can trade most U\.S\.-listed stocks on the NYSE or Nasdaq and a selection of ETFs/i,
  /Penny stocks, mutual funds, derivatives, options and OTC investments are currently not offered/i,
  /no trading commissions or maintenance fees/i,
]);

const book = await usBook();
const quotes = await usQuotes();
const left = {};
const leave = (reason) => (left[reason] = (left[reason] || 0) + 1);
const kept = [];
for (const row of book) {
  if (!NYSE_NASDAQ.has(row.mic)) { leave(`listed on ${row.mic}`); continue; }
  if (row.type === "ETN") { leave("ETN"); continue; }
  if (row.type === "STOCK") {
    const quote = quoteOf(quotes, row);
    if (quote?.close > 0 && quote.close < PENNY) { leave("penny stock (under $5)"); continue; }
  }
  kept.push(row);
}
const rows = stampRows(withoutObligations(kept));
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "BRK.B", "SPY", "QQQ"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("onepay-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}; left out ${JSON.stringify(left)}`);
