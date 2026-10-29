// Dime! (KKP Dime Securities, Kiatnakin Phatra Financial Group) is an
// app-only broker with two places for shares and ETFs:
//
// - Stock Exchange of Thailand. The Thai-stocks page prices "Thai stock
//   orders on Dime! application" at 0.15% and names no list and no
//   exception (board, NVDR, DR, ETF), so the place is the whole SET book
//   (../kgithailand/setBook.mjs: both boards, SET and mai, one XBKK book;
//   warrants, rights, foreign-board lines, pre-IPO lines and lines with no
//   trade for more than 30 days left out).
//     https://dime.co.th/en/invest/stock-th
//
// - United States. The US-stocks page: "More than 10,000 Stocks at Your
//   Fingertips. The US stock exchanges ... include ... a variety of assets
//   for you to choose, from common stocks, ADRs, to ETFs (only ETFs in
//   accordance with the SEC's announcement)."
//     https://dime.co.th/en/invest/stock-us
//   So the place starts from the whole US exchange book
//   (../wellstrade/usBook.mjs, one NBBO row per title on its primary
//   listing), keeps the kinds the page names, then the stated count:
//   - common stocks and ADRs (type STOCK) and ETFs; preferred shares and
//     closed-end funds are not named and stay out (usBook options), and so
//     do exchange-traded notes (type ETN) and OTC lines;
//   - "the SEC's announcement" is the Thai SEC's rule on foreign ETFs for
//     retail clients (broker-list: "Only ETFs meeting Thai SEC criteria").
//     The criterion that cuts US ETFs is the one on geared funds: brokers
//     may offer "Leveraged ETFs and Inverse ETFs that reference an index or
//     any sector only" (SEC notification TorNor. 87/2558 as amended by
//     TorNor. 9/2568, quoted in Webull Thailand's FAQ 469,
//     https://www.webull.co.th/en/help/faq/469). So a leveraged or inverse
//     fund on one company (TSLL, NVDU, MSTU, ...) goes; geared index,
//     sector, commodity and crypto funds stay. The company is read from
//     the fund's name (a US share's ticker, or the first word of a US
//     company's name, after Long / Short / Bull / Bear / Daily ...);
//   - "More than 10,000": the owner's stated-count rule keeps the 10,000
//     most popular of those titles, ranked by 30-day traded value on
//     TradingView's US scanner (../tfcapital/usTop.mjs).
//
// Fees: Thai stocks "0.15% of the trading amount" (first trade of each
// month free); US stocks "0.01 USD per share For the stocks priced below
// 6.67 USD or 0.15% of the trading amount For the stocks priced 6.67 USD or
// higher" (same pages). Deposits are in baht and converted by KKP Bank;
// each row keeps its market's currency (THB, USD).
//
//   node brokers/dime/dime_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { setBook } from "../kgithailand/setBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { pageSays } from "../alphasec/pdfSays.mjs";

const US_COUNT = 10_000;

await pageSays("https://dime.co.th/en/invest/stock-th", [
  /Thai stock orders on Dime! application/,
  /0\.15% of the trading amount/,
]);
await pageSays("https://dime.co.th/en/invest/stock-us", [
  /More than 10,000 Stocks/,
  /from common stocks, ADRs, to ETFs \(only ETFs in accordance with the SEC(?:'|&#x27;)s announcement\)/,
  /0\.15% of the trading amount/,
]);

// ---- Stock Exchange of Thailand ------------------------------------------------

const set = await setBook();
const thai = set.rows.filter((row) => ["STOCK", "ETF", "ETC", "FUND"].includes(row.type));
if (thai.length < 1500) throw new Error(`only ${thai.length} SET rows`);

// ---- United States -------------------------------------------------------------

const book = await usBook({ preferreds: false, closedEnd: false });
const LEVERED = /(?:^|[\s(-])-?\d+(?:\.\d+)?x\b|\bultra|\bbull\b|\bbear\b|\binverse\b|\bleveraged\b/i;
const UNDERLYING = [
  /\bdaily target \d+(?:\.\d+)?x (?:long|short|inverse)\s+(.+?)\s+etf\b/i,
  /\b(?:long|short|inverse|bull|bear)\s+(.+?)\s+(?:daily|monthly|weekly)\b/i,
  /\bdirexion daily\s+(.+?)\s+(?:bull|bear)\b/i,
  /\b\d+(?:\.\d+)?x\s+(?:long|short|inverse)\s+(.+?)\s+(?:etf|shares)\b/i,
  /\bproshares ultra(?:pro)?(?:short)?\s+(.+?)(?:\s+etf)?$/i,
];
const NOT_A_COMPANY = new Set(
  ("GOLD SILVER COPPER OIL CRUDE GAS NATURAL CORN WHEAT EURO YEN DOLLAR BITCOIN ETHER ETHEREUM SOLANA XRP " +
    "SEMICONDUCTOR SEMICONDUCTORS TECHNOLOGY TECH FINANCIAL FINANCIALS ENERGY INDUSTRIALS MATERIALS UTILITIES " +
    "HEALTHCARE BIOTECH RETAIL REAL ESTATE HOMEBUILDERS REGIONAL BANKS TREASURY BOND BONDS CHINA INDIA BRAZIL " +
    "MEXICO JAPAN EUROPE KOREA EMERGING MARKETS SMALL MID LARGE CAP DOW NASDAQ RUSSELL MSCI FTSE VIX QQQ SPY " +
    "INNOVATION AEROSPACE DEFENSE CRYPTO AI QUANTUM").split(" ")
);
const shares = book.filter((row) => row.type === "STOCK");
const tickers = new Set(shares.map((row) => row.ticker.toUpperCase()));
const firstWords = new Set(
  shares.map((row) => row.name.split(/[\s,.]+/)[0].toUpperCase()).filter((word) => word.length >= 4)
);
function singleCompany(name) {
  const text = name.replace(/[®™]/g, "");
  if (!LEVERED.test(text)) return "";
  for (const pattern of UNDERLYING) {
    const hit = text.match(pattern);
    if (!hit) continue;
    const under = hit[1].replace(/\s+(?:etf|shares|index|stock)$/i, "").trim();
    if (/\s/.test(under)) return "";
    const up = under.toUpperCase();
    if (NOT_A_COMPANY.has(up)) return "";
    if (tickers.has(up) || (up.length >= 4 && firstWords.has(up))) return up;
    return "";
  }
  return "";
}

const left = { etn: [], singleCompany: [] };
const candidates = [];
for (const row of book) {
  if (row.type === "ETN") { left.etn.push(row.ticker); continue; }
  if (row.type === "ETF") {
    const company = singleCompany(row.name);
    if (company) { left.singleCompany.push(`${row.ticker} (${company})`); continue; }
  }
  candidates.push(row);
}
if (left.singleCompany.length < 50) throw new Error(`only ${left.singleCompany.length} single-company geared funds found`);
const us = await usTop(candidates, US_COUNT);
if (us.length < US_COUNT) throw new Error(`only ${us.length} US titles`);

// ---- write ---------------------------------------------------------------------

const kept = stampRows(withoutObligations([...thai, ...us]));
fs.writeFileSync(new URL("dime-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
const count = (test) => kept.filter(test).length;
console.error(`SET: ${count((row) => row.mic === "XBKK")} lines; ${set.suspended.length} suspended / halted left out`);
console.error(`US: ${count((row) => row.mic !== "XBKK")} of ${candidates.length} titles kept (top ${US_COUNT}, ${JSON.stringify(us.report)})`);
console.error(`US left out: ${left.etn.length} ETNs, ${left.singleCompany.length} single-company geared funds: ${left.singleCompany.join(", ")}`);
console.error(`${kept.length} rows (${["STOCK", "ETF", "ETC", "FUND"].map((type) => `${count((row) => row.type === type)} ${type}`).join(", ")})`);
