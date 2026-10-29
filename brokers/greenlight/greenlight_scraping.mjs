// What Greenlight (Greenlight Invest; broker-dealer Alpaca Securities LLC)
// sells in shares and exchange-traded funds, with no login. Its help
// article "What stocks or ETFs are available to buy on Greenlight?":
//
//   "On our Greenlight Max, Greenlight Infinity, and Greenlight Family
//   Shield plans, families have access to over 4,000+ stocks and ETFs. On
//   the Greenlight Core plan, parents have access to 10 ETFs through their
//   Investing for Parents Lite feature. In partnership with our
//   broker-dealer, Alpaca, ..." "Greenlight offers only securities that
//   meet the following criteria: US-exchange listed stocks and ETFs;
//   however, over-the-counter (OTC) securities are not available; Stocks
//   and ETFs with a market capitalization greater than $ 1 billion; If the
//   market capitalization is below $1 billion, then the 3 month average
//   daily dollar volume must be greater than $0.5 million; Exchange listed
//   sponsored ADRs (American Depositary Receipts); A select few leveraged
//   ETFs".
//
//   https://help.greenlight.com/hc/en-us/articles/1260801462989-What-stocks-or-ETFs-are-available-to-buy-on-Greenlight
//
// The catalogue is the full-investing plans' (Max, Infinity, Family
// Shield); the Core plan's 10 ETFs are a lower tier of the same app.
// Greenlight's broker is Alpaca, so the book is Alpaca's tradable US
// exchange book (./alpacaUsBook.mjs; Alpaca's OTC lines out, as the article
// says). The criteria are applied with TradingView's US scanner
// (../cashapp/usScreen.mjs): a line is kept when its market value is over
// $1 billion or its 30-day average traded value is over $0.5 million (the
// closest public figure to the 3-month average; a fund has no market value
// on the scanner and passes on its traded value); a line the scanner does
// not carry cannot pass and is left out. Leveraged ETFs are left out: only
// "a select few" are offered and no page names them. Exchange-listed ADRs
// are sponsored programmes and stay. The article then gives a number and no
// list, so (owner rule, 2026-10-25) the catalogue keeps the 4,000 most
// popular of those titles, shares and ETFs ranked together by 30-day
// average traded value (../tfcapital/usTop.mjs). One row per title on its
// listing market, in dollars.
//
// Remarks, not removals: only the primary accountholder places trades;
// kids request trades for a parent's approval; full investing needs the
// Max, Infinity or Family Shield plan.
//
// Fees: "Greenlight only charges one monthly fee (plus applicable taxes)
// per plan", no commission; "$10.98/month, $15.98/month, or $19.98/month"
// for Max, Infinity and Family Shield (Core $5.99/month).
//   https://help.greenlight.com/hc/en-us/articles/1260801287630-Is-there-a-fee-to-invest-on-Greenlight
//   https://help.greenlight.com/hc/en-us/articles/4404247122587-What-fees-are-associated-with-Greenlight
//
//   node brokers/greenlight/greenlight_scraping.mjs
//   (run node brokers/alpaca/alpaca_scraping.mjs first when Alpaca's book is old)

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { leveraged, quoteOf, usQuotes } from "../cashapp/usScreen.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { alpacaUsBook } from "./alpacaUsBook.mjs";

const N = 4000;
const CAP_FLOOR = 1e9;
const DOLLAR_VOLUME_FLOOR = 0.5e6;

await checkPage("https://help.greenlight.com/hc/en-us/articles/1260801462989-What-stocks-or-ETFs-are-available-to-buy-on-Greenlight", [
  /families have access to over 4,000\+ stocks and ETFs/i,
  /broker-dealer, Alpaca/i,
  /over-the-counter \(OTC\) securities are not available/i,
  /market capitalization greater than \$ ?1 billion/i,
  /3 month average daily dollar volume must be greater than \$0\.5 million/i,
  /A select few leveraged ETFs/i,
]);
await checkPage("https://help.greenlight.com/hc/en-us/articles/1260801287630-Is-there-a-fee-to-invest-on-Greenlight", [/only charges one monthly fee/i]);
await checkPage("https://help.greenlight.com/hc/en-us/articles/4404247122587-What-fees-are-associated-with-Greenlight", [/\$10\.98\/month, \$15\.98\/month, or \$19\.98\/month/i]);

const book = alpacaUsBook();
const quotes = await usQuotes();
const left = {};
const leave = (reason) => (left[reason] = (left[reason] || 0) + 1);
const candidates = [];
for (const row of withoutObligations(book)) {
  if (row.type === "ETF" && leveraged(row.name)) { leave("leveraged ETF"); continue; }
  const quote = quoteOf(quotes, row);
  if (!quote) { leave("not on the scanner"); continue; }
  if (!(quote.cap > CAP_FLOOR || quote.value > DOLLAR_VOLUME_FLOOR)) { leave("under $1 billion and $0.5 million a day"); continue; }
  candidates.push(row);
}
const top = await usTop(candidates, N);
if (top.length !== N) throw new Error(`only ${top.length} rows`);
const rows = stampRows(top);
for (const ticker of ["AAPL", "MSFT", "SPY", "QQQ", "BRK.B"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("greenlight-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`Alpaca book ${book.report.ageDays} days old, ${book.length} lines (left out ${JSON.stringify(book.report.leftOut)}); ${candidates.length} pass the rules, left out ${JSON.stringify(left)}; top ${N}: ${JSON.stringify(top.report)}`);
