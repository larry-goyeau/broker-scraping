// What Osmanlı Yatırım sells, with no login: every share and
// exchange-traded fund on Borsa Istanbul, and the US shares and ETFs
// listed on Nasdaq, the NYSE and NYSE American, a place for which it
// publishes no list.
//
// Borsa Istanbul. Its share page offers "Nakit Hisse İşlemleri" on its
// online platforms (e-Şube, Osmanlı Mobil, Aktif Trader, TradingView) and
// its products include "Döviz Emtia BYF ve Sertifikalar"; the fee page
// prices shares on a monthly-volume scale ("Hisse (pay) senedi işlemleri
// için maksimum on binde 3,75", then 2.75, 1.75 and 1.00, effective
// 07.07.2026). No page names a board, segment or fund it leaves out, so
// the exchange-traded funds stay. The list is the exchange's
// (../halkyatrm/bistBook.mjs): KAP's listed companies and BYF funds with
// TradingView's names and ISINs, checked against Borsa Istanbul's
// end-of-day equity bulletin, which drops suspended lines (UMPAS on
// 2026-10-23) and lines no longer traded. Warrants, rights, certificates
// and bonds stay out. In lira (BIST, XIST).
//
// United States. The "Yabancı Hisse" page: "yurt dışı piyasalarda işlem
// gören birçok hisseye erişim sağlayın" (many shares, no number, so no
// top-N cut), "ETF’lerde İşlem İmkanı", and, under "ABD borsalarında
// işlem saatleri nelerdir?", the three exchanges it trades: "AMERİKA
// NASDAQ NDX", "AMERİKA New York Stock Exchange NYSE", "AMERİKA American
// Stock Exchange AMEX". broker-list.json gives the same three (Nasdaq,
// New York Stock Exchange, NYSE American). Under the named-venues rule
// the catalogue keeps the lines listed on those exchanges (MIC XNAS, XNYS,
// XASE) of the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs, less the lines with an
// open trade halt, warrants, rights, units, when-issued lines and listed
// notes (usBook) and bonds (withoutObligations). ETFs listed on NYSE
// Arca and Cboe BZX are left out by that rule. One NBBO market: one row
// per title, on its primary listing, in dollars.
//
//   https://www.osmanlimenkul.com.tr/hisse-ve-viop/hisse-ve-viop-urunlerimiz/hisse/hisse2
//   https://www.osmanlimenkul.com.tr/hisse-ve-viop/hisse-ve-viop-urunlerimiz/hisse/yabanci-hisse-
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.osmanlimenkul.com.tr/finansal-planlama/hesap-acilis-islemleri/ucret-ve-komisyonlar
// (BIST scale above; "Hisse 0,01 $ ABD hisse ve ETF işlemlerinde komisyon
// hisse başına alınır", minimum 2 dollars).
//
//   node brokers/osmanlyatrm/osmanlyatrm_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const US_VENUES = new Set(["XNAS", "XNYS", "XASE"]);
const NAMED = { uuml: "ü", Uuml: "Ü", ouml: "ö", Ouml: "Ö", ccedil: "ç", Ccedil: "Ç", rsquo: "’", quot: '"' };
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(uuml|Uuml|ouml|Ouml|ccedil|Ccedil|rsquo|quot);/g, (_, name) => NAMED[name])
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.osmanlimenkul.com.tr/finansal-planlama/hesap-acilis-islemleri/ucret-ve-komisyonlar", [
  /maksimum on binde 3,75/,
  /ABD hisse ve ETF işlemlerinde komisyon hisse başına alınır/,
]);
await pause();
await evidence("https://www.osmanlimenkul.com.tr/hisse-ve-viop/hisse-ve-viop-urunlerimiz/hisse/yabanci-hisse-", [
  /yurt dışı piyasalarda işlem gören birçok hisseye erişim/,
  /AMERİKA NASDAQ NDX .* AMERİKA New York Stock Exchange NYSE .* AMERİKA American Stock Exchange AMEX/,
]);

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const us = await usBook();
const usRows = us.filter((row) => US_VENUES.has(row.mic));
const rows = stampRows(withoutObligations([...bist.rows, ...usRows]));
if (rows.filter((row) => row.mic === "XIST").length < 550) throw new Error("short BIST part");
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("osmanlyatrm-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`osmanlyatrm: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")}); US lines on other venues left out: ${us.length - usRows.length}`);
console.error(
  `BIST bulletin ${bist.bulletinDate}; dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
