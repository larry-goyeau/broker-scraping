// What Allbatross Yatırım sells, with no login: every share and
// exchange-traded fund on Borsa Istanbul, its only place. Its share page
// describes the whole equity market and its boards (Yıldız, Ana, Alt,
// Yakın İzleme, Piyasa Öncesi İşlem Platformu) without excluding any, and
// its services page offers "Borsa İstanbul'daki hisse, vadeli işlem ve
// opsiyon borsası işlemleri için profesyonel aracılık hizmeti". Its tariff
// prices shares and funds alike: "Hisse Senedi/Borsa Yatırım
// Fonu/Varant/Açığa Satış: İşlem tutarı üzerinden %0.2". Clients trade
// online through Matriks E-Broker ("BİST ve VİOP"). No foreign shares
// (checked 2026-10-25). The Qualified Investor Market (Nitelikli Yatırımcı
// İşlem Pazarı) is closed to retail clients and is not in the list anyway.
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
//   https://allbatrossyatirim.com/pay-senedi/
//   https://allbatrossyatirim.com/hizmetler/
//   https://allbatrossyatirim.com/islem-platformlari/matriks-e-broker/
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://allbatrossyatirim.com/wp-content/uploads/2025/03/Komisyon_Masraf_Tarifesi-002.pdf
//
//   node brokers/allbatrossyatrm/allbatrossyatrm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("allbatrossyatrm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `allbatrossyatrm: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length}; not on TradingView ${missing.length} (${missing.join(" ") || "none"})`
);
