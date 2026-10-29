// What Bloom (Bloom, the investing-education app for teens and adults;
// broker Alpaca Securities LLC) sells in shares and exchange-traded funds,
// with no login. Its FAQ: "What can I invest in? You can currently buy &
// sell 5,000+ U.S. stocks and ETFs. We will never allow users to trade
// options or on margin" and "Our brokerage services are provided by Alpaca
// Securities LLC ("Alpaca"), member FINRA/SIPC".
//
//   https://www.bloomapp.com/faq
//
// Bloom's broker is Alpaca, so the book is Alpaca's tradable US exchange
// book (../greenlight/alpacaUsBook.mjs: shares, ADRs, REITs, partnership
// units, preferreds, closed-end funds and exchange-traded products on NYSE,
// Nasdaq, NYSE American, NYSE Arca and Cboe BZX; Alpaca's OTC lines and
// crypto out, Bloom names no OTC). The FAQ gives a number and no list, so
// (owner rule, 2026-10-25) the catalogue keeps the 5,000 most popular of
// those titles, shares and ETFs ranked together by 30-day average traded
// value (../tfcapital/usTop.mjs). Bonds go through withoutObligations. One
// row per title on its listing market, in dollars.
//
// Remarks, not removals: custodial accounts (UTMA/UGMA) for teens 13-17 are
// opened by a parent; "only parents can withdraw funds".
//
// Fees: "Bloom charges a subscription fee for access to our custodial and
// individual investing accounts" - "an annual plan at $99.99/ year, and a
// monthly plan at $15/ month. The custodial plan is at $150/ year" - and
// "we do not make any money off of users' trades" (no commission).
//   https://www.bloomapp.com/faq
//
//   node brokers/bloom/bloom_scraping.mjs
//   (run node brokers/alpaca/alpaca_scraping.mjs first when Alpaca's book is old)

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { alpacaUsBook } from "../greenlight/alpacaUsBook.mjs";
import { usTop } from "../tfcapital/usTop.mjs";

const N = 5000;

await checkPage("https://www.bloomapp.com/faq", [
  /You can currently buy & sell 5,000\+ U\.S\. stocks and ETFs/i,
  /brokerage services are provided by Alpaca Securities LLC/i,
  /annual plan at \$99\.99\/ ?year, and a monthly plan at \$15\/ ?month/i,
]);

const book = alpacaUsBook();
const top = await usTop(withoutObligations(book), N);
if (top.length !== N) throw new Error(`only ${top.length} rows`);
const rows = stampRows(top);
for (const ticker of ["AAPL", "MSFT", "SPY", "QQQ", "BRK.B"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("bloom-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`Alpaca book ${book.report.ageDays} days old, ${book.length} lines (left out ${JSON.stringify(book.report.leftOut)}); top ${N}: ${JSON.stringify(top.report)}`);
