// What Crypto.com sells in US stocks (the Stocks tab of the Crypto.com
// App, offered to US persons by Foris Capital US LLC and cleared by Apex
// Clearing), with no login. Its stocks page says "Buy and sell 12,000+
// stocks and ETFs at zero commission" and "No commission or hidden fees
// ... zero commissions and no account maintenance fees"; its help article
// says the feature "lets you trade over 12,000 stocks and exchange-traded
// funds (ETFs)" and "Foris Capital does not charge any fees for opening
// and maintaining a stock account, nor a commission for stock and ETF
// trading" (only the SEC and FINRA sale fees and ADR fees are passed on).
// No list of the 12,000 lines is published outside the app, and no page
// names a board, a segment or a kind of listed share it does not take, so
// the book starts from the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued
// lines, listed notes and halted lines are left out there), about 12,200
// lines. The US is one NBBO market: one row per title on its primary
// listing, in dollars.
//
// Size of the offer, owner rule 2026-10-25: the N most popular. Crypto.com
// gives one count for the US place, stocks and ETFs together:
//   "Buy and sell 12,000+ stocks and ETFs at zero commission"
//     https://crypto.com/us/stocks/stock-trading-account
//   "lets you trade over 12,000 stocks and exchange-traded funds (ETFs)"
//     https://help.crypto.com/en/articles/10153377-stock-and-etf-trading-via-the-crypto-com-app
// So N = 12,000 over shares, ETFs and ETNs together (no split by kind):
// the 12,000 lines with the highest 30-day average daily traded value in
// dollars, ranked by ../wellstrade/usPopular.mjs (topN).
//
// Left out: OTC Markets lines, which no Crypto.com stocks page names (its
// "OTC" pages are the crypto OTC desk); bonds (withoutObligations). The
// tokenized stocks Crypto.com sells outside the US (Foris Capital CY,
// derivatives) are not this account.
//
// Not a removal, a remark: "Stocks is currently available to U.S.
// customers only", and 24/5 overnight trading covers only "selected US
// stocks and ETFs".
//
//   https://crypto.com/us/stocks/stock-trading-account   (fees)
//   https://help.crypto.com/en/articles/10153377-stock-and-etf-trading-via-the-crypto-com-app
//
//   node brokers/cryptocom/cryptocom_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://crypto.com/us/stocks/stock-trading-account";
const N = 12_000; // "12,000+ stocks and ETFs"
const HELP = "https://help.crypto.com/en/articles/10153377-stock-and-etf-trading-via-the-crypto-com-app";

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|’/g, "'")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [/Buy and sell 12,000\+ stocks and ETFs at zero commission/i, /zero commissions and no account maintenance fees/i]);
await new Promise((resolve) => setTimeout(resolve, 1000));
await evidence(HELP, [
  /lets you trade over 12,000 stocks and exchange-traded funds \(ETFs\)/i,
  /nor a commission for stock and ETF trading/i,
]);

const book = await usBook();
const offered = withoutObligations(book);
const top = await topN(offered, N);
const chosen = new Set(top);
const rows = stampRows(offered.filter((row) => chosen.has(row)));
if (rows.length !== Math.min(N, offered.length) || rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("cryptocom-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
console.error(`owner rule: the ${N} most popular of ${top.report.among} lines; #${top.report.cutoff.rank} ${top.report.cutoff.text}; first left out ${top.report.firstLeftOut}; kept with no data ${top.report.keptNoData}, by size only ${top.report.keptSizeOnly}`);
