// What MorganCapital Securities sells through iTrade, with no login: every
// share and ETF on the Nigerian Exchange, its only place. Morgan Capital is
// an "NGX dealing member since 1997"; its iTrade page says "Orders straight
// to the Exchange: Instructions are routed to the NGX by MorganCapital
// Securities", and its platform guide, under "One account. The whole
// Nigerian market.", says "Trade NGX stocks & ETFs. Buy and sell any listed
// share from the markets screen." No page excludes a board, a segment or
// ETFs, and none names a list of its own, so the book is the exchange's
// whole listing of the day, read by ./ngxWhole.mjs (shares, listed REITs
// and ETFs; closed-end funds, suspended and delisting lines left out, as
// written there). Its bonds, treasury bills, IPOs and mutual funds are not
// exchange-traded shares and are not written. Diaspora clients "can fund
// in USD, GBP or EUR at the live rate" (FAQ), but every line trades in
// naira.
//
// Fees: the guide's "Fees, explained" table, a worked N100,000 buy:
// "Brokerage, Morgan Capital's commission, 1.35%", plus NGX 0.03%, SEC
// 0.03%, CSCS 0.06% and VAT 7.5% on the brokerage and CSCS portions,
// "≈1.58%" in all; the FAQ's "What does trading cost?" gives the same
// "Brokerage of 1.35% plus small statutory levies". The iTrade page itself
// advertises "0.75% brokerage". The run checks these sentences.
//
//   https://www.morgancapitalgroup.com/itrade
//   https://www.morgancapitalgroup.com/learn
//   https://www.morgancapitalgroup.com/faq
//
//   node brokers/morgancapital/morgancapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "./ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://www.morgancapitalgroup.com/itrade": [/routed to the NGX by MorganCapital Securities/, /0\.75% brokerage/],
  "https://www.morgancapitalgroup.com/learn": [
    /Trade NGX stocks & ETFs/,
    /Buy and sell any listed share from the markets screen/,
    /Brokerage Morgan Capital.s commission 1\.35%/,
  ],
  "https://www.morgancapitalgroup.com/faq": [/Brokerage of 1\.35% plus small statutory levies/],
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
fs.writeFileSync(new URL("morgancapital-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `morgancapital: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
