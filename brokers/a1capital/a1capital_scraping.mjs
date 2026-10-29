// What A1 Capital sells online, with no login: the shares and
// exchange-traded funds of Borsa Istanbul, its only place, less the shares
// under gross settlement.
//
// Its equity page: orders go through "A1 Capital Mobil uygulamamız, Online
// Şubemiz, size özel atanmış müşteri temsilcilerimiz ya da diğer elektronik
// emir iletim ekranlarımız", on the market where "farklı sektörlerden
// şirketlerin payları, yeni pay alma (rüçhan) hakları, borsa yatırım
// fonları, varantlar ve sertifikalar işlem gördüğü" (shares, rights,
// exchange-traded funds, warrants and certificates). It names one online
// exception: "Brüt Takas uygulaması dahilinde olan hisse senetleri için
// online kanallardan alım/satım emri girilemez. Yalnızca telefon aracılığı
// ile müşteri temsilcileri veya şahsen alım satım emri verilebilir." Those
// shares are taken out (./bistGross.mjs: the "GROSS SETTLEMENT" flag of the
// exchange's end-of-day bulletin, 89 lines on 2026-10-28, mostly the
// Watchlist Market). broker-list.json gives Borsa Istanbul alone.
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): KAP's listed
// companies and BYF funds with TradingView's names and ISINs, checked
// against Borsa Istanbul's end-of-day equity bulletin, which drops
// suspended lines and lines no longer traded. Rights, warrants,
// certificates and bonds stay out. In lira (BIST, XIST).
//
//   https://a1capital.com.tr/hisse-senedi/
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://a1capital.b-cdn.net/wp-content/uploads/2026/04/20260413-a1-capital-ucret-ve-komisyon.pdf
// (in force 13.04.2026: "PAY PİYASASI ALIM/SATIM KOMİSYONU : 0,002 + BSMV +
// Borsa Payı (Her işlem için işlem hacmi üzerinden)", "Yatırımcı ve işlem
// bazında farklı oranlar uygulanabilir").
//
//   node brokers/a1capital/a1capital_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";
import { grossSettlement } from "./bistGross.mjs";

await says("https://a1capital.com.tr/hisse-senedi/", [
  /Brüt Takas uygulaması dahilinde olan hisse senetleri için online kanallardan alım\/satım emri girilemez/,
  /A1 Capital Mobil uygulamamız, Online Şubemiz/,
  /borsa yatırım fonları/,
]);
await pdfAnswers("https://a1capital.b-cdn.net/wp-content/uploads/2026/04/20260413-a1-capital-ucret-ve-komisyon.pdf");

const bist = await bistBook();
const gross = await grossSettlement();
if (gross.day !== bist.bulletinDate) throw new Error(`bulletins differ: ${gross.day} and ${bist.bulletinDate}`);
const offline = [];
const kept = [];
for (const row of bist.rows) {
  if (row.type === "STOCK" && gross.codes.has(row.ticker)) offline.push(row.ticker);
  else kept.push(row);
}
for (const row of kept) if (row.isin) row.query = row.isin;
const rows = stampRows(withoutObligations(kept));
if (rows.length < 450) throw new Error(`only ${rows.length} BIST rows`);
fs.writeFileSync(new URL("a1capital-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const count = {};
for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `a1capital: ${rows.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; bulletin ${bist.bulletinDate}; ` +
    `gross settlement (phone only) ${offline.length}: ${offline.sort().join(" ")}; ` +
    `dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}`
);
