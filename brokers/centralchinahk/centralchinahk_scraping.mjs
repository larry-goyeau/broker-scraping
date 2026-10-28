// What Central China International (中州國際金融控股, Hong Kong; the Hong
// Kong arm of Central China Securities) sells in shares and ETFs, with no
// login: Hong Kong securities, Shanghai and Shenzhen A-shares through
// Northbound Stock Connect, and US stocks. Its fee page (收費標準) prices
// each and it publishes no list of titles.
//
// Fees, quoted as starting rates ("起"): "網絡/手機應用程序：交易金額之0.1%起",
// "最低收費：港幣30元起"; 滬股通 and 深股通 "成交金額之0.2%起(最低收費人民幣80
// 元)", with a note on ETF levies; 美股 "每宗成交之0.2%起(最低收費20美元)".
//
// Hong Kong is HKEX's whole book of shares, REITs and ETPs
// (../primehk/hkexBook.mjs; HKD, USD and RMB counters as their own codes;
// the fee page converts charges on "其他貨幣計價證券"). Stock Connect is
// HKEX's Northbound buy-and-sell lists (../bocomhk/connectBook.mjs; the
// Stock Connect page sends clients to HKEX's eligible list: "有關合資格股票
// 名單，請參閱 香港交易所網頁"); STAR Market and ChiNext shares stay with a
// remark (Stock Connect rule: institutional professional investors only).
// The US is the exchange book of the day (../wellstrade/usBook.mjs): no
// page names a US exchange or a kind of share or fund it does not sell,
// less the exception the fee page names:
//   "由2015年6月22日起，將不再接受低於5000萬美元的市值和每股價格低於0.50美元
//   的美國股票買入服務。上述有關股份之賣出指令將不受影響。"
// Read as two floors: a US line whose market value is under US$50 million
// (shares only; the screener gives funds none) or whose last sale is under
// US$0.50 is left out. Both come from Nasdaq's public stock and ETF
// screeners; a line the screeners do not carry stays.
//   https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true
//   https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true
//
// Client-dependent, so not a removal: the home page notice "自2026年10月26日起，
// 本公司將暫停 “內地投資者” 在內地的買入及資金轉入服務; 賣出及資金轉出則維持正常",
// and the Stock Connect page: Northbound trading is for "非內地投資者". The
// broker's client countries (accepted.mjs: HK only) already keep mainland-
// China investors off its lines, so no row carries the notice (owner,
// 2026-10-27).
//
//   https://www.ccnew.com.hk/tc/home
//   https://www.ccnew.com.hk/tc/brokerage/ah
//
// Fees: https://www.ccnew.com.hk/tc/brokerage/fee
//
//   node brokers/centralchinahk/centralchinahk_scraping.mjs

import { houseTicker } from "../wellstrade/usBook.mjs";
import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SCREENERS = [
  ["stocks", "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true", 5000],
  ["etf", "https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true", 3000],
];
const CAP_FLOOR = 50_000_000;
const PRICE_FLOOR = 0.5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const money = (value) => Number(String(value ?? "").replace(/[$,\s]/g, ""));

await evidence("https://www.ccnew.com.hk/tc/brokerage/fee", [
  /網絡\/手機應用程序：交易金額之0\.1%起/,
  /滬股通 - 滬港通北向交易/,
  /深股通 - 深港通北向交易/,
  /美股交易服務 經紀佣金 每宗成交之0\.2%起\(最低收費20美元\)/,
  /將不再接受低於5000萬美元的市值和每股價格低於0\.50美元的美國股票買入服務/,
]);
await evidence("https://www.ccnew.com.hk/tc/home", [/自2026年10月26日起, 本公司將暫停 “內地投資者” 在內地的買入及資金轉入服務/]);

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// House ticker -> { price, cap } from both screeners (BRK/B is BRK.B, ABR^D is ABR.PRD).
async function screen() {
  const quotes = new Map();
  for (const [label, url, least] of SCREENERS) {
    const body = await getJson(url);
    const list = body?.data?.rows || body?.data?.data?.rows;
    if (!Array.isArray(list) || list.length < least) throw new Error(`Nasdaq ${label} screener: ${Array.isArray(list) ? list.length : "no"} rows`);
    for (const item of list) {
      if (!item.symbol) continue;
      const ticker = houseTicker(String(item.symbol).trim().toUpperCase().replace(/\//g, ".").replace(/\^/g, "$"));
      const price = money(item.lastsale ?? item.lastSalePrice);
      const cap = label === "stocks" ? money(item.marketCap) : NaN;
      quotes.set(ticker, { price: price > 0 ? price : null, cap: cap > 0 ? cap : null });
    }
    await sleep(2000);
  }
  for (const [ticker, low, high] of [["AAPL", 20, 2000], ["SPY", 100, 2000]]) {
    const price = quotes.get(ticker)?.price;
    if (!(price > low && price < high)) throw new Error(`Nasdaq screener prices ${ticker} at ${price}`);
  }
  return quotes;
}

async function floors(rows) {
  const quotes = await screen();
  const left = { "US market value under US$50 million": [], "US last sale under US$0.50": [] };
  const kept = rows.filter((row) => {
    const quote = quotes.get(row.ticker);
    if (!quote) return true;
    if (quote.price != null && quote.price < PRICE_FLOOR) { left["US last sale under US$0.50"].push(`${row.mic}:${row.ticker}`); return false; }
    if (row.type === "STOCK" && quote.cap != null && quote.cap < CAP_FLOOR) { left["US market value under US$50 million"].push(`${row.mic}:${row.ticker}`); return false; }
    return true;
  });
  console.error(`  ${rows.filter((row) => quotes.has(row.ticker)).length} of ${rows.length} US lines carried by the Nasdaq screeners`);
  return { kept, left };
}

await hkCatalogue({
  folder: "centralchinahk",
  connect: { STAR: "remark", ChiNext: "remark" },
  us: { mics: null, filter: floors },
  least: { HKEX: 2500, connect: 3500, US: 9000 },
});
