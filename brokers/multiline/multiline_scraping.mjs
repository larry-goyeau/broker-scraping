// What Multiline Securities (MSL Trade) sells in shares and ETFs, with no
// login: the whole Pakistan Stock Exchange ready market, its only place for
// equities. MSL is a PSX broker ("the best brokerage house in Pakistan,
// based in Karachi"); its services are equity sales (institutional and
// retail, "Hedging between regular and future markets"), commodities,
// investment banking and research. Its fee page prices PSX share trades
// only, and no page excludes a board, a segment, ETFs or a list of symbols,
// so the book is the exchange's whole regular market.
//
//   https://www.msltrade.com/
//   https://www.msltrade.com/ourservice/equitysale
//
// The list is the exchange's own regular deliverable market (REG.xml), read
// by brokers/nextcapital/psxBook.mjs:
//
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Kept: shares (preference shares, modarabas and REITs too) and the ETFs,
// in rupees on XKAR. Left out there: rights, closed-end funds, debt lines,
// and companies the exchange prints as delisted or suspended or that have
// not traded for six months (psxStatus.mjs). GEM Board lines stay with the
// accredited-investor remark; lines on the non-compliant counter stay with
// their remark.
//
// Fees: "Multiline Securities Ltd Commission Structure": share price "Upto
// 20.00" Rs 0.03 per share, "20.01 - 100.00" "0.15% of Share Value", "100.00
// and above" 0.15; "The same commission rate will be applicable on Delivery
// as well as Day Trade transactions", the day trade charged "on ONE side
// ONLY"; Sindh Sales Tax 13% of commission; CDC sub-account Rs 400 a year,
// CDC handling Rs 0.006 a share on deliveries, UIN Rs 200 a year, CKO Rs 50
// a year; "A minimum of Rs 5,000/- has to be maintained at all times". The
// page is an Angular route: its text sits in a lazy-loaded chunk, which the
// run finds from main.js and checks.
//
//   https://www.msltrade.com/invester-information/feeandcommission
//
//   node brokers/multiline/multiline_scraping.mjs

import { psxBook, psxBookSummary } from "../nextcapital/psxBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const OUTPUT = new URL("multiline-parsed.json", import.meta.url);
const SITE = "https://www.msltrade.com/";
const FEES = [
  /Multiline Securities Ltd Commission Structure/,
  /0\.15% of Share Value/,
  /applicable on Delivery as well as Day Trade transactions/,
  /Sind Sales Tax \(SST\): 13% of Brokerage Commission/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.cause?.message || error.message || error}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// The webpack chunk a route loads: `path: '<route>', loadChildren: ... e(/*! import() */ <id>)`.
function chunkOf(js, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = js.match(new RegExp(`path: '${escaped}',\\s*loadChildren: function \\(\\) \\{ return __webpack_require__\\.e\\(/\\*! import\\(\\) \\*/ (\\d+)\\)`));
  if (!match) throw new Error(`msltrade.com: no chunk for the route ${route}`);
  return `${SITE}${match[1]}.js`;
}

const plain = (js) =>
  js
    .replace(/\\r\\n|\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const main = await fetchText(`${SITE}main.js`);
await sleep(800);
const investor = await fetchText(chunkOf(main, "invester-information"));
await sleep(800);
const fees = plain(await fetchText(chunkOf(investor, "feeandcommission")));
for (const pattern of FEES) {
  if (!pattern.test(fees)) throw new Error(`MSL fee page no longer says ${pattern}`);
}

const rows = await psxBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`multiline: ${rows.length} rows. ${psxBookSummary(rows)}`);
