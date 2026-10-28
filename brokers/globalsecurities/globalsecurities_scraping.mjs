// What Global Securities Company (GSC, Ramallah, a subsidiary of Palestine
// Investment Bank) sells in shares and ETFs, with no login. It publishes no
// list of titles: its pages name the places and the kinds of instrument,
// and a commission for each place. So each place is that exchange's whole
// book of shares and ETFs open to trade, read by the shared helpers.
//
//   Local market accounts: "Global Securities Company opens trading
//   accounts on the Palestine Exchange for direct investment in listed
//   companies", through the Shamel eTrade platform, "Trading currency JOD
//   or USD, depending on the share".
//   Global market accounts (GTN platform, web and mobile): "Markets
//   available Amman Stock Exchange Saudi Exchange (Tadawul) Qatar Stock
//   Exchange Dubai Financial Market Abu Dhabi Securities Exchange US
//   markets" and "The instruments available in these markets are
//   equities, bonds and exchange-traded funds (ETFs), subject to
//   availability in each market and what the platform offers."
//   Fees: Palestine Exchange "Total 0.72% of trade value"; Amman 0.65%;
//   Tadawul 0.55%; Qatar 0.55%, minimum QAR 50; DFM 0.55% + AED 10.5 per
//   trade; ADX 0.55%; "US markets": under $1 0.4% of trade value, $1 to
//   $9.99 $0.01 a share, $10 and above $0.02 a share, minimum $25.
//
//   https://gsc.ps/en/content/accounts/حسابات-السوق-المحلي.html
//   https://gsc.ps/en/content/accounts/حسابات-الأسواق-العالمية.html
//   https://gsc.ps/en/content/trading/الرسوم-والعمولات.html
//   https://gsc.ps/en/content/market-and-tools/الأدوات.html
//
// Places and books:
//   Palestine Exchange  ./pexBook.mjs: every active first- and second-
//                       market share, in its own currency (USD or JOD);
//                       suspended and halted lines left out.
//   Amman               ../unitedarabjordan/ammanBook.mjs: every listed ASE
//                       share open to trade (JOD); the ASE lists no ETF.
//   Tadawul             ../investsky/tadawulBook.mjs: Main Market shares
//                       and REITs, and ETFs (SAR), suspended lines out. The
//                       Nomu parallel market is not added: GSC names
//                       "Saudi Exchange (Tadawul)" only, and Nomu is open to
//                       qualified investors alone.
//   Qatar               ./qseBook.mjs: main and venture market shares and
//                       the two ETFs (QAR); bonds and suspended lines out.
//   DFM, ADX            ../alwathbah/uaeBook.mjs: shares, REITs and ETFs of
//                       each (AED); Nasdaq Dubai, which GSC does not name,
//                       is left out.
//   United States       ../wellstrade/usBook.mjs: the whole US exchange
//                       book, one row per title on its primary listing.
//                       The markets table labels the US line "New York
//                       Stock Exchange", but the account, instruments and
//                       fee pages say "US markets", plural: the owner's
//                       rule keeps the country's exchanges when a broker
//                       does not limit itself to the one it names. No page
//                       excludes a kind of US line (OTC lines are not in
//                       the book anyway).
// broker-list.json gives the same places (it names NYSE and Nasdaq for the
// US). No page states a number of titles, so no place is cut to a top N.
// Bonds are sold but left out (withoutObligations, and the helpers).
//
//   node brokers/globalsecurities/globalsecurities_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ammanBook } from "../unitedarabjordan/ammanBook.mjs";
import { adxListings, dfmListings } from "../alwathbah/uaeBook.mjs";
import { tadawulBook } from "../investsky/tadawulBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { pexBook } from "./pexBook.mjs";
import { qseBook } from "./qseBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const page = (path) => `https://gsc.ps/en/content/${path.split("/").map(encodeURIComponent).join("/")}`;
const EVIDENCE = [
  [page("accounts/حسابات-السوق-المحلي.html"), [/opens trading accounts on the Palestine Exchange for direct investment in listed companies/]],
  [
    page("accounts/حسابات-الأسواق-العالمية.html"),
    [
      /Markets available Amman Stock Exchange Saudi Exchange \(Tadawul\) Qatar Stock Exchange Dubai Financial Market Abu Dhabi Securities Exchange US markets/,
      /instruments available in these markets are equities, bonds and exchange-traded funds \(ETFs\)/,
    ],
  ],
  [
    page("trading/الرسوم-والعمولات.html"),
    [/Total 0\.72% of trade value/, /Saudi Exchange \(Tadawul\) 0\.55% of trade value/, /\$10 and above \$0\.02 per share \$25/, /US markets/],
  ],
];
const FLOOR = {
  "Palestine Exchange STOCK": 35,
  "Amman Stock Exchange STOCK": 130,
  "Tadawul STOCK": 240,
  "Tadawul ETF": 10,
  "Qatar Stock Exchange STOCK": 45,
  "DFM STOCK": 55,
  "ADX STOCK": 80,
  "ADX ETF": 10,
};
const US_FLOOR = 10_000;

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return textOf(await response.text());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

for (const [url, patterns] of EVIDENCE) {
  const text = await getText(url);
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${decodeURIComponent(url)} no longer says ${pattern}`);
  if (/\bNomu\b|parallel market/i.test(text)) console.error(`${decodeURIComponent(url)} now names Nomu: consider adding it`);
}

const pex = await pexBook();
const amman = await ammanBook();
const tadawul = await tadawulBook();
const qse = await qseBook();
const [dfm, adx] = await Promise.all([dfmListings(), adxListings()]);
const us = await usBook();

const rows = [...pex.rows, ...amman.rows, ...tadawul.rows, ...qse.rows, ...dfm.rows, ...adx.rows, ...us];
const kept = stampRows(withoutObligations(rows));

const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, floor] of Object.entries(FLOOR)) if ((count[key] || 0) < floor) throw new Error(`only ${count[key] || 0} ${key} rows`);
const usRows = kept.filter((row) => row.currency === "USD" && !row.exchange.startsWith("Palestine")).length;
if (usRows < US_FLOOR) throw new Error(`only ${usRows} US rows`);
fs.writeFileSync(new URL("globalsecurities-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const skipped = (leftOut) => Object.entries(leftOut).map(([label, value]) => `${value} ${label}`).join(", ");
console.error(`globalsecurities: ${kept.length} rows`);
console.table(count);
console.error(`left out: PEX ${pex.leftOut.join("; ") || "none"}`);
console.error(`  Amman ${amman.suspended.length} suspended${amman.leftOut.length ? `, ${amman.leftOut.join(", ")}` : ""}`);
console.error(`  Tadawul ${tadawul.suspended.join("; ") || "none"} (session ${tadawul.session})`);
console.error(`  QSE ${[...qse.leftOut].map(([label, value]) => `${value} ${label}`).join(", ")}`);
console.error(`  DFM ${skipped(dfm.leftOut)}; ADX ${skipped(adx.leftOut)}`);
console.error(`  US ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}; ${rows.length - kept.length} bonds`);
