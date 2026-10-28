// What Uphold sells in shares and exchange-traded products, with no login.
// Its equities are a brokerage account at Uphold Securities Inc. (cleared
// and custodied by Apex Clearing), opened inside the Uphold app. The help
// centre says Uphold Securities "lets you buy and sell U.S. stocks and ETFs
// directly in the Uphold app", and "You can invest as little as $5 in any
// stock or ETF". The equities page says "Buy 4000+ U.S. Stocks and ETFs"
// and that the securities are "fractional shares of U.S. listed equities",
// offered "in a fractional capacity".
//
//   https://support.uphold.com/hc/en-us/articles/53122698072859   (Get started with Equities)
//   https://support.uphold.com/hc/en-us/articles/53122864070171   (Equities trading basics)
//   https://uphold.com/en-us/equities
//
// The app's list of 4,000+ titles is not public, and no page names a board,
// a segment or a kind of listed share or fund left out (the ETF disclosure
// covers leveraged and inverse products and ETNs). So the catalogue starts
// from the whole US exchange book of the day (../wellstrade/usBook.mjs):
// shares, ADRs, REITs, partnership units, preferreds, closed-end funds,
// ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the
// Texas Stock Exchange, less the lines with an open trade halt, about
// three times the count Uphold gives.
//
// Size of the offer, owner rule 2026-10-25: the N most popular. Uphold
// gives one count for the US place, stocks and ETFs together:
//   "Buy 4000+ U.S. Stocks and ETFs."   https://uphold.com/en-us/equities
// So N = 4,000 over shares, ETFs and ETNs together (no split by kind): the
// 4,000 lines with the highest 30-day average daily traded value in
// dollars, ranked by ../wellstrade/usPopular.mjs (topN). Which 4,000 the
// app really holds is not public; these are the most traded.
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the pages say
// "U.S. listed equities". The US is one NBBO market: one row per title, on
// its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): US
// residents only, "Not available in Louisiana, New York, any U.S.
// Territories"; market orders only ("Limit orders and stop orders are not
// currently supported"); trades can be funded in USD or in crypto, which
// Uphold HQ converts to USD at its own exchange fee.
//
// Fees (Uphold Securities Schedule of Fees and Charges, effective 21 July
// 2026): "Commission on equity trades, including fractional shares $0.00";
// SEC Section 31 and FINRA TAF are listed but "Uphold Securities pays these
// fees and does not charge them to customers" (the help centre's Funding &
// Fees article still says two regulatory fees are applied on sales);
// ACATS transfer out $100.
//   https://uphold.com/legal/security-disclosures   (Schedule of Fees and Charges)
//   https://support.uphold.com/hc/en-us/articles/53123035115163   (Funding & Fees)
// The help centre pages sit behind a bot wall; the Zendesk API does not,
// so the articles are read through it below.
//
//   node brokers/uphold/uphold_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const N = 4_000; // "Buy 4000+ U.S. Stocks and ETFs"
const article = (id) => `https://support.uphold.com/api/v2/help_center/en-us/articles/${id}.json`;
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns, json) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  let text = await response.text();
  if (json) text = JSON.parse(text).article.body;
  text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(article(53122698072859), [/buy and sell U\.S\. stocks and ETFs/i, /Not available in Louisiana, New York/i], true);
await pause();
await evidence(article(53122864070171), [/in any stock or ETF/i, /We support market orders only/i], true);
await pause();
await evidence("https://uphold.com/en-us/equities", [/Buy 4000\+ U\.S\. Stocks and ETFs/i, /U\.S\. listed equities/i]);
await pause();
await evidence("https://uphold.com/legal/security-disclosures", [/Commission on equity trades, including fractional shares \$0\.00/i]);

const book = await usBook();
const offered = withoutObligations(book);
const top = await topN(offered, N);
const chosen = new Set(top);
const rows = stampRows(offered.filter((row) => chosen.has(row)));
if (rows.length !== N) throw new Error(`${rows.length} rows, not ${N}`);
fs.writeFileSync(new URL("uphold-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (offered.length < book.length) console.error(`${book.length - offered.length} bonds left out`);
console.error(`owner rule: the ${N} most popular of ${top.report.among} lines; #${top.report.cutoff.rank} ${top.report.cutoff.text}; first left out ${top.report.firstLeftOut}; kept with no data ${top.report.keptNoData}, by size only ${top.report.keptSizeOnly}`);
