// What Quantum Zenith Securities & Investments (QZSIL) sells online, with
// no login: every share and ETF on the Nigerian Exchange, its only place.
// Its FAQ opens with "Stockbroking for securities of government and
// companies which are quoted on The Nigerian Stock Exchange", and its
// Securities Dealing page says it is "a Dealing Member of The Nigerian
// Stock Exchange" offering "Execution of stock trades on behalf of our
// clients" and a "State of the art online trading platform" (the
// E-Business Suite, whose FAQ explains "How do I Trade? ... Select the
// Action, Buy or Sell"). No page excludes a board, a segment or ETFs, and
// none names a list of its own, so the book is the exchange's whole
// listing of the day, read by ../morgancapital/ngxWhole.mjs (shares,
// listed REITs and ETFs; closed-end funds, suspended and delisting lines
// left out, as written there). Its treasury bills and primary-market bonds
// are not shares and are not written. Everything trades in naira.
//
// Fees: the FAQ, "What are the charges for doing trades through Quantum
// Zenith Securities Ltd (QZSIL) on the Stock Exchange.": "Our total charge
// for buying is 1.665% and selling is 2.010% of the value of the
// transaction." The run checks these sentences.
//
//   https://quantumzenithsecurities.com.ng/faqs/
//   https://quantumzenithsecurities.com.ng/securities-dealing/
//   https://isecurity.quantumzenithsecurities.com.ng/EBizNew/Home/FAQs
//
//   node brokers/quantumzenith/quantumzenith_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://quantumzenithsecurities.com.ng/faqs/": [
    /Stockbroking for securities of government and companies which are quoted on The Nigerian Stock Exchange/,
    /Our total charge for buying is 1\.665% and selling is 2\.010% of the value of the transaction/,
  ],
  "https://quantumzenithsecurities.com.ng/securities-dealing/": [
    /Dealing Member of The Nigerian Stock Exchange/,
    /Execution of stock trades on behalf of our clients/,
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
    .replace(/&#x27;|&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&nbsp;/g, " ")
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
fs.writeFileSync(new URL("quantumzenith-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `quantumzenith: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
