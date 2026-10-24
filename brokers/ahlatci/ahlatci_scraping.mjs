// What Ahlatcı Yatırım sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, its only place. Its e-Şube page says the client
// trades all of the exchange's shares: "BİST'de yer alan tüm hisse
// senetleri, varantlar ve VİOP kontratlarında işlem yapabilme". Its BIST
// page names the exchange-traded funds among what it takes orders for on
// the equity market ("payları, rüçhan hakkı kuponları, borsa yatırım
// fonları, varantlar ve sertifikalar için alım-satım emirlerinizi").
//
// The list is the exchange's, from KAP (../ziraat/bist.mjs): the listed
// companies' share codes and the exchange-traded funds, with TradingView's
// names and ISINs. Warrants, rights, certificates and bonds stay out.
//
// No foreign shares or ETFs (checked 2026-10-22): its brokerage page lists
// what it trades "yurt içinde" (Pay Piyasası, VİOP, derivatives, IPOs); its
// legal page shows a licence for order transmission of foreign shares
// ("Emir İletimine Aracılık", "Yurt Dışında", Paylar: "İzni Var") but no
// page, platform, list or fee for it. Its tariff prices only BIST shares,
// bonds and VİOP; Forex is leveraged currency/index CFDs.
//
//   https://www.ahlatciyatirim.com.tr/hizmetlerimiz/islem-araciligi
//   https://www.ahlatciyatirim.com.tr/hakkimizda/yasal-bildirimler
//   https://www.ahlatciyatirim.com.tr/platformlar/e-sube
//   https://www.ahlatciyatirim.com.tr/hizmetlerimiz/bist
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//
// Fees: https://www.ahlatciyatirim.com.tr/hakkimizda/bilmeniz-gerekenler
// ("Masraf Komisyon Tarifesi")
//
//   node brokers/ahlatci/ahlatci_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistListings } from "../ziraat/bist.mjs";
import fs from "node:fs";

const { rows, notShares, missing, kapCodes, kapFunds, isYatirimOnly } = await bistListings();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("ahlatci-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `ahlatci: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; ` +
    `not a share ${notShares.length} (${notShares.join(" ") || "none"}); not on TradingView ${missing.length} (${missing.join(" ") || "none"}); ` +
    `on İş Yatırım only: ${isYatirimOnly ? isYatirimOnly.join(" ") || "none" : "not checked"}`
);
