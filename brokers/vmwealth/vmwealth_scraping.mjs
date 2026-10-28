// What VM Wealth Management (VM Group, Jamaica) sells in shares and
// exchange-traded funds, with no login. VM Wealth prints no list.
//
// Jamaica. VM Wealth is "a Licensed Securities Dealer Member of the JSE
// since 1994"; its stocks page says "we facilitate trading in JMD and USD
// stocks" and "Buy and sell stocks online with JTrader" (the exchange's
// JTraderPro platform), and the schedule of fees and charges (March 2026)
// prices "Equity Trade Commission (Online)" at 2.5%. No page names a
// market, a board or a kind of JSE share it does not sell, so the Jamaican
// part is the JSE's three equity markets read by ../jmmb/jamaicaBook.mjs:
// the Main and Junior Markets in JMD and the USD Market, ordinary and
// preference shares, and Sagicor's two index funds typed ETF. A company
// quoted in JMD and in USD has one row per currency, as the exchange
// prints it. Left out there: the bond markets, lines on no price board,
// and lines the JSE marks suspended.
//
// United States. The US equities page: "We've partnered with Interactive
// Brokers (IB) ... to give you direct access to the U.S. stock market",
// "Direct access to NYSE and NASDAQ", "Pay as little as US$10 per trade,
// with a cap at US$0.025 per share", and "Prefer to trade independently?
// We'll set you up"; the fee schedule lists "IB Trading (USD equities)"
// with "$0.025 Per unit". There is no list, so the owner's rule for a place
// with no list applies: the whole US exchange book of the day
// (../wellstrade/usBook.mjs), kept to the two markets VM names, NYSE and
// Nasdaq ("NYSE" read as the NYSE-named markets NYSE, NYSE American, NYSE
// Arca and NYSE Texas; see ../tfcapital/usTop.mjs). Lines listed on Cboe
// BZX (mostly ETFs), the Texas Stock Exchange or IEX stay out. "U.S.
// equities" names no kind it leaves out, so the ETFs listed on those
// markets stay (a broker that sells the shares of an exchange gets its
// ETFs too). usBook drops warrants, rights, units, when-issued lines,
// listed notes and lines with an open trade halt; bonds go through
// withoutObligations. OTC lines are not named and not added. The US is
// one NBBO market: one row per title, on its listing market, in dollars.
// broker-list.json gives the Jamaica Stock Exchange, NYSE and Nasdaq, the
// same places.
//
//   https://vmwealth.myvmgroup.com/personal-solutions/stocks/
//   https://vmwealth.myvmgroup.com/personal-solutions/us-equities/
//   https://vmwealth.myvmgroup.com/digital-access-points/
//   https://vmwealth.myvmgroup.com/wp-content/uploads/2026/06/Schedule-of-Fees-Charges-March-2026.pdf   (fees, page 4)
//
//   node brokers/vmwealth/vmwealth_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { jamaicaBook } from "../jmmb/jamaicaBook.mjs";
import { NYSE_NASDAQ } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://vmwealth.myvmgroup.com/personal-solutions/stocks/", [
  /we facilitate trading in JMD and USD stocks/,
  /Buy and sell stocks online with JTrader/,
]);
await pause();
await evidence("https://vmwealth.myvmgroup.com/personal-solutions/us-equities/", [
  /Direct access to NYSE and NASDAQ/,
  /Interactive Brokers \(IB\)/,
  /US\$10 per trade, with a cap at US\$0\.025 per share/,
]);

const jamaica = await jamaicaBook({ quiet: true });
const book = await usBook();
const us = book.filter((row) => NYSE_NASDAQ.has(row.mic));
for (const ticker of ["AAPL", "JPM", "SPY", "QQQ"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the US book`);

const rows = stampRows(withoutObligations([...jamaica, ...us]));
if (rows.length < jamaica.length + 8000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("vmwealth-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.currency} ${row.type}`] = (counts[`${row.mic} ${row.currency} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
if (jamaica.dropped) console.error(`JSE dropped: ${JSON.stringify(jamaica.dropped)}`);
console.error(`US directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, items] of Object.entries(book.report.leftOut)) if (items.length) console.error(`US left out ${items.length} ${what}`);
console.error(`US left out ${book.length - us.length} lines listed off NYSE/Nasdaq`);
