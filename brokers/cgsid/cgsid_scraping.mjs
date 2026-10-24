// What CGS International Sekuritas Indonesia sells, with no login: every
// share on the Indonesia Stock Exchange, its only place. Its equities page
// says: "Bebas bertransaksi semua saham yang terdaftar di Bursa Efek
// Indonesia", online through CGS iTrade (desktop, web, mobile). The
// exchange's ETFs trade in the same book and are kept, as in ../bni and
// ../bri. Warrants, rights, mutual funds and real-estate investment funds
// (DIRE) stay out.
//
// The exchange's own list (idx.co.id) refuses a plain request; the list is
// every common or preferred share and ETF TradingView files on IDX
// (./tvlist.mjs), with its names and ISINs.
//
//   https://www.cgsi.co.id/our-offerings/products/equities
//   https://www.cgsi.co.id/cgsi/api/v1/GetProductByID?id=equities&lang=2
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=BB&exchange=IDX&lang=en&domain=production&search_type=stocks
//
// Fees: https://www.cgsi.co.id/our-offerings/products/equities (0.1815% to
// buy, 0.2815% to sell, online)
//
//   node brokers/cgsid/cgsid_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { idxListings } from "./tvlist.mjs";
import fs from "node:fs";

const rows = await idxListings();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("cgsid-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `cgsid: ${kept.length} rows, IDX ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}` +
    (kept.length < rows.length ? `; ${rows.length - kept.length} obligations left out` : "")
);
