// What Step (Step Advisers LLC; the accounts are held at DriveWealth, LLC)
// sells in shares and exchange-traded products, with no login. The investing
// page says "Buy and sell thousands of stocks on your terms without
// commission fees" and "Choose from fractional shares of your favorite
// companies or ETFs"; the footer says the service covers "stocks (including
// certain ETFs)". The Form ADV 2A says what the app offers are "curated
// buckets of equity securities, and American Depositary Receipts (“ADRs”)
// and exchange traded funds (“ETFs")", sorted into Low, Moderate and High
// volatility.
//
//   https://step.com/investing
//   https://help.step.com/en/articles/6967968-how-do-i-buy-and-sell-stocks
//   https://step.com/policies/pdf/form-adv-2a
//
// The curated selection is not published: the list is in the app only. With
// no list to filter on, and no page naming a board, segment or kind of
// listed share or ETF left out, the catalogue is the whole US exchange book
// of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership
// units, preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. "Thousands of stocks" and "certain ETFs"
// mean many of its lines are not in the app; nothing public says which.
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no page names
// them. The US is one NBBO market: one row per title, on its primary
// listing, in dollars.
//
// Remarks, not removals (they depend on the client): a buy limit of "$1,200
// (USD) per 7 calendar days"; teens 13 and over invest only with a sponsor
// and "within the volatility level set by the investment strategy for their
// account".
//
// Fees ("Step does not charge any commission fees"; on sales the FINRA TAF,
// "$0.000119 per share with a maximum of $5.95 per trade", and the SEC fee
// are passed on):
//   https://help.step.com/en/articles/6967968-how-do-i-buy-and-sell-stocks
//
//   node brokers/stepus/stepus_scraping.mjs

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
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://step.com/investing", [/Buy and sell thousands of stocks/i, /stocks \(including certain ETFs\)/i]);
await pause();
await evidence("https://help.step.com/en/articles/6967968-how-do-i-buy-and-sell-stocks", [/Step does not charge any commission fees/i]);
await pause();
await evidence("https://help.step.com/en/articles/6968166-are-there-limits-to-how-much-stock-i-can-buy-or-sell", [/buy limit of \$1,200/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("stepus-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
