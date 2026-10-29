// What Regency Assets Management sells online, with no login: every share
// and ETF on the Nigerian Exchange. Its home page offers an "E-Trading
// Portal" and the Regency Mobile App ("Access your investment portfolio,
// monitor market opportunities, and trade securely with the Regency Mobile
// App"), and the firm is a "Trading Licence Holder of NGX Ltd". No page
// excludes a board, a segment or ETFs, and none names a list of its own,
// so the book is the exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs (shares, listed REITs and ETFs; closed-end
// funds, suspended and delisting lines left out, as written there).
//
// NASD OTC is left out. The broker-list row gives it with no restriction,
// and the firm is a "Dealing Member of NASD", but no page offers NASD
// online: its NASD business goes through forms ("NASD Transfer Form &
// Authority Letter", "NASD Trading Account Transfer Form") and the desk,
// and the portal and app quote NGX prices. Under the online-only rule it is
// not written. Bonds and FMDQ instruments are not written either.
// Everything trades in naira.
//
// Fees: the home page's "Stock Calculator" (javascript/stock-calculator.js)
// prices a trade with a "Brokerage Fee" of 1.35% of the consideration
// (consideration * 1.35 * 0.01), plus SEC or NGX and CSCS fees of 0.3%,
// stamp duty of 0.08% and a N4 trade alert; the FAQ says "When you buy or
// sell shares you pay a maximum of 4% as total fees". The run checks these.
//
//   https://regencyng.net/
//   https://regencyng.net/javascript/stock-calculator.js
//   https://regencyng.net/faq.php
//
//   node brokers/regency/regency_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://regencyng.net/": [
    /E-Trading Portal/,
    /trade securely with the Regency Mobile App/,
    /Trading Licence Holder of NGX Ltd/,
    /Stock Calculator/,
  ],
  "https://regencyng.net/faq.php": [/When you buy or sell shares you pay a maximum of 4% as total fees/],
};
const RAW = {
  "https://regencyng.net/": [/src="javascript\/stock-calculator\.js"/],
  "https://regencyng.net/javascript/stock-calculator.js": [/let brokerage = consideration \* 1\.35 \* 0\.01/],
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
fs.writeFileSync(new URL("regency-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `regency: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
