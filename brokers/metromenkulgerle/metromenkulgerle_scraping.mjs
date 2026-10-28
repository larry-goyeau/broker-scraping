// What Metro Menkul Değerler sells, with no login: every share and
// exchange-traded fund on Borsa Istanbul, its only place. Its services are
// Hazine, Pay Piyasası, VİOP and Yatırım Fonu, with orders through its
// MetroTrade platform. The equity terms of its account contract cover
// "payların, borsa yatırım fonu katılma belgelerinin, varantların ve
// sertifikaların Borsa İstanbul Pay Piyasası’nda alım satımı", and the
// contract carries the risk forms for the Alt Pazar and the Piyasa Öncesi
// İşlem Platformu, so no board is left out. Its fee table prices
// "Pay Senedi/Borsa Yatırım Fonu/Varant" trades at one rate.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): the share codes of
// the companies on KAP's BIST page and its exchange-traded funds, with
// TradingView's names and ISINs, checked against Borsa Istanbul's own
// end-of-day equity bulletin. A line the bulletin flags as suspended (UMPAS
// on 2026-10-23) or no longer carries is dropped. Warrants, rights,
// certificates and bonds stay out. Everything is in lira (BIST, XIST).
//
// No foreign shares (checked 2026-10-25): its services page lists only
// Turkish markets and its fee table prices only Borsa Istanbul, VİOP, bonds,
// repo and money-market trades. The contract's general clauses on foreign
// markets are standard wording, not a service it offers.
//
//   https://www.metromenkul.com.tr/servisler/hisse-senetleri
//   https://www.metromenkul.com.tr/storage/app/uploads/public/685/530/e0b/685530e0b6637507358198.pdf (account contract)
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.metromenkul.com.tr/storage/app/uploads/public/685/51b/6d3/68551b6d3e691026056439.pdf
// ("Pay Senedi/Borsa Yatırım Fonu/Varant - Alım Satım Komisyonu 0.002
// (binde 2-Müşteri bazlı oran)").
//
//   node brokers/metromenkulgerle/metromenkulgerle_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("metromenkulgerle-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `metromenkulgerle: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
