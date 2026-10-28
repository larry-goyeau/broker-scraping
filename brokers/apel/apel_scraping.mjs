// What Apel Asset Limited sells through Apel Alpha, with no login: every
// share and ETF on the Nigerian Exchange, its only place. Its home page
// says "We offer efficient and secure trade execution for listed
// securities on the Nigerian Exchange", and its "Trade Stocks on Apel
// Alpha" steps tell the client to "Browse a variety of listed securities
// on the Nigerian Exchange and choose your preferred stocks". No page
// excludes a board, a segment or ETFs, and none names a list of its own,
// so the book is the exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs (shares, listed REITs and ETFs; closed-end
// funds, suspended and delisting lines left out, as written there). Its
// mutual funds (mutualfund.apel.com.ng) are not exchange-traded and are not
// written. The Apel Alpha page's "Multicurrency global account" is about
// the client's wallet; no page offers a foreign market, and every line
// trades in naira.
//
// Fees: the Apel Alpha page, "Reduced brokerage Commission: Trade at 0.50%
// brokerge [sic] commission" and "Trade at a reduced brokerage commission
// of 0.50%". The run checks these sentences.
//
//   https://asset.apel.com.ng/
//   https://asset.apel.com.ng/apelalpha
//
//   node brokers/apel/apel_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://asset.apel.com.ng/": [
    /trade execution for listed securities on the Nigerian Exchange/,
    /Browse a variety of listed securities on the Nigerian Exchange/,
  ],
  "https://asset.apel.com.ng/apelalpha": [/Trade at 0\.50% brokerg?e commission/, /reduced brokerage commission of 0\.50%/],
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
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
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
fs.writeFileSync(new URL("apel-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `apel: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
