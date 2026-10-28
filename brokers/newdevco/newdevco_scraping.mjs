// What Newdevco Investment & Securities sells, with no login: every share
// and ETF on the Nigerian Exchange, its only place. Its company page says
// it "is an NGX Dealing License Holder and a shareholder of Central
// Securities Clearing System (CSCS)", and its brokerage service is
// "buying and selling of shares based on the written mandates given to us
// by our clients". Its e-trading page is "currently under construction":
// orders go through the dealers. No page names a list of its own or
// excludes a board, an ETF or a segment, so the book is the exchange's
// listing of the day, read by ../morgancapital/ngxWhole.mjs (closed-end
// funds, suspended and delisting lines left out there). The home page's
// price list shows FGN bonds and sukuk next to shares; bonds are left out
// as in every scraper. Newdevco sells no foreign shares. Everything trades
// in naira.
//
// Fees: the "NewDevCo Calculator" on every page of the site. Buy:
// Brokerage 1.35%, SEC Fees 0.3%, Contract Stamps 0.075%, Alert + VAT
// #4.20. Sale: Brokerage 1.35%, NSE Fees 0.3%, CSCS 0.3%, Contract Stamps
// 0.075%, Alert + VAT #4.20. The run checks the calculator still shows
// the 1.35% brokerage.
//
//   https://www.newdevcoinvestment.com/                         (fees, calculator)
//   https://www.newdevcoinvestment.com/who_we_are/company
//   https://www.newdevcoinvestment.com/etrading/e-trading
//
//   node brokers/newdevco/newdevco_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const HOME = "https://www.newdevcoinvestment.com/";
const COMPANY = "https://www.newdevcoinvestment.com/who_we_are/company";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  [HOME, /NewDevCo Calculator/],
  [HOME, />\s*Brokerage\s*<\/label>[\s\S]{0,300}value="1\.35%"/],
  [HOME, />\s*Contract Stamps\s*<\/label>[\s\S]{0,300}value="0\.075%"/],
  [COMPANY, /NGX Dealing License Holder/],
];

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

async function checkPages() {
  const pages = new Map();
  for (const [url] of EVIDENCE) {
    if (pages.has(url)) continue;
    pages.set(url, await fetchText(url));
    await sleep(500);
  }
  for (const [url, pattern] of EVIDENCE) {
    if (!pattern.test(pages.get(url))) throw new Error(`Newdevco ${url} no longer shows ${pattern}`);
  }
}

await checkPages();
const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("newdevco-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `newdevco: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped: ${dropped.map((line) => line.ticker).join(", ") || "none"}. ` +
    `Left out: ${skipped || "none"}.`
);
