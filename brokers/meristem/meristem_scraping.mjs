// What Meristem Securities sells through MeriTrade, with no login: every
// share and ETF on the Nigerian Exchange, its only place. Its FAQ says
// "Meritrade is an online stock broking platform which allows users buy
// and sell stocks online through the Nigerian stock exchange", and that
// "only verified shares that have been deposited into CSCS by the
// registrars can be traded on via the platform" (a rule about a client's
// certificates, not about which titles). No page names a list of its own
// or excludes a board, so the book is the exchange's listing of the day,
// read by ./ngxBook.mjs (what is kept and left out is written there). The
// FAQ's "Global Search" is a search for a client's lost accounts, not a
// foreign market: MeriTrade sells no foreign shares. Everything trades in
// naira.
//
// Fees: the same FAQ, "What is your commission rate?": "Brokerage
// commission is 1.35% respectively for buy and sell orders. This excludes
// other regulatory fees." The FAQ lives in the page's JavaScript; the run
// finds the chunk and checks both sentences.
//
//   https://meritrade.com/faq
//   https://feeds.standardbank.com/Market-Data-Files/NSB/Rates/allNGAStock.json
//
//   node brokers/meristem/meristem_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxListings, PLACE } from "./ngxBook.mjs";
import fs from "node:fs";

const FAQ = "https://meritrade.com/faq";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  /allows users buy and sell stocks online through the Nigerian stock exchange/,
  /Brokerage commission is 1\.35% respectively for buy and sell orders/,
];

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
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

async function checkFaq() {
  const html = await fetchText(FAQ);
  const chunks = [...new Set(html.match(/\/_next\/static\/chunks\/[^"'?\\]+\.js/g) || [])];
  if (!chunks.length) throw new Error("MeriTrade FAQ links no script");
  const texts = [html];
  for (const chunk of chunks) texts.push(await fetchText(new URL(chunk, FAQ).href));
  for (const pattern of EVIDENCE) {
    if (!texts.some((text) => pattern.test(text))) throw new Error(`MeriTrade FAQ no longer says ${pattern}`);
  }
}

await checkFaq();
const { rows, day, leftOut, badIsins } = await ngxListings();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("meristem-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] += 1;
const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `meristem: ${kept.length} rows (${day}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}, ${badIsins} bad dropped. Left out: ${skipped || "none"}.`
);
