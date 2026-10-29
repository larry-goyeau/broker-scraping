// Screening data for the US exchange book (../wellstrade/usBook.mjs), for
// the US brokers whose pages exclude titles by price, size, leverage,
// direction or fund fee rather than by list (Cash App Investing, OnePay,
// Axos and the like). Each broker writes its own scraper; this module
// gives it two things.
//
// 1. usQuotes(): one TradingView US scanner call (every NYSE, Nasdaq, NYSE
//    American / Arca and Cboe line) giving, per house ticker, the last
//    close, the market value, the 30-day average traded value in dollars
//    (30-day average volume times the close) and, for funds, the expense
//    ratio in percent. A line the scanner does not carry is absent from the
//    map: a broker test that needs a number then cannot be applied to it,
//    and the scraper says how it treats it.
//
//      https://scanner.tradingview.com/america/scan
//
// 2. Name tests for exchange-traded products, read from the security name
//    of the symbol directories:
//    - leveraged(name): a factor over 1x ("2X", "-3x"), "ProShares Ultra",
//      "UltraPro", or "Leverage(d)" without a 1x factor (the same test as
//      ../capitolcredituni/unifimoneyBook.mjs, imported from there);
//    - inverse(name): "Inverse", "Bear", a -1x factor, or the word "Short"
//      ("UltraShort", "Ultra Short") not followed by a maturity or bond word
//      (Short-Term, Short Duration, Short Treasury, Ultrashort Income, Ultra
//      Short T-Bill... are maturity funds, not funds that short the market)
//      and not part of "Long/Short" (a long-short equity fund).
//
// Use:
//   import { usQuotes, leveraged, inverse } from "../cashapp/usScreen.mjs";
//   const quotes = await usQuotes();   // Map ticker -> { close, cap, value, expense }
//
//   node brokers/cashapp/usScreen.mjs SPY SQQQ   (what the module sees)

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { leveraged } from "../capitolcredituni/unifimoneyBook.mjs";

export { leveraged };

const SCAN = "https://scanner.tradingview.com/america/scan";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// What follows "Short" in the name of a maturity fund.
const MATURITY = /^[\s-]*(?:Term|Duration|Maturity|Dated|Horizon|Treasury|T-Bill|Bond|Muni|Municipal|Corporate|Income|Fixed|Tax-Free|Investment|Real Return|TIPS|Government|Inflation|U\.?S\.?|Strategies Income|High Quality|Credit|Bills?|Option Income|High Yield Muni)\b/i;

export function inverse(name) {
  const text = String(name || "");
  if (/\bInverse\b|\bBear\b|(?:^|[\s(])-\s?1(?:\.0+)?\s*x\b/i.test(text)) return true;
  // "Short" (also "UltraShort", "Ultra-Short") not after "Long/" or "Long-"
  // and not followed by a maturity or bond word.
  for (const match of text.matchAll(/\b(?:Ultra[- ]?)?Short\b/gi)) {
    if (/Long\s*[/-]?\s*$/i.test(text.slice(0, match.index))) continue;
    if (!MATURITY.test(text.slice(match.index + match[0].length))) return true;
  }
  return false;
}

// TradingView spells a preferred HIG/PG; the house ticker is HIG.PRG.
function houseTicker(name) {
  return String(name || "")
    .trim()
    .toUpperCase()
    .replace(/\/P([A-Z]?)$/, ".PR$1");
}

export async function usQuotes() {
  const body = {
    filter: [{ left: "exchange", operation: "in_range", right: ["NYSE", "NASDAQ", "AMEX", "CBOE"] }],
    columns: ["name", "exchange", "close", "average_volume_30d_calc", "market_cap_basic", "expense_ratio"],
    range: [0, 30000],
  };
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(SCAN, {
        method: "POST",
        headers: { "User-Agent": UA, Origin: "https://www.tradingview.com", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`TradingView US scan answered ${response.status}`);
      const json = await response.json();
      if (!Array.isArray(json.data) || json.data.length !== json.totalCount) throw new Error("TradingView US scan came back cut");
      if (json.data.length < 9000) throw new Error(`TradingView US scan has only ${json.data.length} lines`);
      const map = new Map();
      for (const { d } of json.data) {
        const [name, exchange, close, volume, cap, expense] = d;
        const ticker = houseTicker(name);
        const quote = {
          exchange,
          close: Number(close) > 0 ? Number(close) : 0,
          cap: Number(cap) > 0 ? Number(cap) : 0,
          value: Number(close) > 0 && Number(volume) > 0 ? Number(close) * Number(volume) : 0,
          expense: expense === null || expense === undefined || expense === "" ? null : Number(expense),
        };
        const old = map.get(ticker);
        if (!old || quote.value > old.value) map.set(ticker, quote);
      }
      return map;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// The quote of a book row (BRK.B is "BRK.B" on the scanner, some lines are
// spelled with a space).
export function quoteOf(quotes, row) {
  return quotes.get(row.ticker) || quotes.get(String(row.ticker).replace(/\./g, " ")) || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const quotes = await usQuotes();
  console.log(`${quotes.size} lines`);
  for (const ticker of process.argv.slice(2)) console.log(ticker, quotes.get(ticker));
  for (const name of ["ProShares UltraShort QQQ", "iShares Short Treasury Bond ETF", "Vanguard Short-Term Bond ETF", "ProShares Short S&P500", "JPMorgan Ultra-Short Income ETF", "Direxion Daily S&P 500 Bear 1X Shares", "PIMCO Enhanced Short Maturity Active ETF", "Tuttle Capital Short Innovation ETF"]) {
    console.log(inverse(name) ? "inverse " : "        ", name);
  }
}
