// What InvestSky (a CMA-permitted social trading platform; orders are
// executed and held by anb capital, CMA licence 07072-37) sells in shares
// and ETFs to its Saudi clients, with no login. It publishes no list of
// titles: its pages name the two markets and price each.
//
//   Home: "Access over 15,000 Stocks & ETFs : Saudi & US Stock Markets".
//   Help: "Access KSA-listed and US-listed stocks, held with our brokerage
//   partner"; trading hours are given for the "Saudi Stock Market
//   (Tadawul)" and the "US Stock Market".
//   Help, "Why is a stock unavailable?": "Most stocks and ETFs listed on
//   major exchanges are available on InvestSky through our brokerage
//   partner", except "Over-the-counter (OTC) stocks - not listed on major
//   exchanges" and "Stocks restricted due to specific regulatory or market
//   conditions" (no list of the latter is given).
//   Pricing: Saudi "Commission 0.105% of the traded value" (0.155% with
//   the CMA and Tadawul fees); US "Stocks over $1 FREE", "Stocks under $1
//   1.5% of trade value", plus FINRA fees on sells.
//
//   https://investsky.com/en/saudi
//   https://investsky.com/en/saudi/pricing
//   https://help.investsky.com/en/articles/10255955-what-s-investsky
//   https://help.investsky.com/en/articles/10261026-why-is-a-stock-unavailable
//   https://help.investsky.com/en/articles/10261072-what-are-the-market-trading-hours
//
// Saudi place: the Saudi Exchange Main Market book (./tadawulBook.mjs):
// every Main Market share and REIT and every ETF, in riyals, less the
// suspended lines. The Nomu parallel market is not added: no InvestSky
// page names it, and Nomu is open to qualified investors only.
// US place: the whole US exchange book (../wellstrade/usBook.mjs), one row
// per title on its primary listing; the pages name no US exchange, only
// "US-listed stocks" and "major exchanges", so the country's exchanges are
// kept. OTC lines are excluded by InvestSky and are not in that book.
// Sub-$1 shares stay (they have their own price on the pricing page).
// broker-list.json names Tadawul, NYSE and Nasdaq.
//
// Stated count: "over 15,000 Stocks & ETFs" covers both markets together.
// The two whole books hold about 12,500 lines, fewer than the number, so
// the top-N rule cuts nothing; the run stops if the stated number ever
// falls below the rows written.
//
//   node brokers/investsky/investsky_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { tadawulBook } from "./tadawulBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const HELP = "https://help.investsky.com/en/articles";
const EVIDENCE = [
  ["https://investsky.com/en/saudi", [/Access over ([\d,]+) Stocks & ETFs\s*:\s*Saudi & US Stock Markets/]],
  ["https://investsky.com/en/saudi/pricing", [/Commission 0\.105% of the traded value/, /Stocks over \$1 FREE/]],
  [`${HELP}/10255955-what-s-investsky`, [/Access KSA-listed and US-listed stocks/]],
  [`${HELP}/10261026-why-is-a-stock-unavailable`, [/Most stocks and ETFs listed on major exchanges are available/, /Over-the-counter \(OTC\) stocks/]],
  [`${HELP}/10261072-what-are-the-market-trading-hours`, [/Saudi Stock Market \(Tadawul\)/]],
];

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return textOf(await response.text());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

let stated = 0;
for (const [url, patterns] of EVIDENCE) {
  const text = await getText(url);
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (!found) throw new Error(`${url} no longer says ${pattern}`);
    if (found[1]) stated = Number(found[1].replace(/,/g, ""));
  }
  if (/\bNomu\b|parallel market/i.test(text)) console.error(`${url} now names Nomu: consider adding it`);
}

const tadawul = await tadawulBook();
const us = await usBook();
const kept = stampRows(withoutObligations([...tadawul.rows, ...us]));
if (kept.length > stated) throw new Error(`InvestSky states over ${stated} stocks and ETFs but the books hold ${kept.length}: apply the top-N rule`);

const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
if ((count["Tadawul STOCK"] || 0) < 240 || (count["Tadawul ETF"] || 0) < 10) throw new Error("short Tadawul book");
if (kept.length - tadawul.rows.length < 10_000) throw new Error(`only ${kept.length - tadawul.rows.length} US rows`);
fs.writeFileSync(new URL("investsky-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(`investsky: ${kept.length} rows (stated "over ${stated}")`);
console.table(count);
console.error(`left out: Tadawul ${tadawul.suspended.join("; ") || "none"} (session ${tadawul.session})`);
console.error(`  US ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}`);
