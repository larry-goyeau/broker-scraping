// What TradingBlock (AOS, Inc., Chicago) sells in shares and exchange-traded
// products, with no login. It has two account kinds: ZERO COMMISSION
// (cleared and custodied at RQD Clearing) and FULL SERVICE (Apex
// Clearing). Online, both trade "Stocks and ETFs" and options; the Trade
// Desk of the Full Service account adds mutual funds, fixed income, UITs
// and warrants ("Warrants: Not available" on the Zero Commission column).
// The site also says "TradingBlock lets you trade stocks, ETFs, options,
// and crypto ETFs". No page names a board, a segment or a kind of listed
// share or fund left out, and no list of titles is published, so the
// catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
//   https://www.tradingblock.com/individuals
//   https://www.tradingblock.com/why-tradingblock
//   https://legacy.tradingblock.com/Docs/Agreements/tb/AOS_TradingBlock_Form_CRS.pdf
//
// Left out, as in the other US catalogues: warrants and rights (only by
// phone on Full Service accounts anyway), units, when-issued lines and
// listed notes (usBook), and bonds (withoutObligations). OTC Markets lines
// are not added: no TradingBlock page mentions over-the-counter or pink
// sheet trading. The US is one NBBO market: one row per title, on its
// primary listing, in dollars.
//
// Fees: Zero Commission account "Stocks & ETFs $0.00 per online trade";
// Full Service account "$0.001 per share; $5.00 minimum per trade";
// phoned-in orders $25.00 + the above (Zero Commission) or $0.00 + the
// above (Full Service); SEC fee, FINRA TAF and CAT fee passed through.
//   https://www.tradingblock.com/pricing-policies
//
//   node brokers/tradingblock/tradingblock_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns, json) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  let text = await response.text();
  if (json) text = JSON.parse(text).article.body;
  text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.tradingblock.com/pricing-policies", [
  /Stocks & ETFs \$0\.00 per online trade \$0\.001 per share; \$5\.00 minimum per trade/i,
  /Warrants Not available \$30\.00 per order/i,
]);
await pause();
await evidence("https://www.tradingblock.com/individuals", [/Trade online \(Zero Commission and Full Service Accounts\) Stocks and ETFs/i]);
await pause();
await evidence("https://www.tradingblock.com/why-tradingblock", [/trade stocks, ETFs, options, and crypto ETFs/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("tradingblock-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
