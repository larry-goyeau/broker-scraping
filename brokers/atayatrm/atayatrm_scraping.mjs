// What Ata Yatırım sells, with no login: every share and exchange-traded
// fund on Borsa Istanbul, and the US shares and ETFs listed on Nasdaq and
// the NYSE, a place for which it publishes no list.
//
// Borsa Istanbul. Its fee page prices "Pay Piyasası İşlem Komisyonları"
// at a fixed rate ("% 0.18 (Onbinde onsekiz)") and its menu offers
// "Hisse Senedi" and "Tüm Hisseler"; no page names a board, segment or
// fund it leaves out, so the exchange-traded funds stay. The list is the
// exchange's (../halkyatrm/bistBook.mjs): KAP's listed companies and BYF
// funds with TradingView's names and ISINs, checked against Borsa
// Istanbul's end-of-day equity bulletin, which drops suspended lines
// (UMPAS on 2026-10-23) and lines no longer traded. Warrants, rights,
// certificates and bonds stay out. In lira (BIST, XIST).
//
// United States. The "Yurt Dışı Borsalar" page: "ABD’nin en büyük
// borsalarında (NASDAQ, S&P 500 ve Dow Jones) hisse senedi işlemlerinizi
// ... AtaOnline üzerinden gerçekleştirebilirsiniz", its FAQ "Amerika
// Birleşik Devletleri borsalarında (NASDAQ, S&P 500 ve Dow Jones) yer alan
// hisse senetleri ile işlem yapabilirsiniz", and "Yurt Dışı Piyasalarda
// İşlem Gören Borsa Yatırım Fonlarına (ETF) Yatırım Yapabilirsiniz". It
// says "yüzlerce ABD şirketine" (hundreds of US companies): no number, so
// no top-N cut. "ABD'nin en büyük borsalarında" (on the largest US
// exchanges) gives Nasdaq and two indices as examples, which implies other
// US exchanges, so the catalogue is the whole US exchange book of the day
// (owner's rule, 2026-10-25: places named as examples mean the whole country)
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs, less the lines with an
// open trade halt, warrants, rights, units, when-issued lines and listed
// notes (usBook) and bonds (withoutObligations). One NBBO market: one row
// per title, on its primary listing, in dollars. broker-list.json gives Ata
// Nasdaq only; the page's wording is wider.
//
//   https://atayatirim.com.tr/landingpages/yurt-disi-borsalar
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://atayatirim.com.tr/sss/ucret-ve-tarifeler (BIST 0.18%; US
// "pay senedinde adet başına 0,02 USD işlem komisyonu", minimum 1 USD;
// the US page adds a "sıfır komisyon" offer up to 100 trades or 100
// dollars of commission a month).
//
//   node brokers/atayatrm/atayatrm_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
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

await evidence("https://atayatirim.com.tr/sss/ucret-ve-tarifeler", [/% 0\.18 \(Onbinde onsekiz\)/, /adet başına 0,02 USD işlem komisyonu/]);
await pause();
await evidence("https://atayatirim.com.tr/landingpages/yurt-disi-borsalar", [
  /borsalarında \(NASDAQ, S&P 500 ve Dow Jones\) yer alan hisse senetleri ile işlem yapabilirsiniz/,
  /Borsa Yatırım Fonlarına \(ETF\) Yatırım Yapabilirsiniz/,
]);

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const us = await usBook();
const usRows = us;
const rows = stampRows(withoutObligations([...bist.rows, ...usRows]));
if (rows.filter((row) => row.mic === "XIST").length < 550) throw new Error("short BIST part");
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("atayatrm-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`atayatrm: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `BIST bulletin ${bist.bulletinDate}; dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
