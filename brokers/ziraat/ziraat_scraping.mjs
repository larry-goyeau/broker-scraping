// What Ziraat Yatırım sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place. Its shares page says that in its
// apps the client sees and trades all of them: "Zborsa Mobil, Ziraat
// Trader ve Zpro uygulamalarına giriş yapılması durumunda Hisse, Varant ve
// Viop kontratlarının tamamını anlık olarak görüp işlem yapabilirsiniz."
// Its fund page adds that exchange-traded funds trade on the same equity
// market and can be bought on all its platforms ("tüm platformlarımızdan
// (ZBorsa, E-şube, Ziraat Trader, ZPro) BYF alış-satış işlemi
// yapabilirsiniz").
//
// The list is the exchange's, from KAP (./bist.mjs): the listed companies'
// share codes and the exchange-traded funds, with TradingView's names and
// ISINs. Warrants, rights, certificates and bonds stay out.
//
// No foreign shares or ETFs (checked 2026-10-22): the site's products
// (/urunler, the sitemap) are BIST shares, VİOP, warrants, funds, BYF and
// Ziraat FX (leveraged currency trading); the fee page prices only Pay
// Piyasası, VİOP and custody; the legal page has risk forms for foreign
// derivatives and foreign bonds only. A 2019 general disclosure form says
// foreign share orders go through a "Yurtdışı Yetkili Aracı Kuruluş" and
// that the list of foreign exchanges is given at zdunya@ziraatyatirim.com.tr,
// with no online channel, list or fee.
//
//   https://www.ziraatyatirim.com.tr/hisse-pay-senetleri
//   https://www.ziraatyatirim.com.tr/borsa-yatirim-fonu-byf-nedir
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//
// Fees: https://www.ziraatyatirim.com.tr/komisyon-ve-masraflar
//
//   node brokers/ziraat/ziraat_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistListings } from "./bist.mjs";
import fs from "node:fs";

const { rows, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistListings();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("ziraat-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `ziraat: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
