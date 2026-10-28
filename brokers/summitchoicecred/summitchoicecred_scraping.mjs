// What Summit Choice Credit Union sells in shares and exchange-traded
// products, with no login. Trading runs through the InvestiFi Self-Directed
// Investment Portal inside the Summit Choice CU app and online banking
// (broker InvestiFi Securities LLC, clearing RQD Clearing LLC). The page
// says: "Buy, sell, and hold stocks and ETFs (Exchange Traded Funds) within
// the InvestiFi Self-Directed Investment Portal" and "Trade a curated
// selection of exchange-listed stocks and ETFs with real-time market data,
// charting tools, and zero commissions on trades".
//
//   https://www.summitchoice.org/Accounts/Invest/Securities-ETFs
//
// The curated selection is not published: the portal sits behind online
// banking. Credit union press releases on the same platform put it at
// "over 6,500 stocks and ETFs" (cuinsight.com, Mid Minnesota FCU). With no
// list to filter on, and no page naming a board, segment or kind of listed
// share left out, the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. It is larger than what the portal shows
// (about 12,000 lines against 6,500).
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the page says
// "exchange-listed". The US is one NBBO market: one row per title, on its
// primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): personal
// accounts, members 18 and over in good standing, one investment account
// per primary account holder, US residents only; "You can buy up to $100k
// of stocks and ETFs in a single transaction"; minimum buy $1.00, minimum
// sell $1.10.
//
// Fees: "zero commissions on trades" and "no fees for purchasing" (same
// page; the 0.50% a year is for guided investing only).
//   https://www.summitchoice.org/Accounts/Invest/Securities-ETFs
//
//   node brokers/summitchoicecred/summitchoicecred_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.summitchoice.org/Accounts/Invest/Securities-ETFs";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /curated selection of exchange-listed stocks and ETFs/i,
  /zero commissions on trades/i,
  /no fees for purchasing/i,
  /InvestiFi/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("summitchoicecred-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
