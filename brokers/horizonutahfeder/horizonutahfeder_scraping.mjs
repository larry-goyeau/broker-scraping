// What Horizon Utah Federal Credit Union sells in shares and exchange-traded
// products, with no login. Its "Crypto and Securities" portal is InvestiFi's
// self-directed portal inside It'sMe247 online banking (broker InvestiFi
// Securities LLC, executing broker and custodian RQD Clearing LLC):
// "Members can buy, sell and hold stock and cryptocurrency", "you can buy
// fractional shares of stocks, ETFs or cryptocurrency". The page names no
// list of securities and no segment, board or kind of listed share or fund
// it does not take; the list sits inside the portal, behind online banking.
// InvestiFi's partner announcements speak of "over 6,500 stocks and ETFs"
// (cuinsight.com, Mid Minnesota FCU), but no list is public, so the
// catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. It is larger than what the portal shows.
//
//   https://www.myhorizoncu.com/cryptocurrency-and-securities/
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not named on the page and are
// not added. The US is one NBBO market: one row per title on its primary
// listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): "Only
// members over the age of 18 and in good standing with the financial
// institution can buy/sell/hold securities", "Commercial accounts may not
// be used", brokerage "available only to residents of the United States",
// minimum purchase for securities $1.00. The Texas, Idaho and New York
// restriction on the page is for new crypto accounts only.
//
// Fees, from the FAQ on the page: "The cost to trade securities is free"
// (crypto has its own fee schedule and is not here).
//   https://www.myhorizoncu.com/cryptocurrency-and-securities/
//
//   node brokers/horizonutahfeder/horizonutahfeder_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.myhorizoncu.com/cryptocurrency-and-securities/";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /The cost to trade securities is free/i,
  /buy, sell and hold stock and cryptocurrency/i,
  /fractional shares of stocks, ETFs or cryptocurrency/i,
  /InvestiFi Securities/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("horizonutahfeder-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
