// What Awaed (Awaed Alosool Capital, Riyadh) sells in shares and ETFs, with
// no login, through its app: US stocks and Saudi stocks. The App Store page
// says "Whether you want to trade U.S. or Saudi stocks" and "Commission-Free
// Trading: Buy and sell U.S and Saudi stocks with zero commission"; the
// site's FAQ answers "What are the financial markets available for trading
// on Awaed? US markets." and "There are no fees for trading stocks in US
// markets". broker-list gives the two places, United States and Saudi
// Arabia; the site's FAQ names only the US, the store page both.
//
// United States: no list, no stated count and no exclusion, so the whole US
// book, ../wellstrade/usBook.mjs (one row per title on its primary listing;
// what it drops is written there). The Sharia filter only marks titles
// ("Easily find stocks that comply with Sharia guidelines"); it does not
// restrict the book. OTC is named nowhere and is left out.
//
// Saudi Arabia: "Saudi stocks", with no exchange named, so the Saudi
// Exchange's Main Market (shares, REITs and ETFs, less suspended lines),
// ../investsky/tadawulBook.mjs. Nomu, the parallel market open to qualified
// investors only, is named nowhere and is left out.
//
// Fees: zero commission on both markets (App Store text above, and the FAQ
// for the US). The FAQ also says the dollar is held at a fixed 3.75 riyals.
//
//   https://awaed.capital/en/faqs
//   https://awaed.capital/en
//   https://apps.apple.com/sa/app/awaed-invest-trade/id1610134585
//
//   node brokers/awaed/awaed_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { tadawulBook } from "../investsky/tadawulBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const FAQ = "https://awaed.capital/en/faqs";
const APP = "https://itunes.apple.com/lookup?id=1610134585";
const EVIDENCE = [
  [FAQ, [/What are the financial markets available for trading on Awaed\? US markets\./, /There are no fees for trading stocks in US markets/]],
  ["https://awaed.capital/en", [/commission-free Saudi trading platform/]],
];
const STORE = [/trade U\.S\. or Saudi stocks/, /Buy and sell U\.S and Saudi stocks with zero commission/];

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

for (const [url, patterns] of EVIDENCE) {
  const text = textOf(await get(url));
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  if (/\bNomu\b|parallel market|\bOTC\b/i.test(text)) console.error(`${url} now names Nomu or OTC: check the places`);
}
const store = (JSON.parse(await get(APP))?.results?.[0]?.description || "").replace(/\s+/g, " ");
for (const pattern of STORE) if (!pattern.test(store)) throw new Error(`the Awaed App Store text no longer says ${pattern}`);

const tadawul = await tadawulBook();
const us = await usBook();
const kept = stampRows(withoutObligations([...tadawul.rows, ...us]));

const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
if ((count["Tadawul STOCK"] || 0) < 240 || (count["Tadawul ETF"] || 0) < 10) throw new Error("short Tadawul book");
if (kept.length - (count["Tadawul STOCK"] || 0) - (count["Tadawul ETF"] || 0) < 10_000) throw new Error("short US book");
fs.writeFileSync(new URL("awaed-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(`awaed: ${kept.length} rows`);
console.table(count);
console.error(`left out: Tadawul ${tadawul.suspended.join("; ") || "none"} (session ${tadawul.session})`);
console.error(`  US ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}`);
