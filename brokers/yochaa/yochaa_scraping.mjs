// What Yochaa (a wealth app built and run by RME-Ideas Limited, Lagos)
// sells in shares and ETFs, with no login. It publishes no list: its pages
// name the two markets and print a tariff for each.
//
//   Home: "Yochaa is a wealth platform that helps users invest across
//   Nigerian and US markets." and "With Yochaa, you can: Invest in
//   Nigerian and US stocks".
//   Fees: "US Transaction charges Trades up to $100 $1, Above $100 but
//   under $1,000 1.4%, Above $1,000 but under $10,000 1.2%, Above to
//   $10,000 0.9%"; "NG Transaction charges ... Brokerage fees 1.00%" plus
//   stamp duty, CSCS, NGX and SEC charges.
//   Terms: "Yochaa is a mobile app designed to enable investors in the
//   Nigerian equity market buy and sell stocks".
//
//   https://yochaa.com/
//   https://yochaa.com/fees
//   https://yochaa.com/terms-of-service
//
// No page names an exchange, a board, a kind of share it does not sell, or
// a number of titles. So:
// - Nigeria: the whole Nigerian Exchange book (../morgancapital/
//   ngxWhole.mjs): Main, Premium, Growth and Non-Interest board shares,
//   listed REITs and ETFs, in naira, less the lines suspended or being
//   delisted (closed-end funds, bonds and indexes are not in it). ETFs
//   stay: no page excludes them.
// - United States: the whole US exchange book (../wellstrade/usBook.mjs),
//   one row per title on its primary listing; the pages name no US
//   exchange, so the country's exchanges are kept. No OTC lines.
// broker-list.json gives the same two places.
//
//   node brokers/yochaa/yochaa_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://yochaa.com/": [/helps users invest across Nigerian and US markets/, /Invest in Nigerian and US stocks/],
  "https://yochaa.com/fees": [/US Transaction charges/, /NG Transaction charges Buy transaction Brokerage fees 1\.00%/],
};

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&mdash;/g, "—")
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

for (const [url, patterns] of Object.entries(EVIDENCE)) {
  const text = await getText(url);
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  if (/\b\d{1,3}(,\d{3})+\+?\s+(US\s+)?(stocks|shares|companies)\b/i.test(text)) console.error(`${url} now states a number of titles: apply the top-N rule`);
}

const ngx = await ngxWhole();
const us = await usBook();
const kept = stampRows(withoutObligations([...ngx.rows, ...us]));

const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
if ((count[`${PLACE} STOCK`] || 0) < 120 || (count[`${PLACE} ETF`] || 0) < 8) throw new Error("short NGX book");
if (kept.length - ngx.rows.length < 10_000) throw new Error(`only ${kept.length - ngx.rows.length} US rows`);
fs.writeFileSync(new URL("yochaa-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(`yochaa: ${kept.length} rows (NGX ${ngx.day}, Daily Official List ${ngx.dolDay})`);
console.table(count);
console.error(`left out: NGX ${ngx.dropped.map((line) => line.ticker).join(", ") || "none"} suspended or delisting; ${[...ngx.leftOut].map(([label, value]) => `${value} ${label}`).join(", ")}`);
console.error(`  US ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}`);
