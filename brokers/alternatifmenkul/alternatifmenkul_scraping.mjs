// What Alternatif Menkul (Alternatif Bank's broker) sells, with no login:
// every share and exchange-traded fund on Borsa Istanbul, its only place.
// Its BIST page says the equity market trades shares, rights, exchange-
// traded funds and warrants ("Pay, rüçhan hakkı kuponları, borsa yatırım
// fonları ve varantlar işlem görmektedir") and offers that market's trading;
// its internet branch takes "Hisse senedi, Varant, Borsa Yatırım Fonları
// alım - satım işlemleri". No board or segment is left out.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): the share codes of
// the companies on KAP's BIST page and its exchange-traded funds, with
// TradingView's names and ISINs, checked against Borsa Istanbul's own
// end-of-day equity bulletin. A line the bulletin flags as suspended (UMPAS
// on 2026-10-23) or no longer carries is dropped. Warrants, rights,
// certificates and bonds stay out. Everything is in lira (BIST, XIST).
//
// No foreign shares (checked 2026-10-25): its services are BIST shares,
// VİOP, bonds, funds, IPOs and OTC derivatives; its fee page prices only
// "Pay Senetleri" and "Vadeli İşlemler".
//
//   https://www.alternatifmenkul.com.tr/hizmetlerimiz/aracilik-hizmetleri/bist-hisse-senetleri
//   https://www.alternatifmenkul.com.tr/islem-kanallari/internet-subesi
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.alternatifmenkul.com.tr/bize-ulasin/masraf-ve-komisyonlar
// ("Pay Senetleri alım satım komisyonu: Internet binde 1").
//
//   node brokers/alternatifmenkul/alternatifmenkul_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("alternatifmenkul-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `alternatifmenkul: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
