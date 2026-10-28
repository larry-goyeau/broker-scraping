// What Aktif Yatırım (Aktif Bank's broker) sells, with no login: every
// share and exchange-traded fund on Borsa Istanbul, and US shares and ETFs,
// a place for which it publishes no list.
//
// Borsa Istanbul. Its fee page prices equity orders on the digital
// channels ("Dijital Kanallar ( N Kolay Trader/ N Kolay Mobil/ İnternet
// Şube) - Pay Piyasası", a daily-volume scale from 0.00130) and the share
// commission "İşlem hacmi üzerinden binde 1.8 veya işlem hacmine göre
// değişen oranlar"; its share page names no board or segment it leaves
// out. Exchange-traded funds trade on the same equity market and no page
// excludes them, so they stay. The list is the exchange's
// (../halkyatrm/bistBook.mjs): KAP's listed companies and BYF funds with
// TradingView's names and ISINs, checked against Borsa Istanbul's
// end-of-day equity bulletin, which drops suspended lines (UMPAS on
// 2026-10-23) and lines no longer traded. Warrants, rights, certificates
// and bonds stay out. In lira (BIST, XIST).
//
// United States. The foreign-markets page offers "ABD’de faaliyet
// gösteren borsalarda" shares, ETFs and ADRs, "ABD borsaları (NASDAQ,
// NYSE, AMEX, ARCA, BATS) gibi küresel piyasalarda": the exchanges are
// named with "gibi" (such as), so no US exchange is left out, and no page
// names a kind of share or fund it does not take. The catalogue is the
// whole US exchange book of the day (../wellstrade/usBook.mjs): shares,
// ADRs, REITs, partnership units, preferreds, closed-end funds, ETFs and
// ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas
// Stock Exchange, less the lines with an open trade halt, and less
// warrants, rights, units, when-issued lines and listed notes (usBook)
// and bonds (withoutObligations). One NBBO market: one row per title, on
// its primary listing, in dollars. The page gives no count of titles.
//
// OTC Markets: the fee table's US row reads "ABD AMEX, ARCA, BATS, NYSE,
// NASDAQ, NYSE ARCA, OTC" and broker-list.json gives Aktif OTC Markets. No
// tier is named, so the OTC Markets lines of the four tiers with a public quote, OTCQX,
// OTCQB, OTCID and Pink Limited (../moomoous/otcBook.mjs; owner rule: the
// tiers the broker names, else all of them).
//
//   https://www.aktifyatirim.com.tr/urunler-hizmetler/hisse-senedi
//   https://www.aktifyatirim.com.tr/urunler-hizmetler/yurt-disi-islemler
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.aktifyatirim.com.tr/komisyon-ucretler (BIST as
// above; US internet orders "0.01 USD" a share, "Minimum komisyon tutarı
// (BSMV Hariç) 1 USD").
//
//   node brokers/aktifyatrm/aktifyatrm_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
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

await evidence("https://www.aktifyatirim.com.tr/komisyon-ucretler", [
  /İşlem hacmi üzerinden binde 1\.8/,
  /ABD AMEX, ARCA, BATS, NYSE, NASDAQ, NYSE ARCA, OTC 1 0\.01 USD/,
]);
await pause();
await evidence("https://www.aktifyatirim.com.tr/urunler-hizmetler/yurt-disi-islemler", [
  /ABD borsaları \(NASDAQ, NYSE, AMEX, ARCA, BATS\) gibi/,
  /Borsa yatırım fonları \(ETFs\)/i,
]);

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const us = await usBook();
const otc = await otcBook(us);
const rows = stampRows(withoutObligations([...bist.rows, ...us, ...otc.rows]));
if (rows.filter((row) => row.mic === "XIST").length < 550) throw new Error("short BIST part");
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("aktifyatrm-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`aktifyatrm: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `BIST bulletin ${bist.bulletinDate}; dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
console.error(otc.summary);
