// What UMB Bank's self-directed brokerage (UMB Financial Services, Inc.,
// Kansas City; clearing broker National Financial Services, Fidelity)
// sells in shares and exchange-traded products, with no login. The
// self-directed investing page lists "Stocks", bonds, mutual funds,
// options and brokered CDs, and the broker-dealer's Form CRS says its
// products are among "mutual funds, exchange traded funds, domestic and
// international equities, options, fixed income securities". No page names
// a board, a segment or a kind of listed share or fund left out, and no
// list of titles is published, so the catalogue is the whole US exchange
// book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt. ETFs are kept: they
// trade as stocks on the stock commission, and the Form CRS names them.
//
//   https://www.umb.com/wealth-management/investing/self-direct-investing
//   https://p1.aprimocdn.net/umb/55dadf93-0b00-4cc6-8777-b066012e0f71/UMBFS_CRS_Broker_Dealer_Original_file.pdf
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no UMB page
// mentions over-the-counter trading. Foreign shares on foreign exchanges
// carry a "Foreign Fee $75.00" in the schedule but no page says which
// markets, so this catalogue holds the United States only. The US is one
// NBBO market: one row per title, on its primary listing, in dollars.
//
// Fees (commission schedule on the same page): online "Stocks $22.50" base
// charge plus "$0.0075" per share; through the Investor Service Center
// $45.00 + $0.0075 a share ($75.00 + $0.0075 advisor-assisted); "Foreign
// Fee $75.00"; annual custodial fee $50; wiring of funds $15.
//   https://www.umb.com/wealth-management/investing/self-direct-investing
//
//   node brokers/umb/umb_scraping.mjs

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
  let text = await response.text();
  text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.umb.com/wealth-management/investing/self-direct-investing", [
  /Commission schedule BASE CHARGE PER SHARE\/CONTRACT CHARGE Stocks \$22\.50 \$0\.0075/i,
  /Foreign Fee \$75\.00/i,
  /All equity trades are routed and executed through National Financial Services/i,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("umb-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
