// What Tera Yatırım sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place. Its equity-market page lists what
// trades there (shares, rights, exchange-traded funds, warrants,
// certificates) and says it trades in all of the market's boards: "Pay
// Piyasasında işlem gören tüm pazarlarında işlem gerçekleştirilebilmektedir."
// Clients trade online through the Tera Trader app and screens.
//
// The list is the exchange's, from KAP (../ziraat/bist.mjs): the listed
// companies' share codes and the exchange-traded funds, with TradingView's
// names and ISINs. Warrants, rights, certificates and bonds stay out.
//
// No foreign shares or ETFs (checked 2026-10-22): its products
// ("Yatırım Araçları") are BIST shares, VİOP, SGMK bonds, warrants,
// eurobonds and swaps, and its 2026 fee table prices only Pay Piyasası and
// VİOP. Its 30.06.2026 presentation sends foreign markets to a sister
// company: "Kardeş şirket Tera Europe ile hisse, tahvil, emtia ve
// yapılandırılmış ürünlere küresel erişim" (London, FCA), not an online
// service of Tera Yatırım.
//
//   https://www.terayatirim.com/yatirim-araclari/pay-piyasasi-bist/1
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//
// Fees: https://www.terayatirim.com/dosyalar/kurumsal/Tera_Yatirim__2026__Yili_Masraf%2C_U%CC%88cret_ve_Komisyon_Tablosu.pdf
//
//   node brokers/tera/tera_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistListings } from "../ziraat/bist.mjs";
import fs from "node:fs";

const { rows, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistListings();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("tera-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `tera: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
