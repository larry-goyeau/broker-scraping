// What İntegral Yatırım sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place. Its BIST page sells all the
// exchange's shares online ("Tüm hisse senedi ve VİOP işlemlerinizi ...
// internet şubesinden kolayca gerçekleştirebilirsiniz"), and its equity-
// market page lists the boards, including the fund board where the
// exchange-traded funds trade ("Borsa yatırım fonu katılma belgeleri ...
// işlem görebildiği pazardır"), without leaving any out.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): the share codes of
// the companies on KAP's BIST page and its exchange-traded funds, with
// TradingView's names and ISINs, checked against Borsa Istanbul's own
// end-of-day equity bulletin. A line the bulletin flags as suspended (UMPAS
// on 2026-10-23) or no longer carries is dropped. Warrants, rights,
// certificates and bonds stay out. Everything is in lira (BIST, XIST).
//
// No foreign shares: its products are BIST, VİOP, Forex (leveraged CFDs)
// and corporate finance (checked 2026-10-25).
//
//   https://integralyatirim.com.tr/borsa
//   https://integralyatirim.com.tr/borsa/pay-piyasasi
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://integralyatirim.com.tr/uploads/05_ucret_komisyon_masraf_tablosu_web_022026.pdf
// ("Hisse Senedi: Binde 1+BSMV"; "Hisse Senedi (İnternet): 0").
//
//   node brokers/integralyatrm/integralyatrm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("integralyatrm-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `integralyatrm: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
