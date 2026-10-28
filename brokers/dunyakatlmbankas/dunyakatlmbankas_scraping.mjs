// What Dünya Katılım Bankası sells, with no login: the shares of the BIST
// Katılım (participation) index on Borsa Istanbul, its only place, in its
// mobile app. Its shares page: "Bankamız mobil bankacılığı üzerinden
// yalnızca "katılım endeksinde" yer alan şirketlere ait hisse senedi
// işlemleri yapabilirsiniz", and in its FAQ: "yalnızca Katılım Endeksi
// kurallarına uygun hisse senetlerinin alım satımına aracılık
// edilebilmektedir" (shares already held outside the index can be sold).
// The other shares are traded only through Ahlatcı Yatırım's own channels
// ("Katılım endeksi dışındaki hisseler de dahil olmak üzere tüm hisselerde
// işlem yapabilmek için Ahlatcı Yatırım dijital kanallarını
// kullanabilirsiniz"), which are Ahlatcı's catalogue and tariff
// (../ahlatci), so they are left out here. It names no exchange-traded
// fund and the participation index holds shares only, so the exchange's
// ETFs are left out.
//
// The list: ../halkyatrm/bistBook.mjs (KAP's listed companies with
// TradingView's names and ISINs, checked against the exchange's end-of-day
// equity bulletin, which drops suspended and no-longer-traded lines),
// kept when the same bulletin flags the share in "BIST KATILIM TUM
// ENDEKS" (../vakfkatlm/katilim.mjs). Warrants, rights, certificates and
// bonds stay out. Orders go to the exchange through Ahlatcı Yatırım.
//
//   https://dunyakatilim.com.tr/kendim-icin/yatirim-urunleri/sermaye-piyasasi-urunleri/hisse-senedi
//   https://www.borsaistanbul.com/endeksler/bist-pay/katilim
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//   https://www.kap.org.tr/tr/bist-sirketler
//
// Fees: https://dunyakatilim.com.tr/kendim-icin/yatirim-urunleri/sermaye-piyasasi-urunleri/hisse-senedi
// ("işlem hacminin binde ikisi (BSMV hariç) oranında komisyon")
//
//   node brokers/dunyakatlmbankas/dunyakatlmbankas_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { katilimBook } from "../vakfkatlm/katilim.mjs";
import fs from "node:fs";

const { rows, outside, notInBook, indexSize, book } = await katilimBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("dunyakatlmbankas-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `dunyakatlmbankas: ${kept.length} rows, BIST STOCK in BIST Katılım Tüm (${indexSize} flagged on the ${book.bulletinDate} bulletin); ` +
    `ISIN ${kept.filter((row) => row.isin).length}; left out ${outside.STOCK.length} shares outside the index and ${outside.ETF.length} ETFs; ` +
    `dropped ${book.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `flagged but not on KAP's list: ${notInBook.join(" ") || "none"}`
);
