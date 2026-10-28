// What Vakıf Yatırım (VakıfBank's broker) sells, with no login: every share
// and exchange-traded fund on Borsa Istanbul, its only place. Its share page
// offers BIST trading through branches, agencies and remote channels, and
// its tariff prices shares, exchange-traded funds and warrants at one rate
// ("BİAŞ Pay Senedi, Borsa Yatırım Fonu ve Varant Alım Satım Komisyonu:
// Piyasa değeri üzerinden binde 2"). No page names a board it leaves out.
//
// Its help centre limits only clients who come through Vakıf Katılım or
// Kuveyt Türk (participation banks): they trade shares outside the
// participation index through Vakıf Yatırım's own digital channels
// ("katılım endeksine uygun olmayan hisselere yönelik işlem yapmak için
// Vakıf Yatırım dijital kanallarından faydalanabilirler"). That depends on
// the client, not the title, so nothing is removed for it.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): the share codes of
// the companies on KAP's BIST page and its exchange-traded funds, with
// TradingView's names and ISINs, checked against Borsa Istanbul's own
// end-of-day equity bulletin. A line the bulletin flags as suspended (UMPAS
// on 2026-10-23) or no longer carries is dropped. Warrants, rights,
// certificates and bonds stay out. Everything is in lira (BIST, XIST).
//
// No foreign shares: its products are shares, bonds and repo, VİOP, Forex
// and portfolio services (checked 2026-10-25).
//
//   https://www.vakifyatirim.com.tr/hisse-senedi
//   https://www.vakifyatirim.com.tr/ym-katilim-islem
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.vakifyatirim.com.tr/assets/file/Masraf-ucret-Komisyon-tarifeleri-180326.pdf
//
//   node brokers/vakfyatrm/vakfyatrm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("vakfyatrm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `vakfyatrm: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
