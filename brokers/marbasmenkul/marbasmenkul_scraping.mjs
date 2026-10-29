// What Marbaş Menkul Değerler sells online, with no login: every share and
// exchange-traded fund on Borsa Istanbul, its only place.
//
// Its platforms page: in the MTrader app "Portföy menüsü üzerinden tüm
// hisse senedi, varant ve VİOP emirlerinizi verebilir", and the online
// branch offers "Alım/satım". Its fee table prices share orders and lists
// "Pay, Varant BYF alım-satım Düzeltme İşlemleri" (in the "Diğer İşlem
// Ücretleri" image, https://marbas.com.tr/assets/takas-komisyon-scaled.jpg),
// so exchange-traded funds
// (BYF) are traded too; no page names a board, segment or fund it leaves
// out. The list is the exchange's (../halkyatrm/bistBook.mjs): KAP's listed
// companies and BYF funds with TradingView's names and ISINs, checked
// against Borsa Istanbul's end-of-day equity bulletin, which drops
// suspended lines and lines no longer traded. Warrants, rights,
// certificates and bonds stay out. In lira (BIST, XIST).
//
//   https://marbas.com.tr/islem-platformlari/
//   https://marbas.com.tr/hizmetler/ucretlendirme-tablosu/
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://marbas.com.tr/hizmetler/ucretlendirme-tablosu/ (the "İşlem
// Komisyonları" table, https://marbas.com.tr/assets/marbas_ucretler_islem_2025_ocak22.csv:
// "Pay Senedi Alım/Satım Komisyonu;0.002 (işlem bazlı oran)", minimum
// 0,01 TL per trade; the page's general terms: "Tablodaki oran ve tutarlar
// azami oran ve tutarları ifade etmektedir", plus 5 % BSMV).
//
//   node brokers/marbasmenkul/marbasmenkul_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { says } from "../denizyatrm/evidence.mjs";

await says("https://marbas.com.tr/islem-platformlari/", [/tüm hisse senedi, varant ve VİOP emirlerinizi verebilir/]);
// The fee page loads its share-commission table from a CSV named in an
// attribute.
await says("https://marbas.com.tr/hizmetler/ucretlendirme-tablosu/", [/marbas_ucretler_islem_2025_ocak22\.csv/], { raw: true });
await says("https://marbas.com.tr/assets/marbas_ucretler_islem_2025_ocak22.csv", [
  /Pay Senedi Alım\/Satım Komisyonu;0\.002 \(işlem bazlı oran\)/,
]);

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const rows = stampRows(withoutObligations(bist.rows));
if (rows.length < 550) throw new Error(`only ${rows.length} BIST rows`);
fs.writeFileSync(new URL("marbasmenkul-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const count = {};
for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `marbasmenkul: ${rows.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; bulletin ${bist.bulletinDate}; ` +
    `dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}`
);
