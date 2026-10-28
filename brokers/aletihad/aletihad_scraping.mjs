// What Bank al Etihad (Jordan) sells through its banking app, with no
// login. The stocks page says "Buy and sell US stocks and ETFs straight
// from the app, starting at $1" and "Pick individual companies or spread
// your risk across an ETF"; the knowledge hub says the app lets clients
// "invest in a range of stocks". No page names a board, a segment or a
// kind of listed share or fund left out, and the app's list is not public,
// so the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. Partnership units stay: the page says "If
// a stock carries a PTP tax, we show it clearly before you confirm".
//
//   https://www.bankaletihad.com/en/personal/investments/stocks/
//   https://www.bankaletihad.com/en/knowledge-hub/personal/trading-stocks/
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the bank offers
// "US stocks and ETFs" only. The US is one NBBO market: one row per title,
// on its primary listing, in dollars.
//
// Remarks, not removals: a Bank al Etihad account, the bank's app and "A
// valid national ID" are needed ("What you need").
//
// Fees ("Just 0.5% per trade, a $0.50 minimum, and a $30 cap"; the blog:
// "a 0.5% fee is applied, with a minimum of $0.50 and a maximum of $30 per
// order"):
//   https://www.bankaletihad.com/en/personal/investments/stocks/
//   https://blog.bankaletihad.com/en/investment/how-to-start-investing-with-as-little-as-one-dollar/
//
//   node brokers/aletihad/aletihad_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.bankaletihad.com/en/personal/investments/stocks/", [
  /Buy and sell US stocks and ETFs straight from the app/,
  /0\.5% per trade, a \$0\.50 minimum, and a \$30 cap/,
]);
await pause();
await evidence("https://www.bankaletihad.com/en/knowledge-hub/personal/trading-stocks/", [/invest in a range of stocks/]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("aletihad-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
