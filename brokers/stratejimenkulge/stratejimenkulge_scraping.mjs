// What Strateji Menkul Değerler sells, with no login: every share and
// exchange-traded fund on Borsa Istanbul, its only place. Its platforms
// page says clients trade "BIST Pay ve VİOP" through Matriks IQ, Mobil IQ,
// Web Trader and its own Strateji Trader app ("Hisse senedi, yatırım
// fonları, döviz, varant ve VIOP işlemlerini"). Its fee notice has one
// share rate for the equity market: "Pay Komisyonu Sabit Oran (Binde): 2"
// through a representative, "İnternet Oranı (Binde): 0.5" online. No page
// names a board, segment or fund it does not serve, and it offers no
// foreign shares (checked 2026-10-25).
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
//   https://strateji.com.tr/islem-platformlarimiz/
//   https://strateji.com.tr/islem-platformlarimiz/strateji-trader/
//   https://strateji.com.tr/islem-platformlarimiz/matriks/
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://strateji.com.tr/wp-content/uploads/2025/12/Ucret-Masraf-ve-Komisyon-Bilgilendirilmesi-2025-12-04.pdf
//
//   node brokers/stratejimenkulge/stratejimenkulge_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("stratejimenkulge-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `stratejimenkulge: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length}; not on TradingView ${missing.length} (${missing.join(" ") || "none"})`
);
