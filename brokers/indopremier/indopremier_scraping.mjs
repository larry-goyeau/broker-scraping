// What Indo Premier Sekuritas (IPOT) sells, with no login: every share on
// the Indonesia Stock Exchange, its only place, and the exchange's ETFs.
// Its site describes the app as "Aplikasi investasi untuk jual beli Saham,
// ReksaDana, hingga ETF", and its product card lists "3 Produk: Saham,
// Reksa Dana & ETF". No page names a list of its own or any excluded
// share, so the book is the exchange's whole listing, as in ../fac and
// ../cgsid. Mutual funds (reksa dana) are not listed securities and stay
// out, and so do warrants, rights and real-estate investment funds (DIRE).
// IPOT sells no foreign shares.
//
// The site is a single-page app; its FAQ is in app/js/constant.js:
// "Berapa fee transaksi saham?" "Fee transaksi saham adalah fee beli 0.19%
// dan jual 0.29%". The run checks both sentences before writing.
//
// The exchange's own list (idx.co.id) refuses a plain request; the list is
// every common or preferred share and ETF TradingView files on IDX
// (../cgsid/tvlist.mjs), with its names and ISINs.
//
//   https://www.indopremier.com/
//   https://www.indopremier.com/app/js/constant.js
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=BB&exchange=IDX&lang=en&domain=production&search_type=stocks
//
// Fees: https://www.indopremier.com/app/js/constant.js (FAQ: 0.19% to buy,
// 0.29% to sell)
//
//   node brokers/indopremier/indopremier_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { idxListings } from "../cgsid/tvlist.mjs";
import fs from "node:fs";

const SITE = "https://www.indopremier.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  { url: `${SITE}/`, pattern: /jual beli Saham, ReksaDana, hingga ETF/i },
  { url: `${SITE}/app/js/constant.js`, pattern: /Fee transaksi saham adalah fee beli 0\.19% dan jual 0\.29%/ },
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

for (const { url, pattern } of EVIDENCE) {
  if (!pattern.test(await fetchText(url))) throw new Error(`${url} no longer says ${pattern}`);
}

const rows = await idxListings();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("indopremier-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `indopremier: ${kept.length} rows, IDX ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}` +
    (kept.length < rows.length ? `; ${rows.length - kept.length} obligations left out` : "")
);
