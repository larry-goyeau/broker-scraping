// What APT Securities and Funds sells online, with no login: every share
// and ETF on the Nigerian Exchange. Its E-Trading Portal page offers
// "Online Real-Time Buy or/and Sell of stocks" through APT E-Trade, and its
// terms of use say "Mandates placed through the online portal are executed
// directly on the Nigerian Exchange Limited". No page excludes a board, a
// segment or ETFs, and none names a list of its own, so the book is the
// exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs (shares, listed REITs and ETFs; closed-end
// funds, suspended and delisting lines left out, as written there).
//
// NASD OTC is left out, as the broker-list row says ("By phone/advisor
// only"): the services page lists "Over the Counter Trading (OTC-NASD)"
// among the securities it deals in, but the portal executes on the
// Nigerian Exchange only and no page offers NASD online. Bonds, treasury
// bills and sukuk are not written. Everything trades in naira (the portal's
// "Customer Statement in NAIRA/USD/GBP" is about statements, not markets).
//
// Fees: the home page's "Stock Calculator" (js/calculator.js) prices a
// trade with a "Brokerage Fee" of 1.35% of the consideration
// (considerationAmount * 1.35 * 0.01), plus SEC or NGX and CSCS fees of
// 0.3%, stamp duty and a N4 trade alert. 1.35% is the regulatory maximum.
// The run checks the page and the script.
//
//   https://www.aptsecurities.com/
//   https://www.aptsecurities.com/js/calculator.js
//   https://www.aptsecurities.com/e-trading-portal.php
//   https://www.aptsecurities.com/terms-of-use.php
//
//   node brokers/aptsecurities/aptsecurities_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://www.aptsecurities.com/": [/Stock Calculator/, /Brokerage Fee/],
  "https://www.aptsecurities.com/e-trading-portal.php": [/Online Real-Time Buy or\/and Sell of stocks/],
  "https://www.aptsecurities.com/terms-of-use.php": [
    /Mandates placed through the online portal are executed directly on the Nigerian Exchange Limited/,
  ],
};
const RAW = {
  "https://www.aptsecurities.com/": [/src="js\/calculator\.js"/],
  "https://www.aptsecurities.com/js/calculator.js": [/calDom\.brokerage\.innerHTML = thousander\(considerationAmount \* 1\.35 \* 0\.01\)/],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");

for (const [url, patterns] of Object.entries(EVIDENCE)) {
  const text = plain(await fetchText(url));
  for (const pattern of patterns) {
    if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  }
  await sleep(500);
}

// Pages whose evidence sits in the HTML or script source, not the visible text.
for (const [url, patterns] of Object.entries(RAW)) {
  const source = (await fetchText(url)).replace(/\s+/g, " ");
  for (const pattern of patterns) {
    if (!pattern.test(source)) throw new Error(`${url} no longer has ${pattern}`);
  }
  await sleep(500);
}

const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("aptsecurities-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `aptsecurities: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
