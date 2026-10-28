// What ICBC Turkey Yatırım sells, with no login: every share and exchange-
// traded fund on Borsa Istanbul, its only place. Its share page offers
// brokerage on BIST shares ("hisse senetlerinin BIST'de alım-satımına
// aracılık hizmeti sunulmaktadır") through agencies, phone and the internet
// branch, and names the market's shares, rights and exchange-traded funds.
// Its tariff covers the whole equity market, the Pre-Market Trading
// Platform included ("Borsa İstanbul Pay Piyasası, Gelişen İşletmeler
// Pazarı (GİP) ve Piyasa Öncesi İşlem Platformunda (PÖİP) işlem gören
// paylar, yeni pay alma hakları, borsa yatırım fonları ..."), so no board
// is left out. ICBC Turkey Bank's own share page sends clients to it.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): the share codes of
// the companies on KAP's BIST page and its exchange-traded funds, with
// TradingView's names and ISINs, checked against Borsa Istanbul's own
// end-of-day equity bulletin. A line the bulletin flags as suspended (UMPAS
// on 2026-10-23) or no longer carries is dropped. Warrants, rights,
// certificates and bonds stay out. Everything is in lira (BIST, XIST).
//
// No foreign shares on its pages (checked 2026-10-25): shares, VİOP,
// warrants, bonds, money markets and OTC derivatives.
//
//   https://www.icbcyatirim.com.tr/tr/hizmetlerimiz/detay/Hisse-Senedi/14/12/0
//   https://www.icbc.com.tr/tr/sizin-icin/detay/Hisse-Senedi/66/40/0
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.icbcyatirim.com.tr/tr/images/pdf/Masraf-Komisyon-ve-Ucret-Listesi.pdf
// (a cap per client: the rate is set in the contract, up to "yüzde 1").
//
//   node brokers/icbcturkeyyatrm/icbcturkeyyatrm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("icbcturkeyyatrm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `icbcturkeyyatrm: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
