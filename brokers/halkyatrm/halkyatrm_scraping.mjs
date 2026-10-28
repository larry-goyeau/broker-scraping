// What Halk Yatırım sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place. Its equity-market page offers
// share trading through branches, the call centre, the internet branch and
// the mobile app ("internet şubesi ve mobil cihazlardan ... Pay Piyasası
// işlemlerinizi gerçekleştirebilirsiniz") and names no board it leaves out.
// Its fee table prices exchange-traded funds at the share rate ("Borsa
// yatırım fonu alım satım işlemlerinde ... pay alım satım işlemi komisyon
// oranı uygulanır"). The only market limit it prints is for its T+0 cash
// service, "Yıldız Pazar ve Ana Pazar'da yer alan paylar için geçerli": a
// service, not a trading restriction, so nothing is removed for it.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): the share codes of
// the companies on KAP's BIST page and its exchange-traded funds, with
// TradingView's names and ISINs, checked against Borsa Istanbul's own
// end-of-day equity bulletin. A line the bulletin flags as suspended (UMPAS
// on 2026-10-23) or no longer carries is dropped. Warrants, rights,
// certificates and bonds stay out. Everything is in lira (BIST, XIST).
//
// No foreign shares: its products are Pay Piyasası, VİOP, Forex (leveraged
// CFDs), Eurobonds and portfolio services (checked 2026-10-25).
//
//   https://www.halkyatirim.com.tr/content/tr/pay-piyasasi
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://halkyatirim.com.tr/pdf/KomisyonveMasrafTarifesi.pdf
// ("Pay Alım Satım İşlemleri: İşlem hacmi üzerinden %0,3 (binde 3)").
//
//   node brokers/halkyatrm/halkyatrm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("halkyatrm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `halkyatrm: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
