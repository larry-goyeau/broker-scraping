// What CardinalStone Securities sells online, with no login: every share
// and ETF on the Nigerian Exchange. Its FAQ says "Our online trading portal
// – TradeDirect would give you real-time direct market access to the
// Nigerian Stock Exchange", and its equities page says clients can "Place
// purchase and sale mandates through your online account". No page excludes
// a board, a segment or ETFs, and none names a list of its own, so the book
// is the exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs (shares, listed REITs and ETFs; closed-end
// funds, suspended and delisting lines left out, as written there).
//
// NASD OTC is left out. The broker-list row gives it with no restriction,
// and the FAQ lists "Securities Trading on the Nigerian Stock Exchange (NSE)
// and the National Association of Securities Dealers (NASD) for
// Quoted/Unquoted Equities and Bonds" among its brokerage services, but the
// only online channel it describes, TradeDirect, reaches the Nigerian Stock
// Exchange alone; NASD trades go through the desk (e-mail or written
// mandates), so under the online-only rule they are not written. Bonds and
// FMDQ instruments are not written either. Everything trades in naira.
//
// Fees: the FAQ, "CSSL charges a brokerage commission of 1.00% of the
// consideration for every transaction", with the breakdown "Total 1.375% +
// N4.00/transaction" on a buy (brokerage 1%, SEC fee 0.3%, stamp duty
// 0.075%, CSCS X-Trade Alert N4). The run checks these sentences.
//
//   https://cardinalstonesecurities.com/faqs/
//   https://cardinalstonesecurities.com/equities/
//
//   node brokers/cardinalstone/cardinalstone_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://cardinalstonesecurities.com/faqs/": [
    /Our online trading portal – TradeDirect would give you real-time direct market access to the Nigerian Stock Exchange/,
    /CSSL charges a brokerage commission of 1\.00% of the consideration for every transaction/,
    /Total 1\.375% \+ N4\.00\/transaction/,
  ],
  "https://cardinalstonesecurities.com/equities/": [/Place purchase and sale mandates through your online account/],
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
fs.writeFileSync(new URL("cardinalstone-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `cardinalstone: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
