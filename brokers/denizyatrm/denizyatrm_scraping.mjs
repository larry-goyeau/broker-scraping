// What Deniz Yatırım (DenizBank's broker) sells online, with no login:
// every share and exchange-traded fund on Borsa Istanbul.
//
// Borsa Istanbul. Its channels page: "DenizTrader Pro ve MobilDeniz ile
// Hisse Senedi ve Halka Arz işlemlerinizi hızlı bir şekilde
// gerçekleştirebilirsiniz" and "Mobil Deniz üzerinden ... hisse senedi alım
// satımı yapabilirsiniz". No page names a board, segment or fund it leaves
// out, and its fee table prices exchange-traded funds (BYF) with the
// shares, so the funds stay. The list is the exchange's
// (../halkyatrm/bistBook.mjs): KAP's listed companies and BYF funds with
// TradingView's names and ISINs, checked against Borsa Istanbul's end-of-day
// equity bulletin, which drops suspended lines and lines no longer traded.
// Warrants, rights, certificates and bonds stay out. In lira (BIST, XIST).
//
// United States: left out. broker-list.json gives Deniz a US place, but
// its foreign-markets page only says D-Trade reaches "belli başlı birçok
// ülke borsasında" (many countries' exchanges) for "yurt dışı hisse
// senedi, Futures, opsiyon, bono ve tahvil", without naming the US or any
// exchange, and its fee table has no foreign-share commission. (The
// broker-list row itself says the US was inferred.)
//
//   https://www.denizyatirim.com/IslemKanallari
//   https://www.denizyatirim.com/yurtdisiIslemler
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.denizyatirim.com/asset/CustomLinkPdf/1707831057.pdf,
// linked from the FAQ and the legal page ("DenizYatırım Masraf ve
// Komisyonlara İlişkin Tarife Tablosu"): "Pay Senedi Alım Satım Kom.
// 0,005 (Binde 5) İşlem hacmi üzerinden", plus the exchange and Takasbank
// fees.
//
//   node brokers/denizyatrm/denizyatrm_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { says, pdfAnswers } from "./evidence.mjs";

await says("https://www.denizyatirim.com/IslemKanallari", [
  /DenizTrader Pro ve MobilDeniz ile Hisse Senedi ve Halka Arz işlemlerinizi/,
]);
await says("https://www.denizyatirim.com/YasalBilgiler", [/Masraf ve Komisyonlara İlişkin Tarife Tablosu/]);
await says("https://www.denizyatirim.com/yurtdisiIslemler", [/belli başlı birçok ülke borsasında/]);
await pdfAnswers("https://www.denizyatirim.com/asset/CustomLinkPdf/1707831057.pdf");

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const rows = stampRows(withoutObligations(bist.rows));
if (rows.length < 550) throw new Error(`only ${rows.length} BIST rows`);
fs.writeFileSync(new URL("denizyatrm-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const count = {};
for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `denizyatrm: ${rows.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; bulletin ${bist.bulletinDate}; ` +
    `dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}`
);
