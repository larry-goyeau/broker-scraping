// What Anadolu Yatırım (Anadolubank's broker, online as Webborsam) sells,
// with no login: every share and exchange-traded fund on Borsa Istanbul, its
// only place. Webborsam is its web and mobile platform for shares, VİOP and
// currency pairs ("Hisse Senedi, VİOP ve parite işlemlerinizi
// gerçekleştirebileceğiniz"), showing "BIST 30, 50, 100, Tüm hisseleri".
// Its pages name no board, segment or exchange-traded fund it leaves out, so
// the funds stay in.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): the share codes of
// the companies on KAP's BIST page and its exchange-traded funds, with
// TradingView's names and ISINs, checked against Borsa Istanbul's own
// end-of-day equity bulletin. A line the bulletin flags as suspended (UMPAS
// on 2026-10-23) or no longer carries is dropped. Warrants, rights,
// certificates and bonds stay out. Everything is in lira (BIST, XIST).
//
// No foreign shares (checked 2026-10-25): its products are shares, IPOs,
// warrants and VİOP; "Paritem" is leveraged forex, not a share market.
//
//   https://webborsam.com/webborsam/yapabilecekleriniz
//   https://webborsam.com/urunler/hisse-senedi
//   https://webborsam.com/islem-platformlari/sikca-sorulan-sorular/webborsam
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://webborsam.com/webborsam/komisyon-oranlari
// (shares by monthly volume, "0 – 750.000: 2" per mille down to 0,5).
//
//   node brokers/anadoluyatrm/anadoluyatrm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("anadoluyatrm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `anadoluyatrm: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
