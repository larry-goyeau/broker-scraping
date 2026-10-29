// What United Capital Securities sells online, with no login: every share
// and ETF on the Nigerian Exchange. Its securities page says "Our digital
// platform provides direct market access, to enable clients to trade
// stocks, real-time on the floor of the Nigerian Exchange (NGX)" (InvestNow,
// trade.investnow.ng), and the FAQ: "With United Capital Securities, you can
// do this easily through the InvestNow app or website". No page excludes a
// board, a segment or ETFs (the FAQ names ETFs among the transaction types),
// and none names a list of its own, so the book is the exchange's whole
// listing of the day, read by ../morgancapital/ngxWhole.mjs (shares, listed
// REITs and ETFs; closed-end funds, suspended and delisting lines left out,
// as written there).
//
// NASD OTC is left out, as the broker-list row says ("By phone/advisor
// only"): the securities page names "Listed Equities on the NASD OTC
// trading platform" among its dealing services, but the online platform it
// describes trades "on the floor of the Nigerian Exchange (NGX)" only. The
// "International Trading Desk" for other African markets is a desk service
// and is not written either, nor are FMDQ bonds and bills. Everything
// trades in naira.
//
// Fees: the FAQ, "What are the brokerage fees for stock trading?": "Typical
// fees on the Nigerian Exchange (NGX): Buy: 1.5% of trade value Sell: 1.8%
// of trade value", all charges included ("Rates may vary slightly depending
// on the transaction type"). The run checks these sentences.
//
//   https://unitedcapitalplcgroup.com/securities/
//   https://unitedcapitalplcgroup.com/faq/
//
//   node brokers/unitedcapital/unitedcapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://unitedcapitalplcgroup.com/securities/": [
    /Our digital platform provides direct market access, to enable clients to trade stocks, real-time on the floor of the Nigerian Exchange \(NGX\)/,
  ],
  "https://unitedcapitalplcgroup.com/faq/": [
    /With United Capital Securities, you can do this easily through the InvestNow app or website/,
    /Typical fees on the Nigerian Exchange \(NGX\): Buy: 1\.5% of trade value Sell: 1\.8% of trade value/,
  ],
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

const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("unitedcapital-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `unitedcapital: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
