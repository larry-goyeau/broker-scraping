// What Mission Securities sells, with no login: every share and ETF on the
// Nigerian Exchange, its only place. Its FAQ says it was "licensed ... by
// the Nigerian Stock Exchange (the "Exchange") to deal in securities on
// the floor of the Exchange", and its strengths page that its stockbrokers
// "handle clients' buy and sell orders on all the floors of the Nigerian
// Stock Exchange". No page names a list of its own or excludes a board, an
// ETF or a segment, so the book is the exchange's listing of the day, read
// by ../morgancapital/ngxWhole.mjs (closed-end funds, suspended and
// delisting lines left out there). Mission sells no foreign shares.
// Everything trades in naira.
//
// Left as remarks, not removals (they depend on the client): the FAQ asks
// "A minimum of N50, 000.00 or its equivalent in stock" to open an
// account, and only shares verified and dematerialised at CSCS can be
// sold.
//
// Fees: "Our Professional Fees", the charges "for the purchase and sale of
// shares on The Nigerian Stock Exchange". Buy: CSCS 0.06%, stamp duties
// 0.075%, SEC 0.3%, "Brokerage Commission 1.35% of Consideration", VAT on
// brokerage and CSCS, total 1.8555%. Sell: CSCS 0.36%, stamp duties 0.075%,
// NSE 0.3%, brokerage 1.35%, VATs, total 2.1855%. "It is only the broker's
// commission that is negotiable". The run checks the page still says so.
//
//   https://www.missionsecuritiesltd.com/professional_fees.html
//   https://www.missionsecuritiesltd.com/faq.html
//   https://www.missionsecuritiesltd.com/our-strengths.html
//
//   node brokers/mission/mission_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import fs from "node:fs";

const FEES = "https://www.missionsecuritiesltd.com/professional_fees.html";
const STRENGTHS = "https://www.missionsecuritiesltd.com/our-strengths.html";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  [FEES, /purchase and sale of shares on The Nigerian Stock Exchange/],
  [FEES, /Brokerage Commission\s*(<[^>]*>\s*)*1\.35% of Consideration/],
  [STRENGTHS, /buy and sell orders on all the floors of the Nigerian Stock Exchange/],
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
    pages.set(url, (await fetchText(url)).replace(/&nbsp;/g, " ").replace(/\s+/g, " "));
    await sleep(500);
  }
  for (const [url, pattern] of EVIDENCE) {
    if (!pattern.test(pages.get(url))) throw new Error(`Mission ${url} no longer says ${pattern}`);
  }
}

await checkPages();
const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("mission-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `mission: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped: ${dropped.map((line) => line.ticker).join(", ") || "none"}. ` +
    `Left out: ${skipped || "none"}.`
);
