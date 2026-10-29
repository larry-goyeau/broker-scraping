// What Ajiad Securities (Amman, a Jordan Securities Commission-licensed
// broker) sells online in shares and ETFs, with no login. It publishes no
// list of titles: its pages name the markets and their platforms, so each
// place is that exchange's whole book of shares and ETFs open to trade,
// read by the shared helpers.
//
// Online channels, on its Amman Stock Exchange page: "التداول الالكتروني:
// توفر الشركة خدمة التداول الالكتروني لكل من: ... سوق الأسهم الاقليمية
// والعالمية والخيارات – منصة GTN بورصة عمّان ManafSoft" (online trading on
// the regional and global stock markets through GTN, and on the ASE
// through ManafSoft). Its regional and global markets page names the
// markets: "حيث توفر الشركة امكانية التداول في الاسواق المالية العربية
// والأمريكية وهي: فلسطين، الامارات (وتشمل سوق دبي المالي وسوق ابو ظبي
// للاوراق المالية وسوق ناسداك دبي) السوق السعودية (تداول، نمو)، بورصة قطر،
// سوق الكويت، بورصة مسقط (سلطنة عمان)، بورصة البحرين، سوق مصر، أسواق الأسهم
// الأوروبية، وأسواق الأسهم الامريكية".
//
//   https://ajiadsecurities.com/التداول-في-سوق-عمّان-المالي-من-خلال/
//   https://ajiadsecurities.com/التداول-في-اسواق-الاسهم-الاقليمية-وال/
//
// Places and books (broker-list.json gives Ajiad the Amman Stock Exchange
// only; its own pages add the regional and US markets below):
//   Amman             ../unitedarabjordan/ammanBook.mjs: every listed ASE
//                     share open to trade (JOD); the ASE lists no ETF.
//   Palestine         ../globalsecurities/pexBook.mjs: active first- and
//                     second-market shares (USD or JOD).
//   DFM, ADX,         ../alwathbah/uaeBook.mjs: shares, REITs and ETFs of
//   Nasdaq Dubai      DFM and ADX (AED), and the Nasdaq Dubai shares and
//                     ETPs.
//   Tadawul, Nomu     ../investsky/tadawulBook.mjs (Main Market shares,
//                     REITs, ETFs) and ../adibsec/nomuBook.mjs (Nomu, named
//                     by Ajiad; for qualified investors only, a Capital
//                     Market Authority rule, written as a remark), SAR,
//                     suspended lines out.
//   Qatar             ../globalsecurities/qseBook.mjs: main and venture
//                     market shares and the ETFs (QAR).
//   Kuwait            ../kfic/boursaKuwaitBook.mjs: Premier and Main
//                     Market shares, and the REIT (Ajiad names the market,
//                     not a board), suspended lines out (KWD).
//   Muscat            ./msxBook.mjs: Regular, Parallel, Under-Monitoring,
//                     AIM shares and the listed funds market (OMR),
//                     suspended lines out.
//   Bahrain           ../alwatani/bahrainBook.mjs: listed shares open to
//                     trade (BHD or USD).
//   Egypt             ../rowad/egxboard.mjs on a public TEA Computers
//                     e-trade ticker (alrowadonline.com), which quotes
//                     every EGX line of the trading system: shares and the
//                     index ETF (EGP); funds, rights and sukuk out.
//   United States     ../wellstrade/usBook.mjs: no US exchange is named
//                     ("أسواق الأسهم الامريكية", plural), so the whole US
//                     exchange book, one row per title on its primary
//                     listing (USD). OTC is not named and not added.
// Left out: "أسواق الأسهم الأوروبية" (European stock markets) names no
// exchange or country, and the commission card prices only "Europe CHIX"
// and the LSE, so no European place can be built from Ajiad's words. The
// card also prices Turkey, Hong Kong, Tokyo and Singapore, but the online
// markets page does not name them. Bonds, sukuk and mutual funds are sold
// but are not shares or ETFs (withoutObligations, and the helpers). No page
// states a number of titles.
//
// Fees: Amman, the licences page: "تقوم الشركة باعمال الوساطه المالية
// شراءاً وبيعاً بالعموله المقررة من بورصة عمان" (the commission set by the
// ASE, a statutory range). The other markets: the "Regional &
// International Markets Commissions Card" (PDF): DFM/ADX/Nasdaq Dubai and
// Tadawul 0.0045, QE 0.0045 (min QR 60), EGX 0.0055, MSM 0.006 (min OR 10),
// BHB 0.006, PEX 0.008272, KSE 0.0035 (min KWD 20); US $0-9.99 "Deal Value
// * 0.0035", $10-99.99 3.5 cents a share, $100+ 10 cents a share, plus $15
// a deal.
//   https://ajiadsecurities.com/التراخيص/
//   https://ajiadsecurities.com/wp-content/uploads/2024/07/Ajiad-Securities-Commission-Card-202.pdf
//
//   node brokers/ajiad/ajiad_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { nomuBook } from "../adibsec/nomuBook.mjs";
import { bahrainBook } from "../alwatani/bahrainBook.mjs";
import { adxListings, dfmListings, nasdaqDubaiListings } from "../alwathbah/uaeBook.mjs";
import { pexBook } from "../globalsecurities/pexBook.mjs";
import { qseBook } from "../globalsecurities/qseBook.mjs";
import { tadawulBook } from "../investsky/tadawulBook.mjs";
import { boursaKuwaitBook } from "../kfic/boursaKuwaitBook.mjs";
import { finish, tickerBoard } from "../rowad/egxboard.mjs";
import { ammanBook } from "../unitedarabjordan/ammanBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { msxBook } from "./msxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const page = (slug) => `https://ajiadsecurities.com/${encodeURIComponent(slug)}/`;
const CARD = "https://ajiadsecurities.com/wp-content/uploads/2024/07/Ajiad-Securities-Commission-Card-202.pdf";
const EGX_BOARD = "https://alrowadonline.com/NewLogin.aspx";
const NOMU_REMARK = "Nomu is for qualified investors only.";
const EVIDENCE = [
  [page("التداول-في-سوق-عمّان-المالي-من-خلال"), [/التداول الالكتروني/, /منصة GTN/, /بورصة عمّان ManafSoft/]],
  [
    page("التداول-في-اسواق-الاسهم-الاقليمية-وال"),
    [
      /فلسطين، الامارات \(وتشمل سوق دبي المالي وسوق ابو ظبي للاوراق المالية وسوق ناسداك دبي\) السوق السعودية \(تداول، نمو\)، بورصة قطر، سوق الكويت، بورصة مسقط \(سلطنة عمان\)، بورصة البحرين، سوق مصر، أسواق الأسهم الأوروبية، وأسواق الأسهم الامريكية/,
    ],
  ],
  [page("التراخيص"), [/بالعموله المقررة من بورصة عمان/]],
];
const FLOOR = {
  "Amman Stock Exchange STOCK": 130,
  "Palestine Exchange STOCK": 35,
  "DFM STOCK": 50,
  "ADX STOCK": 80,
  "Nasdaq Dubai STOCK": 4,
  "Tadawul STOCK": 240,
  "Nomu STOCK": 70,
  "Qatar Stock Exchange STOCK": 45,
  "Boursa Kuwait STOCK": 120,
  "Muscat Stock Exchange STOCK": 90,
  "Bahrain Bourse STOCK": 30,
  "EGX STOCK": 200,
};
const US_FLOOR = 10_000;

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

// The pages still say what the header quotes, or the run stops.
for (const [url, patterns] of EVIDENCE) {
  const text = textOf(await (await get(url)).text());
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${decodeURIComponent(url)} no longer says ${pattern}`);
}
const card = Buffer.from(await (await get(CARD)).arrayBuffer());
if (card.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${CARD} is no longer a PDF`);

// Nomu lines carry no ISIN; the asset list files Saudi lines as TADAWUL:<code>.
function saudiIsins() {
  const found = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split("\n")) {
    const [key, place, isin] = line.split(",");
    if (place === "TADAWUL" && /^SA[A-Z0-9]{10}$/.test(isin || "")) found.set(key.split(":")[1], isin);
  }
  return found;
}

const amman = await ammanBook();
const pex = await pexBook();
const [dfm, adx, nasdaqDubai] = [await dfmListings(), await adxListings(), await nasdaqDubaiListings()];
const tadawul = await tadawulBook();
const nomu = await nomuBook();
const qse = await qseBook();
const kuwait = await boursaKuwaitBook({ reits: true });
const msx = await msxBook();
const bahrain = await bahrainBook();
const egx = finish(await tickerBoard(EGX_BOARD), "EGX (TEA ticker)");
const us = await usBook();

const isins = saudiIsins();
const nomuRows = [];
for (const [symbol, line] of nomu.lines) {
  if (nomu.suspended.has(symbol) || tadawul.rows.some((row) => row.ticker === symbol)) continue;
  const isin = isins.get(symbol) || "";
  nomuRows.push({
    query: isin || symbol,
    ticker: symbol,
    name: line.name,
    exchange: "Nomu",
    mic: "XSAU",
    currency: "SAR",
    type: "STOCK",
    isin,
    remark: NOMU_REMARK,
    raw: [symbol, line.name, line.sector === "REITs" ? "REIT" : line.sector, "Nomu", "SAR", isin].filter(Boolean).join(" | "),
  });
}

const rows = [
  ...amman.rows,
  ...pex.rows,
  ...dfm.rows,
  ...adx.rows,
  ...nasdaqDubai.rows,
  ...tadawul.rows,
  ...nomuRows,
  ...qse.rows,
  ...kuwait.rows,
  ...msx.rows,
  ...bahrain.rows,
  ...egx,
  ...us,
];
const kept = stampRows(withoutObligations(rows));
const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, floor] of Object.entries(FLOOR)) if ((count[key] || 0) < floor) throw new Error(`only ${count[key] || 0} ${key} rows`);
if (us.length < US_FLOOR) throw new Error(`only ${us.length} US rows`);
fs.writeFileSync(new URL("ajiad-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(`ajiad: ${kept.length} rows (US book ${us.length})`);
console.table(count);
console.error(`left out: Amman ${amman.suspended.length} suspended; PEX ${pex.leftOut.join("; ") || "none"}`);
console.error(`  Tadawul ${tadawul.suspended.join("; ") || "none"}; Nomu ${[...nomu.suspended.values()].join("; ") || "none"}`);
console.error(`  Kuwait ${kuwait.suspended.length} suspended; MSX ${msx.leftOut.join("; ") || "none"}; Bahrain ${JSON.stringify(bahrain.leftOut)}`);
console.error(`  US ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}; ${rows.length - kept.length} bonds`);
