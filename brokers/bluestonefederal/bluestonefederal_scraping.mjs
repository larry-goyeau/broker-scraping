// What Bluestone Federal Credit Union sells, with no login. Its "My
// Investment Portal" is InvestiFi's self-directed portal inside online
// banking (broker InvestiFi Securities LLC, executing broker and custodian
// RQD Clearing LLC): "Members can buy, sell and hold stock and
// cryptocurrency", with "fractional shares of stocks, ETFs or
// cryptocurrency". Fees, from the FAQ on the page: "The cost to trade
// securities is free" (crypto has its own fee schedule and is not here).
// The page names no list of securities and no segment, board or kind of
// share it does not take; the full list sits inside the portal, behind
// online banking. InvestiFi's partner announcements speak of "more than
// 6,500 stocks and ETFs", but no list is public, so the book is the whole
// US exchange book of the day, read by ../wellstrade/usBook.mjs (shares,
// ADRs, REITs, preferreds, closed-end funds, ETFs and ETNs on Nasdaq,
// NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock Exchange;
// warrants, rights, units, when-issued lines, listed notes and halted
// lines are left out there). The US is one NBBO market: one row per title
// on its primary listing, in dollars. OTC Markets lines are not named on
// the page and are not in the book.
//
// Not a removal, a remark: "Only members over the age of 18 and in good
// standing with the financial institution can buy/sell/hold securities",
// "Commercial accounts may not be used", and the minimum purchase for
// securities is $1.00.
//
//   https://www.bluestonefcu.org/investment-tools/   (offer and fees)
//
//   node brokers/bluestonefederal/bluestonefederal_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.bluestonefcu.org/investment-tools/";

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
  /InvestiFi/,
]);

const rows = stampRows(withoutObligations(await usBook()));
fs.writeFileSync(new URL("bluestonefederal-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
