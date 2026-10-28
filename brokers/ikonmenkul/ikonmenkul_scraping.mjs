// What IKON Menkul sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place for shares. Its share page offers
// trading on Borsa Istanbul through the Hissedar app, the online branch and
// Matriks, iDeal, Forinvest; its ETF page says "Borsa Yatırım Fonları BİST
// Pay Piyasasında işlem gören ürünlerdir" and that clients trade them in
// the online branch and Matriks. Its tariff has one rate: "Hisse Senedi,
// Borsa Yatırım Fonu, Varant Komisyonu: İşlem tutarı üzerinden azami
// binde 2". No page names a board or segment it does not serve (checked
// 2026-10-25). Its foreign shares are CFDs on MetaTrader 4 (forex desk),
// not exchange shares, so they stay out.
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
//   https://www.ikonmenkul.com.tr/hisse-senedi
//   https://www.ikonmenkul.com.tr/yatirim-fonlari/borsa-yatirim-fonlari
//   https://www.ikonmenkul.com.tr/online-sube
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.ikonmenkul.com.tr/hisse-senedi/islem-kosullari-ve-komisyon
//
//   node brokers/ikonmenkul/ikonmenkul_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("ikonmenkul-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `ikonmenkul: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length}; not on TradingView ${missing.length} (${missing.join(" ") || "none"})`
);
