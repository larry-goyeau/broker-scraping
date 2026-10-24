// What FAC Sekuritas Indonesia sells, with no login: every share on the
// Indonesia Stock Exchange, its only place. FAQ 09 of its guide says the
// conventional FAST account trades all of them, the Sharia account only the
// Sharia list: "FAST konvensional dapat mentransaksikan semua saham yang ada
// di BEI". The exchange's ETFs trade in the same book and are kept, as in
// ../bni and ../bri. Warrants, rights, mutual funds and real-estate
// investment funds (DIRE) stay out.
//
// The exchange's own list (idx.co.id) refuses a plain request; the list is
// every common or preferred share and ETF TradingView files on IDX
// (../cgsid/tvlist.mjs), with its names and ISINs.
//
//   https://www.facsekuritas.co.id/pedoman
//   https://www.idx.co.id/id/data-pasar/data-saham/daftar-saham
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=BB&exchange=IDX&lang=en&domain=production&search_type=stocks
//
// Fees: https://www.facsekuritas.co.id/pedoman (FAQ 05: 0.18% to buy, 0.28%
// to sell)
//
//   node brokers/fac/fac_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { idxListings } from "../cgsid/tvlist.mjs";
import fs from "node:fs";

const rows = await idxListings();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("fac-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `fac: ${kept.length} rows, IDX ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}` +
    (kept.length < rows.length ? `; ${rows.length - kept.length} obligations left out` : "")
);
