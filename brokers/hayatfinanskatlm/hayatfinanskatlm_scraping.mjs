// What Hayat Finans Katılım Bankası sells, with no login: the shares of
// the BIST Katılım (participation) index on Borsa Istanbul, its only place,
// in its mobile app. Its shares page: "Hayat Finans, Katılım bankacılığı
// prensipleri doğrultusunda icazet almış, Borsa İstanbul da işlem gören,
// KATILIM ENDEKSİ hisse senetlerine erişim sağlar", and in its FAQ:
// "Borsa İstanbul Katılım Endeksi Hisselerinde alım satım işlemi
// gerçekleştirebilirsiniz". It names no exchange-traded fund and the
// participation index holds shares only, so the exchange's ETFs are left
// out. A share that fails the index criteria two periods running can only
// be sold ("sadece satışına izin verilecek"); such a share has also left
// the index, so it is not in the list.
//
// The list: ../halkyatrm/bistBook.mjs (KAP's listed companies with
// TradingView's names and ISINs, checked against the exchange's end-of-day
// equity bulletin, which drops suspended and no-longer-traded lines),
// kept when the same bulletin flags the share in "BIST KATILIM TUM
// ENDEKS" (../vakfkatlm/katilim.mjs). Warrants, rights, certificates and
// bonds stay out. The page shows OYAK Yatırım's icazet (sharia approval)
// certificate.
//
//   https://hayatfinans.com.tr/yatirim-ve-birikim/hisse-senedi-islemleri-yatirim-ve-birikim
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//   https://www.kap.org.tr/tr/bist-sirketler
//
// Fees: https://hayatfinans.com.tr/yatirim-ve-birikim/hisse-senedi-islemleri-yatirim-ve-birikim
// ("Komisyon oranı: 0,002 (binde 2)")
//
//   node brokers/hayatfinanskatlm/hayatfinanskatlm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { katilimBook } from "../vakfkatlm/katilim.mjs";
import fs from "node:fs";

const { rows, outside, notInBook, indexSize, book } = await katilimBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("hayatfinanskatlm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `hayatfinanskatlm: ${kept.length} rows, BIST STOCK in BIST Katılım Tüm (${indexSize} flagged on the ${book.bulletinDate} bulletin); ` +
    `ISIN ${kept.filter((row) => row.isin).length}; left out ${outside.STOCK.length} shares outside the index and ${outside.ETF.length} ETFs; ` +
    `dropped ${book.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `flagged but not on KAP's list: ${notInBook.join(" ") || "none"}`
);
