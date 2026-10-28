// What Galata Menkul sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place. Its share page describes the
// equity market's boards it serves (Yıldız, Ana, Alt, Yakın İzleme, the
// fund board where "Borsa yatırım fonu katılma belgeleri" trade, and the
// pre-market platform) and leaves none out. The qualified-investor board
// (NYİP: "Nitelikli yatırımcı statüsünde olmayanlar bu pazarda işlem
// yapamaz") has no line in the list, which holds public shares only.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): the share codes of
// the companies on KAP's BIST page and its exchange-traded funds, with
// TradingView's names and ISINs, checked against Borsa Istanbul's own
// end-of-day equity bulletin. A line the bulletin flags as suspended (UMPAS
// on 2026-10-23) or no longer carries is dropped. Warrants, rights,
// certificates and bonds stay out. Everything is in lira (BIST, XIST).
//
// No foreign shares (checked 2026-10-25): its products are "Pay Senedi",
// VİOP, bonds, corporate finance, portfolio management and advisory; its
// fee section prices only the Pay Piyasası and VİOP.
//
//   https://galatamenkul.com/urunler-ve-hizmetlerimiz/hisse-senedi/
//   https://galatamenkul.com/platformlar/hisse-senedi/
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://galatamenkul.com/nasil-hesap-acarim/#komisyon-ve-masraflar
// (Pay Piyasası, "Online İşlemler ... 0.0005 (Onbinde 5)").
//
//   node brokers/galatamenkul/galatamenkul_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("galatamenkul-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `galatamenkul: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
