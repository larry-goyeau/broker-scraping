// What Cash App Investing (Cash App Investing LLC, a subsidiary of Block,
// Inc.) sells in shares and exchange-traded funds, with no login. The list
// sits in the app; the help article "Supported Stocks and ETFs" gives its
// size and the rules it is drawn by:
//
//   "On Cash App, you can invest in over 1,800 stocks and ETFs (exchange
//   traded funds)." "Stocks listed on Cash App typically meet the following
//   criteria: Traded on NASDAQ/NYSE; Market capitalization above $300M; 60
//   Day Average Trade Volume above 500,000; 52 week low price above $5 per
//   share". "Securities that meet the following criteria will be excluded
//   from the platform: Mutual funds; Bonds or debt instruments (excludes
//   equities that track debt instruments); Penny stocks; Microcaps, or
//   securities with a market cap between $50-$300M; ETFs with the
//   following characteristics: ETFs that short the market, Leveraged or
//   inverse ETFs (e.g. ultras / 2x / 3x), ETFs that have management fees
//   above 1 percent".
//
//   https://cash.app/help/us/en-us/50131-supported-stocks
//
// So the catalogue starts from the US exchange book of the day
// (../wellstrade/usBook.mjs), cut to the two markets named: "NYSE" read as
// the NYSE-named markets (NYSE, NYSE American, NYSE Arca, NYSE Texas) and
// Nasdaq (NYSE_NASDAQ in ../tfcapital/usTop.mjs); Cboe BZX and Texas Stock
// Exchange listings are left out. The exclusions are applied, read with
// TradingView's US scanner (../cashapp/usScreen.mjs):
// - ETNs out (notes: "debt instruments");
// - ETFs whose name says leveraged or inverse, or that short the market
//   (usScreen's name tests), out; ETFs whose expense ratio is over 1% out
//   (the scanner gives the total expense ratio, the closest public figure
//   to the "management fee": a fund at 1% or less is never over it);
// - shares with a market value under $300M (microcaps and smaller) or a
//   last close under $5 (penny stocks, the SEC's $5 line) out. A share the
//   scanner gives no market value (preferreds, closed-end funds) is kept on
//   that test.
// The "typically" criteria (60-day volume, 52-week low) are not a removal
// on their own; the stated count covers them: the page gives a number and
// no list, so (owner rule, 2026-10-25) the catalogue keeps the 1,800 most
// popular of the remaining titles, shares and ETFs ranked together by
// 30-day average traded value (../tfcapital/usTop.mjs). OTC Markets lines
// are not in the book and Cash App names none. The US is one NBBO market:
// one row per title on its primary listing, in dollars.
//
// Fees: "Does Cash App charge a commission fee? No, Cash App doesn't charge
// commission fees when you buy or sell stocks or exchange-traded funds
// (ETFs)"; SEC and FINRA fees are passed on to sells.
//   https://cash.app/stocks
//
//   node brokers/cashapp/cashapp_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { NYSE_NASDAQ, usTop } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { inverse, leveraged, quoteOf, usQuotes } from "./usScreen.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HELP = "https://cash.app/help/us/en-us/50131-supported-stocks";
const STOCKS = "https://cash.app/stocks";
const N = 1800;
const CAP_FLOOR = 300e6;
const PENNY = 5;
const MAX_EXPENSE = 1;
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The page still says what the header quotes, or the run stops. The help
// article sits in the page's JSON, so its escapes are undone first.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/<script(?![^>]*__NEXT_DATA__)[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&#x27;|[‘’]/g, "'")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(HELP, [
  /invest in over 1,800 stocks and ETFs/i,
  /Traded on NASDAQ\/NYSE/i,
  /Market capitalization above \$300M/i,
  /Penny stocks/i,
  /Microcaps, or securities with a market cap between \$50-\$300M/i,
  /ETFs that short the market, Leveraged or inverse ETFs/i,
  /management fees above 1 percent/i,
]);
await pause();
await evidence(STOCKS, [/doesn't charge commission fees when you buy or sell stocks or exchange-traded funds/i]);

const book = await usBook();
const quotes = await usQuotes();
const left = {};
const leave = (reason) => (left[reason] = (left[reason] || 0) + 1);
const candidates = [];
for (const row of withoutObligations(book)) {
  if (!NYSE_NASDAQ.has(row.mic)) { leave(`listed on ${row.mic} (not NYSE or Nasdaq)`); continue; }
  const quote = quoteOf(quotes, row);
  if (row.type === "ETN") { leave("ETN (a debt instrument)"); continue; }
  if (row.type === "ETF") {
    if (leveraged(row.name)) { leave("leveraged ETF"); continue; }
    if (inverse(row.name)) { leave("inverse or short ETF"); continue; }
    if (quote?.expense > MAX_EXPENSE) { leave("ETF with fees over 1%"); continue; }
  } else {
    if (quote?.cap > 0 && quote.cap < CAP_FLOOR) { leave("market value under $300M"); continue; }
    if (quote?.close > 0 && quote.close < PENNY) { leave("penny stock (under $5)"); continue; }
  }
  candidates.push(row);
}
const top = await usTop(candidates, N);
if (top.length !== N) throw new Error(`only ${top.length} rows`);
const rows = stampRows(top);
for (const ticker of ["AAPL", "MSFT", "SPY", "QQQ", "BRK.B"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
for (const ticker of ["SQQQ", "TQQQ"]) if (rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} should be left out`);
fs.writeFileSync(new URL("cashapp-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`${candidates.length} candidates of ${book.length} book lines; left out ${JSON.stringify(left)}; top ${N}: ${JSON.stringify(top.report)}`);
