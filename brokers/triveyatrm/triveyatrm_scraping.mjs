// What Trive Yatırım sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place for shares. Its BIST page offers
// share trading on the exchange ("Hisse senedi alım / satım işlemleri",
// margin and short selling, "BIST Piyasalar"), and its zero-commission page
// prices every share order the same way: "Hisse işlemlerinde komisyon
// yok", with 0.02% above 5 million TL of monthly volume ("Aylık 5 milyon
// TL'yi aşan Hacimlerde onbinde iki"). No page names a board, segment or
// fund it does not serve (checked 2026-10-25); its other products (forex,
// commodities, gold) are not exchange shares.
//
// Client remark, not a removal: Trive does not serve people linked to the
// United States, the United Kingdom, Russia or sanctioned countries
// ("Amerika Birleşik Devletleri, Birleşik Krallık, Rusya ve yaptırım
// uygulanan ülkeler ... hizmet vermemektedir").
//
// The list is the exchange's, from ../halkyatrm/bistBook.mjs: the share codes
// and exchange-traded funds KAP lists (../ziraat/bist.mjs, TradingView's
// names and ISINs, all in lira), checked against Borsa Istanbul's own
// end-of-day equity bulletin, which drops halted lines (UMPAS on the
// 2026-10-23 bulletin) and companies whose shares no longer trade. Warrants,
// rights, certificates, real-estate and venture-capital fund units and bonds
// stay out. İş Bankası's A and founders' shares (ISATR, ISKUR) are kept:
// open for orders, though they trade a few times a year.
//
//   https://trive.com.tr/bist-hisse
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://trive.com.tr/hisse-senetleri/sifir-komisyon
//
//   node brokers/triveyatrm/triveyatrm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("triveyatrm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `triveyatrm: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length}; not on TradingView ${missing.length} (${missing.join(" ") || "none"})`
);
