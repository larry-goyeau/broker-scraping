// Two readings of the US exchange book (../wellstrade/usBook.mjs) for a
// broker that sells US shares and ETFs with no list of its own.
//
// Named venues. A broker whose pages name only "NYSE and Nasdaq" keeps the
// titles listed there. "NYSE" is read as the markets that carry the NYSE
// name: NYSE (XNYS), NYSE American (XASE), NYSE Arca (ARCX, where almost
// every US ETF lists, SPY among them) and NYSE Texas (XCHI); "Nasdaq" is
// XNAS. Cboe BZX, the Texas Stock Exchange and IEX listings are left out.
// The US stays one NBBO market: one row per title, on its listing market.
//
// Stated count. A broker that gives a number ("5,000+ stocks and ETFs") and
// no list keeps the N most popular titles of the place: the rows are
// ranked by their average daily traded value over the last 30 sessions
// (30-day average volume times the last close) on TradingView's US
// scanner, which carries every NYSE, Nasdaq, NYSE American / Arca and Cboe
// line; a line the scanner gives no volume is ranked after them by market
// value. A line the scanner does not carry at all is ranked last.
//
//   https://scanner.tradingview.com/america/scan
//
// Use:
//   import { NYSE_NASDAQ, usTop } from "../tfcapital/usTop.mjs";
//   const listed = book.filter((row) => NYSE_NASDAQ.has(row.mic));
//   const top = await usTop(listed, 5000);   // top.report: the ranking
//
//   node brokers/tfcapital/usTop.mjs        (the top 20 of the whole book)

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const NYSE_NASDAQ = new Set(["XNYS", "XASE", "ARCX", "XCHI", "XNAS"]);

const SCAN = "https://scanner.tradingview.com/america/scan";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// TradingView's preferred spelling HIG/PG is the house HIG.PRG.
function houseTicker(name) {
  return String(name || "")
    .trim()
    .toUpperCase()
    .replace(/\/P([A-Z]?)$/, ".PR$1");
}

// Ticker -> { value, cap, exchange } for every US exchange line.
export async function usActivity() {
  const body = {
    filter: [{ left: "exchange", operation: "in_range", right: ["NYSE", "NASDAQ", "AMEX", "CBOE"] }],
    columns: ["name", "exchange", "close", "average_volume_30d_calc", "market_cap_basic"],
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
        const [name, exchange, close, volume, cap] = d;
        const ticker = houseTicker(name);
        const value = Number(close) > 0 && Number(volume) > 0 ? Number(close) * Number(volume) : 0;
        const old = map.get(ticker);
        if (!old || value > old.value) map.set(ticker, { value, cap: Number(cap) > 0 ? Number(cap) : 0, exchange });
      }
      return map;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// The N most popular rows, in ranking order; .report says how they ranked.
export async function usTop(rows, n) {
  const activity = await usActivity();
  const scored = rows.map((row) => {
    const hit = activity.get(row.ticker) || activity.get(row.ticker.replace(/\./g, " ")) || null;
    return { row, value: hit?.value || 0, cap: hit?.cap || 0, seen: Boolean(hit) };
  });
  const rank = (item) => (item.value > 0 ? 0 : item.cap > 0 ? 1 : item.seen ? 2 : 3);
  scored.sort((a, b) => rank(a) - rank(b) || b.value - a.value || b.cap - a.cap || a.row.ticker.localeCompare(b.row.ticker));
  const top = scored.slice(0, n);
  const out = top.map((item) => item.row);
  const lastKept = top[top.length - 1];
  out.report = {
    candidates: rows.length,
    kept: out.length,
    byValue: top.filter((item) => rank(item) === 0).length,
    byCap: top.filter((item) => rank(item) === 1).length,
    unranked: top.filter((item) => rank(item) > 1).length,
    notOnScanner: scored.filter((item) => !item.seen).length,
    cutoff: lastKept ? `${lastKept.row.ticker} ${Math.round(lastKept.value).toLocaleString("en-US")} USD a day` : "",
  };
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { usBook } = await import("../wellstrade/usBook.mjs");
  const book = await usBook();
  const top = await usTop(book.filter((row) => NYSE_NASDAQ.has(row.mic)), 20);
  console.log(top.map((row) => `${row.ticker} ${row.mic} ${row.type}`).join("\n"));
  console.log(top.report);
}
