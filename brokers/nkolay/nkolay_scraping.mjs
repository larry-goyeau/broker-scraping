// What N Kolay (Aktif Bank's digital bank) sells online, with no login:
// every share and exchange-traded fund on Borsa Istanbul, and the US shares
// and ETFs, a place for which it publishes no list.
//
// Its shares page: "BİST ve ABD Borsalarında hisse senedi İşlemleri N Kolay
// Trader’da!", "Hem Borsa İstanbul hem de Amerikan Borsalarında hisse
// senedi işlemlerini N Kolay Trader ile düşük komisyon oranlarıyla kolayca
// gerçekleştir", and "Aktif Yatırım Bankası A.Ş., Aktif Yatırım Menkul
// Kıymetler A.Ş. aracılığıyla hisse senedi ve VİOP işlemlerinde emir
// iletimine aracılık hizmeti vermektedir": orders go through Aktif Yatırım
// (../aktifyatrm), whose fee page prices the N Kolay channels by name.
//
// Borsa Istanbul. The page names no board, segment or fund it leaves out;
// shares under gross settlement can be bought (with cash, "Brüt Takas
// tedbiri" only limits what a sale's proceeds can buy), so nothing is
// removed for them. The list is the exchange's
// (../halkyatrm/bistBook.mjs): KAP's listed companies and BYF funds with
// TradingView's names and ISINs, checked against Borsa Istanbul's
// end-of-day equity bulletin, which drops suspended lines and lines no
// longer traded. Warrants, rights, certificates and bonds stay out. In lira
// (BIST, XIST).
//
// United States. "ABD Borsaları" / "Amerikan Borsaları" names no exchange
// and no count, so the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on the US exchanges, less
// the lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). One NBBO
// market: one row per title, on its primary listing, in dollars. OTC
// Markets is on Aktif Yatırım's fee table but N Kolay's pages do not offer
// it, and broker-list.json gives N Kolay Borsa Istanbul and the United
// States only, so it is left out.
//
//   https://www.nkolay.com/yatirim/hisse-senedi
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.aktifyatirim.com.tr/komisyon-ucretler ("N KOLAY
// TRADER/MOBİL YURTİÇİ HİSSE GÜNLÜK HACME GÖRE KOMİSYON SKALASI Dijital
// Kanallar ( N Kolay Trader/ N Kolay Mobil/ İnternet Şube) - Pay
// Piyasası", 0,00130 up to ₺500.000 of daily volume, falling with volume;
// US internet orders "ABD AMEX, ARCA, BATS, NYSE, NASDAQ, NYSE ARCA, OTC 1
// 0.01 USD", minimum 1 USD, BSMV excluded).
//
//   node brokers/nkolay/nkolay_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { says } from "../denizyatrm/evidence.mjs";

await says("https://www.nkolay.com/yatirim/hisse-senedi", [
  /BİST ve ABD Borsalarında hisse senedi İşlemleri N Kolay Trader/,
  /Aktif Yatırım Menkul Kıymetler A\.Ş\. aracılığıyla hisse senedi ve VİOP işlemlerinde emir iletimine aracılık/,
]);
await says("https://www.aktifyatirim.com.tr/komisyon-ucretler", [
  /Dijital Kanallar \( N Kolay Trader\/ N Kolay Mobil\/ İnternet Şube\) - Pay Piyasası/,
  /ABD AMEX, ARCA, BATS, NYSE, NASDAQ, NYSE ARCA, OTC 1 0\.01 USD/,
]);

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const us = await usBook();
const rows = stampRows(withoutObligations([...bist.rows, ...us]));
if (rows.filter((row) => row.mic === "XIST").length < 550) throw new Error("short BIST part");
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("nkolay-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`nkolay: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `BIST bulletin ${bist.bulletinDate}; dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report?.directories)}`
);
