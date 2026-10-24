// What RHB Sekuritas Indonesia (RHB TradeSmart ID) sells, with no login:
// every share on the Indonesia Stock Exchange, its only place. Its product
// page offers "Equity: Investasi Saham Untuk Semua" through online trading,
// and its FAQ says orders go straight to the exchange's JATS ("Order Smart
// People otomatis dilanjutkan ke JATS"). No page names a list of its own
// or excludes a share, so the book is the exchange's whole listing, ETFs
// included, as in ../fac and ../cgsid. The Sharia account buys only the
// Sharia list (Daftar Efek Syariah); the regular account is not limited.
// The structured warrants RHB issues, rights, mutual funds and real-estate
// investment funds (DIRE) stay out. No foreign shares are offered.
//
// The site answers at www.rhbtradesmart.co.id only (the bare domain
// redirects to rhtradesmart.co.id, which has no DNS) and often returns a
// Cloudflare 520, so each page is retried.
//
// Fees: the FAQ's Sharia answer says the buy and sell fees are the same as
// the regular account's: "selebihya untuk fee beli dan jual sama yaitu
// 0.15% dan 0.25%". The home page advertises "serendah 0.08% (*S&K
// Berlaku)", a conditional promotion. The run checks the FAQ sentences.
//
// The exchange's own list (idx.co.id) refuses a plain request; the list is
// every common or preferred share and ETF TradingView files on IDX
// (../cgsid/tvlist.mjs), with its names and ISINs.
//
//   https://www.rhbtradesmart.co.id/product
//   https://www.rhbtradesmart.co.id/faq
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=BB&exchange=IDX&lang=en&domain=production&search_type=stocks
//
//   node brokers/rhbid/rhbid_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { idxListings } from "../cgsid/tvlist.mjs";
import fs from "node:fs";

const SITE = "https://www.rhbtradesmart.co.id";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  { url: `${SITE}/product`, pattern: /Investasi Saham Untuk Semua/ },
  { url: `${SITE}/faq`, pattern: /otomatis dilanjutkan ke JATS/ },
  { url: `${SITE}/faq`, pattern: /fee beli dan jual sama yaitu 0\.15% dan 0\.25%/ },
];

const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }
  throw new Error(last);
}

const pages = new Map();
for (const { url, pattern } of EVIDENCE) {
  if (!pages.has(url)) pages.set(url, textOf(await fetchText(url)));
  if (!pattern.test(pages.get(url))) throw new Error(`${url} no longer says ${pattern}`);
}

const rows = await idxListings();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("rhbid-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `rhbid: ${kept.length} rows, IDX ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}` +
    (kept.length < rows.length ? `; ${rows.length - kept.length} obligations left out` : "")
);
