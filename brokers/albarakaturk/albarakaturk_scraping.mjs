// What Albaraka Türk Katılım Bankası sells online, with no login: the
// shares of the BIST participation (Katılım) index on Borsa Istanbul.
//
// Its shares page: "Albaraka Türk’te Hisse Senetleri seçimi “Katılım
// Bankacılığı” prensipleri doğrultusunda oluşturulmuştur. Katılım Endeksi
// Kuralları esas alınarak uygulanmaktadır" and "Bankamız kanallarından alım
// satım yapabileceğiniz hisse senetlerini “BIST Katılım Endeksi” sayfasından
// öğrenebilirsiniz"; accounts open in Albaraka Mobil or the internet branch
// and orders go to the exchange through OYAK Yatırım. A share that fails
// the index criteria two periods running can only be sold, so it is not in
// the list. The participation index holds shares only and no page offers
// exchange-traded funds (BYF), so they are left out.
//
// The list: ../halkyatrm/bistBook.mjs (KAP's listed companies with
// TradingView's names and ISINs, checked against the exchange's end-of-day
// equity bulletin, which drops suspended and no-longer-traded lines), kept
// when the same bulletin flags the share in "BIST KATILIM TUM ENDEKS"
// (../vakfkatlm/katilim.mjs). Warrants, rights, certificates and bonds stay
// out. In lira (BIST, XIST).
//
// United States: left out. broker-list.json gives Albaraka a US place with
// the same participation-banking restriction, and the albaFX app does
// trade "Amerika ve Avrupa borsalarında hisse senedi" ("albaFX aracılığı
// ile sadece katılım bankacılığı ilkelerine uygun olan yatırım fonlarının
// ve hisse senetlerinin alım/satım işlemleri gerçekleştirilebilmektedir"),
// but no page names the list or the screen behind "uygun" for foreign
// shares, so that place cannot be built without guessing.
//
//   https://www.albaraka.com.tr/tr/bireysel/yatirim/sermaye-piyasasi-urunleri/hisse-senedi-islemleri
//   https://www.albaraka.com.tr/tr/bireysel/yatirim/albafx
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//   https://www.kap.org.tr/tr/bist-sirketler
//
// Fees: https://www.albaraka.com.tr/tr/bireysel/yatirim/sermaye-piyasasi-urunleri/hisse-senedi-islemleri
// ("Komisyon Ücretleri Hisse alım komisyonu : BINDE 2"; OYAK's account
// fee 2,50 TL; albaFX foreign shares: 20 USD up to 7.999 USD, then "binde
// 2,5").
//
//   node brokers/albarakaturk/albarakaturk_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { katilimBook } from "../vakfkatlm/katilim.mjs";
import { says } from "../denizyatrm/evidence.mjs";

await says("https://www.albaraka.com.tr/tr/bireysel/yatirim/sermaye-piyasasi-urunleri/hisse-senedi-islemleri", [
  /Hisse alım komisyonu : BINDE 2/,
  /Katılım Endeksi Kuralları esas alınarak uygulanmaktadır/,
  /Albaraka Mobil uygulaması ya da Albaraka İnternet şubesi/,
]);
await says("https://www.albaraka.com.tr/tr/bireysel/yatirim/albafx", [/sadece katılım bankacılığı ilkelerine uygun olan yatırım fonlarının ve hisse senetlerinin/]);

const { rows, outside, notInBook, indexSize, book } = await katilimBook();
for (const row of rows) if (row.isin) row.query = row.isin;
const kept = stampRows(withoutObligations(rows));
if (kept.length < 150) throw new Error(`only ${kept.length} participation-index shares`);
fs.writeFileSync(new URL("albarakaturk-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `albarakaturk: ${kept.length} rows, BIST STOCK in BIST Katılım Tüm (${indexSize} flagged on the ${book.bulletinDate} bulletin); ` +
    `left out ${outside.STOCK.length} shares outside the index and ${outside.ETF.length} ETFs; ` +
    `dropped ${book.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `flagged but not on KAP's list: ${notInBook.join(" ") || "none"}`
);
