// What Wealthfront's Brokerage Account (Wealthfront Brokerage LLC) sells,
// with no login. The help centre says: "We allow you to invest in over
// 10,000 stocks, ETFs, and REITs in your Brokerage Account" and, for the
// list, "log in and select 'Explore'". The logged-out explore API gives
// only about 200 curated ETFs, and its search finds nothing more without a
// session, so no full list is public. The product page and the
// announcement of the expanded account ("8,000+ additional ETFs and
// stocks") name no segment, board or kind of share left out. So the
// catalogue starts from the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued
// lines, listed notes and halted lines are left out there). The US is one
// NBBO market: one row per title on its primary listing, in dollars. OTC
// Markets lines are not offered on the pages and are not in the book.
//
// Owner rule 2026-10-25: the N most popular. "We allow you to invest in
// over 10,000 stocks, ETFs, and REITs in your Brokerage Account"
// (https://support.wealthfront.com/hc/en-us/articles/13423531339668), so
// N = 10,000, all kinds together (the broker gives no split): the 10,000
// book lines with the highest 30-day average traded value in dollars
// (../wellstrade/usPopular.mjs) are kept.
//
// Fees: "The Brokerage Account has zero commission fees" (FAQ of the
// product page). Old Stock Investing Accounts not yet moved to the
// Brokerage Account keep a 2,500-line universe (CRSP US Total Market
// members over $2 and $4 million a day); that depends on the client's
// account, so it is a remark, not a removal.
//
//   https://www.wealthfront.com/stock-investing   (offer and fees)
//   https://www.wealthfront.com/blog/expanded-brokerage-account/
//   https://support.wealthfront.com/hc/en-us/articles/13423531339668   (read through the help centre API below)
//
//   node brokers/wealthfront/wealthfront_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.wealthfront.com/stock-investing";
// The help centre pages sit behind a bot wall; the Zendesk API does not.
const ARTICLE = "https://support.wealthfront.com/api/v2/help_center/en-us/articles/13423531339668.json";

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns, json) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  let text = await response.text();
  if (json) text = JSON.parse(text).article.body;
  text = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [/The Brokerage Account has zero commission fees/i, /Buy your own ETFs and stocks/i]);
await new Promise((resolve) => setTimeout(resolve, 1000));
await evidence(ARTICLE, [/invest in over 10,000 stocks, ETFs, and REITs in your Brokerage Account/i], true);

// "over 10,000 stocks, ETFs, and REITs" (help centre): owner rule 2026-10-25, the N most popular.
const TITLES = 10000;
const all = withoutObligations(await usBook());
const top = await topN(all, TITLES);
const chosen = new Set(top);
const rows = stampRows(all.filter((row) => chosen.has(row)));
fs.writeFileSync(new URL("wealthfront-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
const { report } = top;
console.error(`${report.among} lines in the book, ${report.kept} kept (the ${TITLES} most popular); cut-off #${report.cutoff.rank} ${report.cutoff.text}, ${report.cutoff.name}; first left out ${report.firstLeftOut}; kept by size only ${report.keptSizeOnly}, with no data ${report.keptNoData}`);
