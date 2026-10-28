// What Falcon Securities Limited sells through FS Online, with no login:
// every share and ETF on the Nigerian Exchange, its only place. Its Stock
// Broking page says "As a dealing member firm of The Nigerian Exchange
// Limited, the company engages in the execution of mandates for clients"
// in "Ordinary shares", government stocks, corporate debt, treasury bills,
// OTC (NASD) and private equity; the FS Online FAQ's "Market Data shows the
// real-time prices of active stocks available for trade on the floor of
// the Nigerian Stock Exchange". No page excludes a board, a segment or
// ETFs, and none names a list of its own, so the book is the exchange's
// whole listing of the day, read by ../morgancapital/ngxWhole.mjs (shares,
// listed REITs and ETFs; closed-end funds, suspended and delisting lines
// left out, as written there). The stock calculator's pick list on the
// same page (about 120 symbols, dated 2024, no ETF) is a calculator, not a
// statement of what can be bought, and is not applied. Bonds, treasury
// bills, NASD OTC lines and private equity are not exchange-traded shares
// and are not written. Everything trades in naira.
//
// Fees: the Stock Broking page's stock calculator, which itemises "NGX,
// CSCS Fee, Trade Alert Fee, SEC Fee, Stamp Duty, Brokerage Fee". Its
// script (calculator.js, served from the aptsecurities.com host the site's
// template uses) charges "considerationAmount * 1.35 * 0.01" as brokerage.
// The run checks the page's lines and the script's rate.
//
//   https://www.falconsecuritiesltd.com/brokage.html
//   https://www.aptsecurities.com/js/calculator.js
//   https://www.falconsecltdonline.com/IW/Home/FAQs
//
//   node brokers/falcon/falcon_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.falconsecuritiesltd.com/brokage.html";
const EVIDENCE = {
  [PAGE]: [
    /As a dealing member firm of The Nigerian Exchange Limited/,
    /Ordinary shares/,
    /Stock Calculator/,
    /Brokerage Fee/,
  ],
};
const CALCULATOR = /<script[^>]+src="([^"]*calculator\.js)"/;
const BROKERAGE = /brokerage\.innerHTML\s*=\s*thousander\(considerationAmount \* 1\.35 \* 0\.01\)/;

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

const page = await fetchText(PAGE);
const text = plain(page);
for (const pattern of EVIDENCE[PAGE]) {
  if (!pattern.test(text)) throw new Error(`${PAGE} no longer says ${pattern}`);
}
const script = page.match(CALCULATOR);
if (!script) throw new Error(`${PAGE} no longer loads its calculator script`);
await sleep(500);
const calculator = await fetchText(new URL(script[1], PAGE).href);
if (!BROKERAGE.test(calculator)) throw new Error(`${script[1]} no longer charges 1.35% brokerage`);

const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("falcon-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `falcon: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
