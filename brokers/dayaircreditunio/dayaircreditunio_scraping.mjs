// What Day Air Credit Union sells, with no login. Its Invest page offers
// InvestiFi's "Self-Directed Investment Portal" inside online banking and
// the app (broker InvestiFi Securities LLC, executing broker and custodian
// RQD Clearing LLC): "The ability to buy and sell stocks, ETFs, and
// cryptocurrency", and "Trade from a selection of exchange-listed stocks
// and ETFs with ... zero commissions on trades — no fees on purchases"
// (crypto is priced apart and is not here). The page names no list of
// securities and no segment, board or kind of share it does not take; the
// "selection" is only visible inside the portal, behind online banking.
// InvestiFi's partner announcements speak of "more than 6,500 stocks and
// ETFs", but no list is public, so the book is the whole US
// exchange book of the day, read by ../wellstrade/usBook.mjs (shares,
// ADRs, REITs, preferreds, closed-end funds, ETFs and ETNs on Nasdaq,
// NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock Exchange;
// warrants, rights, units, when-issued lines, listed notes and halted
// lines are left out there). The US is one NBBO market: one row per title
// on its primary listing, in dollars. OTC Markets lines are not named on
// the page and are not in the book.
//
// Not a removal, a remark: "Only members over the age of 18 and in good
// standing with Day Air Credit Union can buy, sell, or hold securities",
// "Commercial accounts may not be used", "only market orders are
// available for trading", during market hours only.
//
//   https://dayair.org/invest/   (offer and fees)
//
//   node brokers/dayaircreditunio/dayaircreditunio_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://dayair.org/invest/";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /zero commissions on trades/i,
  /no fees on purchases/i,
  /buy and sell stocks, ETFs, and cryptocurrency/i,
  /InvestiFi/,
]);

const rows = stampRows(withoutObligations(await usBook()));
fs.writeFileSync(new URL("dayaircreditunio-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
