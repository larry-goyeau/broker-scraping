// What Kuveyt Türk Yatırım (Kuveyt Türk Katılım Bankası's broker) sells
// online, with no login: every share and exchange-traded fund on Borsa
// Istanbul, its only place.
//
// Its brokerage page: "tüm emir iletimi ve işlem süreçlerinizi dijital
// kanallarımız üzerinden kolayca yürütebilirsiniz", and the Trade Plus app
// page: "Tradeplus mobil uygulaması ile hisse senedi alım satım
// işlemlerinizi hızlı ve kolaylıkla yapabilir". Although the house follows
// participation-finance principles, no page restricts orders to the BIST
// participation (Katılım) index; it only publishes the index and a list of
// shares that need no purification ("Arındırmasız Hisseler"), as
// information. Its fee table prices order cancellations for "Varant,
// Sertifika ve BYF", so exchange-traded funds (BYF) are traded too. The
// list is the exchange's (../halkyatrm/bistBook.mjs): KAP's listed
// companies and BYF funds with TradingView's names and ISINs, checked
// against Borsa Istanbul's end-of-day equity bulletin, which drops
// suspended lines and lines no longer traded. Warrants, rights,
// certificates and bonds stay out. In lira (BIST, XIST).
//
// The site sits behind a Cloudflare browser check that a script cannot
// pass, so its pages are read from their newest Internet Archive captures
// (October 2026 when this was written; ../denizyatrm/evidence.mjs).
//
//   https://kuveytturkyatirim.com.tr/aracilik-hizmetleri/
//   https://kuveytturkyatirim.com.tr/trade-plus/
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://kuveytturkyatirim.com.tr/ucret-ve-komisyonlar/ ("PAY
// SENEDİ KOMİSYON ORANLARI ... Azami Oran/Ücret ... Hisse Senedi İşlem
// Komisyonu Binde 2 + BSMV").
//
//   node brokers/kuveytturkyatrm/kuveytturkyatrm_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { says } from "../denizyatrm/evidence.mjs";

const read = [];
for (const [url, patterns] of [
  ["https://kuveytturkyatirim.com.tr/ucret-ve-komisyonlar/", [/Hisse Senedi İşlem Komisyonu Binde 2 \+ BSMV/, /Varant, Sertifika ve BYF/]],
  ["https://kuveytturkyatirim.com.tr/aracilik-hizmetleri/", [/işlem süreçlerinizi dijital kanallarımız üzerinden/]],
  ["https://kuveytturkyatirim.com.tr/trade-plus/", [/Tradeplus mobil uygulaması ile hisse senedi alım satım işlemlerinizi/]],
]) {
  const { source } = await says(url, patterns, { wayback: true });
  read.push(`${url.split("/").slice(-2, -1)[0]} (${source})`);
  // The Internet Archive answers 429 to quick repeats.
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const rows = stampRows(withoutObligations(bist.rows));
if (rows.length < 550) throw new Error(`only ${rows.length} BIST rows`);
fs.writeFileSync(new URL("kuveytturkyatrm-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const count = {};
for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `kuveytturkyatrm: ${rows.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; bulletin ${bist.bulletinDate}; ` +
    `pages read: ${read.join(", ")}; ` +
    `dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}`
);
