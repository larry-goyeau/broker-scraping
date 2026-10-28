// What Piapiri (the app of ÜNLÜ & Co's broker) sells, with no login: every
// share and exchange-traded fund on Borsa Istanbul, and US shares and
// ETFs, a place for which it publishes no list.
//
// Borsa Istanbul. Its "Borsa İstanbul" page offers share trading in the
// app and prices it by monthly volume ("Borsa İstanbul Komisyon
// Oranlarımız": "150.000 - 500.000 TL arası On binde 5", 4, 3, "5.000.000
// TL'den fazla On binde 2"); no page names a board, segment or fund it
// leaves out, so the exchange-traded funds stay. The list is the
// exchange's (../halkyatrm/bistBook.mjs): KAP's listed companies and BYF
// funds with TradingView's names and ISINs, checked against Borsa
// Istanbul's end-of-day equity bulletin, which drops suspended lines
// (UMPAS on 2026-10-23) and lines no longer traded. Warrants, rights,
// certificates and bonds stay out. In lira (BIST, XIST).
//
// United States. The "ABD Borsaları" page: "NASDAQ ve NYSE piyasalarında
// işlem gören Amerikan hisselerini portföyüne ekleyebilirsin", "Nasdaq ve
// NYSE gibi dünyanın en büyük borsalarında işlem gören hisselere" (gibi:
// such as, so no US exchange is left out), "Piapiri'de yurt dışı hisse
// senetleri kapsamında ETF alım satımı yapabilirsin" (it names SPDR Gold
// Shares and United States Oil Fund, both on NYSE Arca, and leveraged
// ETFs). It says "yüzlerce ABD şirketine" (hundreds): no number, so no
// top-N cut. The catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). OTC
// lines are not named and not in the book. One NBBO market: one row per
// title, on its primary listing, in dollars.
//
//   https://www.piapiri.com/urunlerhizmetler/borsa-istanbul/
//   https://www.piapiri.com/urunlerhizmetler/abd-borsalari/
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: the two pages above (BIST scale; US "1 – 260 Sabit 1,3 USD", above
// 260 shares "Lot x 0.005 USD").
//
//   node brokers/piapiri/piapiri_scraping.mjs

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

await evidence("https://www.piapiri.com/urunlerhizmetler/borsa-istanbul/", [/150\.000 - 500\.000 TL arası On binde 5/]);
await pause();
await evidence("https://www.piapiri.com/urunlerhizmetler/abd-borsalari/", [
  /Nasdaq ve NYSE gibi dünyanın en büyük borsalarında/,
  /ETF alım satımı yapabilirsin/,
  /Sabit 1,3 USD/,
]);

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const us = await usBook();
const rows = stampRows(withoutObligations([...bist.rows, ...us]));
if (rows.filter((row) => row.mic === "XIST").length < 550) throw new Error("short BIST part");
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("piapiri-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`piapiri: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `BIST bulletin ${bist.bulletinDate}; dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
