// What Vakıf Katılım Bankası sells, with no login: the shares of the BIST
// Katılım (participation) index on Borsa Istanbul, its only place. Its
// capital-markets page offers "Katılım finans sistemi ilke ve prensiplerine
// uygun sermaye piyasası ürünleri": shares and investment funds. Its shares
// page: "Katılım finans sistemi ilkelerine uygun hisse senedi işlemlerinizi
// yapabilmek için yatırım hesabınızı ... açabilirsiniz", links the BIST
// participation index changes, and says the other shares are traded only
// through Vakıf Yatırım: "Katılım bankacılığı prensipleri dışında kalan
// hisse senetlerinin alım-satım işlemleri 0850 222 77 72 numaralı Vakıf
// Yatırım Emir Hattı aracılığı ile yapılabilir. Vakıf Yatırım elektronik
// dağıtım kanallarından tüm hisse senetlerine işlem yapılabilir." Those are
// Vakıf Yatırım's channels and tariff (../vakfyatrm), so they are left out
// here. Exchange-traded funds (BYF) are not among its products and the
// participation index holds shares only, so they are left out.
//
// The list: ../halkyatrm/bistBook.mjs (KAP's listed companies with
// TradingView's names and ISINs, checked against the exchange's end-of-day
// equity bulletin, which drops suspended and no-longer-traded lines),
// kept when the same bulletin flags the share in "BIST KATILIM TUM
// ENDEKS" (./katilim.mjs). Warrants, rights, certificates and bonds stay
// out. Orders go to the exchange through Vakıf Yatırım; no lot fractions
// ("Bankamızda lot altı işlem yapılmamaktadır").
//
//   https://www.vakifkatilim.com.tr/tr/kendim-icin/yatirim/sermaye-piyasasi-urunleri
//   https://www.vakifkatilim.com.tr/tr/kendim-icin/yatirim/sermaye-piyasasi-urunleri/hisse-senedi
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//   https://www.kap.org.tr/tr/bist-sirketler
//
// Fees: https://www.vakifkatilim.com.tr/tr/kendim-icin/yatirim/sermaye-piyasasi-urunleri/hisse-senedi
// ("Dijital müşterilerimize özel on binde 5 hisse senedi alış-satış komisyonu")
//
//   node brokers/vakfkatlm/vakfkatlm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { katilimBook } from "../vakfkatlm/katilim.mjs";
import fs from "node:fs";

const { rows, outside, notInBook, indexSize, book } = await katilimBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("vakfkatlm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `vakfkatlm: ${kept.length} rows, BIST STOCK in BIST Katılım Tüm (${indexSize} flagged on the ${book.bulletinDate} bulletin); ` +
    `ISIN ${kept.filter((row) => row.isin).length}; left out ${outside.STOCK.length} shares outside the index and ${outside.ETF.length} ETFs; ` +
    `dropped ${book.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `flagged but not on KAP's list: ${notInBook.join(" ") || "none"}`
);
