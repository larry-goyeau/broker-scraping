// What Tacirler Yatırım sells, with no login: every share and
// exchange-traded fund on Borsa Istanbul, and, through its Rally app
// (accounts at DriveWealth LLC), the 6,000 most traded shares listed on
// the NYSE and Nasdaq, a place for which it publishes no list.
//
// Borsa Istanbul. Its fee page prices internet share orders by daily
// volume ("İnternet Yoluyla İletilen Emirler": "0-500,000 0.001 (Binde
// 1,00)", then 7.50, 5.00, 2.50 and 1.50 in ten-thousandths); no page
// names a board, segment or fund it leaves out, so the exchange-traded
// funds stay. The list is the exchange's (../halkyatrm/bistBook.mjs):
// KAP's listed companies and BYF funds with TradingView's names and ISINs,
// checked against Borsa Istanbul's end-of-day equity bulletin, which
// drops suspended lines (UMPAS on 2026-10-23) and lines no longer traded.
// Warrants, rights, certificates and bonds stay out. In lira (BIST, XIST).
//
// United States. The Rally FAQ: "Rally Platformu üzerinden, NYSE ve
// NASDAQ’ta işlem gören yaklaşık 6.000’den fazla şirketin hisse senedi ve
// Amerikan depo sertifikalarında yatırım yapabilirsiniz" (the shares and
// ADRs of some 6,000-plus companies traded on the NYSE and Nasdaq); the
// fee form's US row is "ABD NYSE, NASDAQ". That is a stated count on
// named exchanges, so the catalogue is the 6,000 most popular share lines
// (type STOCK: shares, ADRs, REITs, partnership units, preferreds,
// closed-end funds) of the whole US exchange book of the day
// (../wellstrade/usBook.mjs) listed on the NYSE or Nasdaq (MIC XNYS,
// XNAS), ranked by average daily traded value in dollars (30-day average
// volume x last close, ../wellstrade/usPopular.mjs). The sentence names
// shares and ADRs only and no page offers ETFs (they appear only in the
// fee form's definitions of the SEC and TAF fees), so ETFs and ETNs stay
// out. Left out before the ranking, as in the other US catalogues:
// halted lines, warrants, rights, units, when-issued lines, listed notes
// (usBook) and bonds (withoutObligations). One NBBO market: one row per
// title, on its primary listing, in dollars.
//
//   https://tacirler.com.tr/rally-ile-abd-borsalari
//   https://tacirler.com.tr/rally-hakkinda-sikca-sorulan-sorular
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://tacirler.com.tr/hesap-turleri-ve-komisyonlar (BIST scale
// above; US internet orders "ABD NYSE, NASDAQ 750 + 0.20% 0- 750 1.50
// USD").
//
//   node brokers/tacirleryatrm/tacirleryatrm_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const US_VENUES = new Set(["XNYS", "XNAS"]);
const US_COUNT = 6000;
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

await evidence("https://tacirler.com.tr/hesap-turleri-ve-komisyonlar", [/0-500,000 0\.001 \(Binde 1,00\)/, /ABD NYSE, NASDAQ 750 \+ 0\.20%/]);
await pause();
await evidence("https://tacirler.com.tr/rally-hakkinda-sikca-sorulan-sorular", [
  /NYSE ve NASDAQ.ta işlem gören yaklaşık 6\.000.den fazla\s+şirketin hisse senedi ve Amerikan depo sertifikalarında/,
]);

const bist = await bistBook();
for (const row of bist.rows) if (row.isin) row.query = row.isin;
const us = await usBook();
const named = withoutObligations(us.filter((row) => US_VENUES.has(row.mic) && row.type === "STOCK"));
const top = await topN(named, US_COUNT, { types: ["STOCK"] });
if (top.length !== US_COUNT) throw new Error(`only ${top.length} US share lines on the NYSE and Nasdaq`);
const rows = stampRows(withoutObligations([...bist.rows, ...top]));
if (rows.filter((row) => row.mic === "XIST").length < 550) throw new Error("short BIST part");
fs.writeFileSync(new URL("tacirleryatrm-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
const { report } = top;
console.error(`tacirleryatrm: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `US: top ${US_COUNT} of ${report.among} NYSE/Nasdaq share lines; ` +
    `cut-off #${report.cutoff.rank} ${report.cutoff.text}; first left out ${report.firstLeftOut}; kept by size only ${report.keptSizeOnly}, with no data ${report.keptNoData}`
);
console.error(
  `BIST bulletin ${bist.bulletinDate}; dropped ${bist.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
