// What Folionet (Folionet Financial LLC, Miami; clearing Apex Clearing
// and StoneX) sells in shares and exchange-traded products to
// self-directed accounts, with no login. The home page: "Self-Investing
// Explore the opportunities the U.S. stock market offers. Only a $0.98
// processing fee per trade. 10,000+ stocks, ETFs, OTCs, ADRs." The
// personal-investing page: "Get access to more than 10,000 stocks and ETFs
// traded in the U.S. and all around the world" and "Access emerging
// companies and exclusive OTC and ADR stocks". The fee page prices "U.S.
// Listed & OTC Securities, Preferred Stocks, ETFs and ADRs (U.S. listed)".
//
//   https://www.folionet.com/
//   https://www.folionet.com/personal-investing
//
// The list sits in the app. Places: the United States (US exchanges, one
// NBBO market) and OTC Markets; "all around the world" is reached through
// US-listed ADRs and OTC foreign lines, not foreign exchanges (the fee page
// names only US-listed and OTC securities).
//
// Owner rule (stated count covering the whole app, top N): N = 10,000, one
// figure for stocks, ETFs, OTC lines and ADRs together, so the catalogue
// keeps the 10,000 most popular lines of the two places ranked together by
// 30-day average traded value in dollars (30-day average volume times last
// close on TradingView's US scanner: NYSE, Nasdaq, NYSE American / Arca and
// Cboe lines through ../tfcapital/usTop.mjs's usActivity, OTC lines from
// the same scanner's OTC market, read here); a line with no volume is
// ranked after them by market value, a line the scanner does not carry
// last.
//
// The candidates: the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs; warrants, rights, units,
// when-issued lines, listed notes and halted lines out), and OTC Markets
// lines (../moomoous/otcBook.mjs): Folionet names no tier, so OTCQX, OTCQB,
// OTCID and Pink Limited, shares and ETFs only (Grey and Expert Market have
// no public quote). Bonds out by withoutObligations; Treasury bonds and
// options are not here. One row per title: US lines on their primary
// listing, OTC lines on "OTC Markets", all in dollars.
//
// Fees (fees-and-commissions page, "Self-Investing Fees"): "$0.98 U.S.
// Listed & OTC Securities, Preferred Stocks, ETFs and ADRs (U.S. listed)";
// "$9.99 Assisted trades"; SEC fee $0.051 per $10,000 of sales proceeds,
// TAF $0.000119 a share (max $5.95); no maintenance or custody charge.
//   https://www.folionet.com/fees-and-commissions
//
//   node brokers/folionet/folionet_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { usActivity } from "../tfcapital/usTop.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { readPage, check, describe } from "../bellbank/ekoBook.mjs";

const HOME = "https://www.folionet.com/";
const PERSONAL = "https://www.folionet.com/personal-investing";
const FEES = "https://www.folionet.com/fees-and-commissions";
const SCAN = "https://scanner.tradingview.com/america/scan";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const N = 10000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

check(HOME, await readPage(HOME), [/10,000\+ stocks, ETFs, OTCs, ADRs/i, /\$0\.98 processing fee per trade/i]);
check(PERSONAL, await readPage(PERSONAL), [/more than 10,000 stocks and ETFs traded in the U\.S\. and all around the world/i, /exclusive OTC and ADR stocks/i]);
check(FEES, await readPage(FEES), [/\$0\.98 U\.S\. Listed & OTC Securities, Preferred Stocks, ETFs and ADRs/i]);

// Ticker -> { value, cap } for the OTC lines of TradingView's US scanner.
async function otcActivity() {
  const body = {
    filter: [{ left: "exchange", operation: "in_range", right: ["OTC"] }],
    columns: ["name", "exchange", "close", "average_volume_30d_calc", "market_cap_basic"],
    range: [0, 30000],
  };
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(SCAN, {
        method: "POST",
        headers: { "User-Agent": UA, Origin: "https://www.tradingview.com", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`TradingView OTC scan answered ${response.status}`);
      const json = await response.json();
      if (!Array.isArray(json.data) || json.data.length !== json.totalCount) throw new Error("TradingView OTC scan came back cut");
      if (json.data.length < 3000) throw new Error(`TradingView OTC scan has only ${json.data.length} lines`);
      const map = new Map();
      for (const { d } of json.data) {
        const [name, , close, volume, cap] = d;
        const value = Number(close) > 0 && Number(volume) > 0 ? Number(close) * Number(volume) : 0;
        map.set(String(name).toUpperCase(), { value, cap: Number(cap) > 0 ? Number(cap) : 0 });
      }
      return map;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

const book = await usBook();
const listed = stampRows(withoutObligations(book));
if (listed.length < 10000) throw new Error(`only ${listed.length} rows in the US book`);
const otc = await otcBook(listed);
const otcRows = stampRows(withoutObligations(otc.rows));

const exchange = await usActivity();
const over = await otcActivity();
const scored = [...listed, ...otcRows].map((row) => {
  const hit = row.mic === "OTCM" ? over.get(row.ticker) : exchange.get(row.ticker) || exchange.get(row.ticker.replace(/\./g, " "));
  return { row, value: hit?.value || 0, cap: hit?.cap || 0, seen: Boolean(hit) };
});
const rank = (item) => (item.value > 0 ? 0 : item.cap > 0 ? 1 : item.seen ? 2 : 3);
scored.sort((a, b) => rank(a) - rank(b) || b.value - a.value || b.cap - a.cap || a.row.ticker.localeCompare(b.row.ticker));
const kept = scored.slice(0, N);
const rows = kept.map((item) => item.row);
if (rows.length !== N) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "SPY", "TSM"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
if (!rows.some((row) => row.mic === "OTCM")) throw new Error("no OTC line kept");
rows.report = book.report;
fs.writeFileSync(new URL("folionet-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const last = kept.at(-1);
console.error(otc.summary);
console.error(describe(rows));
console.error(
  `kept the ${N} most popular of ${scored.length} (${listed.length} exchange, ${otcRows.length} OTC): ${kept.filter((i) => rank(i) === 0).length} by traded value, ` +
    `${kept.filter((i) => rank(i) === 1).length} by market value; last kept ${last.row.ticker} ${last.row.mic} ${Math.round(last.value).toLocaleString("en-US")} USD a day`,
);
