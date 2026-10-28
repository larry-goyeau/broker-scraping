// How much each line of the US exchange book (./usBook.mjs) trades, for the
// owner rule "a broker that states it offers N titles on a place gets the
// N most popular titles of that place": on the US place the N lines kept
// are the N with the highest average daily traded value in dollars.
//
// Popularity is the average daily traded value in dollars, the usual
// measure of how much a title is traded: the 30-day average daily volume x
// the last close. Both come from TradingView's public stock screener
// endpoint (the one https://www.tradingview.com/screener/ calls; no login,
// one POST for the whole US market, about 12,500 exchange lines and 7,700
// OTC lines, OTC dropped):
//
//   POST https://scanner.tradingview.com/america/scan
//   {"columns":["name","exchange","type","subtype","close","volume","Value.Traded",
//     "average_volume_10d_calc","average_volume_30d_calc","market_cap_basic","aum"],
//    "filter":[{"left":"exchange","operation":"in_range","right":["NASDAQ","NYSE","AMEX","CBOE"]}],
//    "range":[0,30000]}
//
// Exchanges there: NASDAQ, NYSE, AMEX (NYSE American and NYSE Arca: SPY is
// AMEX:SPY) and CBOE (Cboe BZX); Texas Stock Exchange lines show under
// their other listing. The volume is the consolidated one, all US venues
// (SPY 33,423,223 shares on 23 October 2026, the tape figure Nasdaq
// prints). Symbols: BRK.B as in the house, ABR/PD is the house ABR.PRD and
// a bare NLY/P is NLY.PR. It holds ETFs, ETNs and commodity trusts (type
// fund) as well as shares, ADRs, preferreds and closed-end funds.
// Checked against Nasdaq's per-day table (close x volume over the last 20
// trading days, https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=stocks):
// AAPL $13.5bn a day here for $13.1bn, SPY $32.9bn for $31.2bn. That table
// is exact but takes one request per line, and Nasdaq's bot wall shuts the
// whole nasdaq.com (403) after about 2,000 of them, so it is not used.
// The Nasdaq ETF screener (https://api.nasdaq.com/api/screener/etf) prints
// no volume and is not used either.
//
// Fallbacks, in this order, for a line with no 30-day average volume:
//   1. the 10-day average volume x last close (a line listed less than
//      30 days ago);
//   2. the latest day's traded value (TradingView "Value.Traded", close x
//      volume), else the Nasdaq stock screener's lastsale x volume, one
//      download of about 7,000 shares and preferreds, read only when it
//      answers (it adds a few shares TradingView does not list):
//        https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true
//   3. size, ranked after every line with a traded value: market cap for a
//      share (TradingView, else the Nasdaq screener), net assets ("aum")
//      for an ETF or ETN, else the other one;
//   4. nothing: ranked last (16 lines of the book on 25 October 2026, such
//      as the JPMorgan bond ETFs JCPB and JPLD, which TradingView does not
//      list).
//
// Cache: usPopular-cache.json next to this module, the two downloads with
// their time; older than a day they are fetched again (a failing Nasdaq
// screener keeps its older copy, or none).
//
// Use:
//   import { usPopularity, topN } from "../wellstrade/usPopular.mjs";
//   const popularity = await usPopularity();
//   popularity.get("AAPL");  // { value: 1.35e10, source: "TradingView 30-day average volume x close", basis: "traded" }
//   const kept = await topN(rows, 2000, { types: ["ETF"] });
//   kept.report;             // cut-off line, lines without data, ...
//
// usPopularity() -> Map house ticker -> { value, source, basis } for every
// US exchange line, where basis is "traded" (dollars a day) or "size"
// (dollars of market cap or net assets). A line it does not hold has no
// data.
// topN(rows, n, { types }) -> the n most popular of the book rows of the
// given types (default all), most popular first: traded value, then size,
// then no data, ties by ticker. The rows are returned as they are; the
// array carries `report`.
//
// Run alone for the top 10 shares and ETFs and the 5,000th share and the
// 2,000th ETF of the book:
//   node brokers/wellstrade/usPopular.mjs
//
// Checked 2026-10-25 (data to the 23 October 2026 close).

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { houseTicker, usBook } from "./usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const TRADINGVIEW = "https://scanner.tradingview.com/america/scan";
const COLUMNS = ["name", "exchange", "type", "subtype", "close", "volume", "Value.Traded", "average_volume_10d_calc", "average_volume_30d_calc", "market_cap_basic", "aum"];
const EXCHANGES = ["NASDAQ", "NYSE", "AMEX", "CBOE"];
const NASDAQ_SCREENER = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true";
const CACHE = new URL("usPopular-cache.json", import.meta.url);
const DAY = 24 * 3600 * 1000;
const BASIS_ORDER = { traded: 0, size: 1 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, options) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.json();
      last = `${response.status} ${url}`;
      if (response.status === 403) break;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error(last);
}

// "$1,234.50", "1,234", "N/A", 12.5 -> positive number or null.
function amount(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const clean = String(value ?? "").replace(/[$,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(clean) && Number(clean) > 0 ? Number(clean) : null;
}

// TradingView name -> house ticker: ABR/PD is ABR.PRD, NLY/P is NLY.PR,
// BRK.B stays.
function tradingViewTicker(name) {
  const upper = String(name || "").trim().toUpperCase();
  const preferred = upper.match(/^(.+)\/P([A-Z]?)$/);
  return preferred ? `${preferred[1]}.PR${preferred[2]}` : upper.replace(/\//g, ".");
}

// Nasdaq screener symbol -> house ticker: BRK/B is BRK.B, ABR^D is ABR.PRD.
function screenerTicker(symbol) {
  return houseTicker(String(symbol || "").trim().toUpperCase().replace(/\//g, ".").replace(/\^/g, "$"));
}

// House ticker -> { exchange, type, close, day, avg10, avg30, cap, aum }.
async function tradingView() {
  const body = await request(TRADINGVIEW, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/" },
    body: JSON.stringify({ columns: COLUMNS, filter: [{ left: "exchange", operation: "in_range", right: EXCHANGES }], range: [0, 30000] }),
  });
  const list = body?.data;
  if (!Array.isArray(list) || list.length < 10000 || list.length !== body.totalCount) {
    throw new Error(`TradingView scan: ${Array.isArray(list) ? list.length : "no"} rows of ${body?.totalCount}`);
  }
  const lines = {};
  for (const { d } of list) {
    const field = Object.fromEntries(COLUMNS.map((name, index) => [name, d[index]]));
    const ticker = tradingViewTicker(field.name);
    if (lines[ticker]) throw new Error(`TradingView scan lists ${ticker} twice (${lines[ticker].exchange}, ${field.exchange})`);
    lines[ticker] = {
      exchange: field.exchange,
      type: [field.type, field.subtype].filter(Boolean).join("/"),
      close: amount(field.close),
      day: amount(field["Value.Traded"]),
      avg10: amount(field.average_volume_10d_calc),
      avg30: amount(field.average_volume_30d_calc),
      cap: amount(field.market_cap_basic),
      aum: amount(field.aum),
    };
  }
  for (const [ticker, low] of [["AAPL", 1e9], ["SPY", 1e9], ["BRK.B", 1e8]]) {
    const line = lines[ticker];
    if (!line || !(line.avg30 * line.close > low)) throw new Error(`TradingView scan: ${ticker} trades ${JSON.stringify(line)}`);
  }
  return lines;
}

// House ticker -> { day, cap } from the Nasdaq stock screener.
async function nasdaqScreener() {
  const body = await request(NASDAQ_SCREENER, {
    headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
  });
  const list = body?.data?.rows;
  if (!Array.isArray(list) || list.length < 5000) throw new Error(`Nasdaq stock screener: ${Array.isArray(list) ? list.length : "no"} rows`);
  const lines = {};
  for (const item of list) {
    const price = amount(item.lastsale);
    const volume = amount(item.volume);
    lines[screenerTicker(item.symbol)] = { day: price && volume ? price * volume : null, cap: amount(item.marketCap) };
  }
  return { asOf: body.data.asOf || null, lines };
}

function loadCache() {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (cache && typeof cache === "object") return cache;
  } catch {
    // no cache yet
  }
  return {};
}

function saveCache(cache) {
  const temporary = new URL(`usPopular-cache.json.${process.pid}`, import.meta.url);
  fs.writeFileSync(temporary, JSON.stringify(cache));
  fs.renameSync(temporary, CACHE);
}

const fresh = (entry) => entry && Date.now() - entry.at < DAY;

function popularityOf(line, nasdaq, share) {
  if (line?.close && line.avg30) return { value: line.avg30 * line.close, source: "TradingView 30-day average volume x close", basis: "traded" };
  if (line?.close && line.avg10) return { value: line.avg10 * line.close, source: "TradingView 10-day average volume x close", basis: "traded" };
  if (line?.day) return { value: line.day, source: "TradingView latest-day traded value", basis: "traded" };
  if (nasdaq?.day) return { value: nasdaq.day, source: "Nasdaq stock screener latest-day lastsale x volume", basis: "traded" };
  const cap = line?.cap ? { value: line.cap, source: "TradingView market cap", basis: "size" } : nasdaq?.cap ? { value: nasdaq.cap, source: "Nasdaq stock screener market cap", basis: "size" } : null;
  const aum = line?.aum ? { value: line.aum, source: "TradingView net assets", basis: "size" } : null;
  return (share ? cap || aum : aum || cap) || null;
}

let loading = null;

async function load() {
  const cache = loadCache();
  const notes = [];
  if (!fresh(cache.tradingView)) {
    cache.tradingView = { at: Date.now(), lines: await tradingView() };
    saveCache(cache);
  }
  if (!fresh(cache.nasdaq)) {
    try {
      cache.nasdaq = { at: Date.now(), ...(await nasdaqScreener()) };
      saveCache(cache);
    } catch (error) {
      notes.push(`Nasdaq stock screener not read (${error.message})${cache.nasdaq ? `, copy of ${new Date(cache.nasdaq.at).toISOString()} used` : ""}`);
    }
  }
  return { cache, notes };
}

// Map house ticker -> { value, source, basis } for every US exchange line.
// A share/fund flag cannot be read from the ticker alone, so a line that
// only has a size is valued by TradingView's type: "fund" -> net assets.
export async function usPopularity() {
  loading ||= load().catch((error) => {
    loading = null;
    throw error;
  });
  const { cache, notes } = await loading;
  const tv = cache.tradingView.lines;
  const nasdaq = cache.nasdaq?.lines || {};
  const popularity = new Map();
  for (const ticker of new Set([...Object.keys(tv), ...Object.keys(nasdaq)])) {
    const line = tv[ticker];
    const found = popularityOf(line, nasdaq[ticker], !line || !line.type.startsWith("fund"));
    if (found) popularity.set(ticker, found);
  }
  popularity.sources = {
    tradingView: new Date(cache.tradingView.at).toISOString(),
    nasdaqScreener: cache.nasdaq ? `${new Date(cache.nasdaq.at).toISOString()}${cache.nasdaq.asOf ? ` (as of ${cache.nasdaq.asOf})` : ""}` : "none",
    notes,
  };
  popularity.lines = { tv, nasdaq };
  return popularity;
}

const usd = (value) => (value === null || value === undefined ? "no data" : `$${(value / 1e6).toFixed(value < 1e7 ? 3 : 1)}M`);

// The n most popular of the rows of the given types, most popular first.
export async function topN(rows, n, { types } = {}) {
  const wanted = types ? new Set(types) : null;
  const among = rows.filter((row) => !wanted || wanted.has(row.type));
  const popularity = await usPopularity();
  const { tv, nasdaq } = popularity.lines;
  const none = { value: null, source: "no data", basis: null };
  const ranked = among
    .map((row) => ({
      row,
      // The book's own type decides between market cap and net assets.
      popular: popularityOf(tv[row.ticker], nasdaq[row.ticker], row.type === "STOCK") || none,
    }))
    .sort((left, right) => {
      const leftOrder = BASIS_ORDER[left.popular.basis] ?? 2;
      const rightOrder = BASIS_ORDER[right.popular.basis] ?? 2;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      if (leftOrder < 2 && left.popular.value !== right.popular.value) return right.popular.value - left.popular.value;
      return left.row.ticker < right.row.ticker ? -1 : left.row.ticker > right.row.ticker ? 1 : 0;
    });
  const kept = ranked.slice(0, Math.max(0, n));
  const count = (list, test) => list.filter(({ popular }) => test(popular)).length;
  const describe = (item) => item && `${item.row.ticker} ${usd(item.popular.value)} (${item.popular.source})`;
  const last = kept.at(-1);
  const result = kept.map(({ row }) => row);
  result.report = {
    n,
    types: types || "all",
    among: among.length,
    kept: kept.length,
    cutoff: last ? { rank: kept.length, ticker: last.row.ticker, name: last.row.name, ...last.popular, text: describe(last) } : null,
    firstLeftOut: describe(ranked[kept.length]) || null,
    noData: count(ranked, (popular) => !popular.basis),
    noDataTickers: ranked.filter(({ popular }) => !popular.basis).map(({ row }) => row.ticker),
    sizeOnly: count(ranked, (popular) => popular.basis === "size"),
    latestDayOnly: count(ranked, (popular) => /latest-day/.test(popular.source)),
    keptNoData: count(kept, (popular) => !popular.basis),
    keptSizeOnly: count(kept, (popular) => popular.basis === "size"),
    sources: popularity.sources,
  };
  result.popularity = new Map(kept.map(({ row, popular }) => [row.ticker, popular]));
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const book = await usBook();
  const line = (row, rank, popular) => `${String(rank).padStart(5)}  ${row.ticker.padEnd(8)} ${row.mic.padEnd(5)} ${usd(popular.value).padStart(11)}  ${row.name.slice(0, 55)}`;
  for (const [label, types, deep] of [["shares (STOCK)", ["STOCK"], 5000], ["ETFs (ETF)", ["ETF"], 2000]]) {
    const all = await topN(book, Infinity, { types });
    console.log(`\nTop 10 ${label}:`);
    all.slice(0, 10).forEach((row, index) => console.log(line(row, index + 1, all.popularity.get(row.ticker))));
    const cut = await topN(book, deep, { types });
    const { report } = cut;
    console.log(`#${deep}: ${line(cut.at(-1), deep, cut.popularity.get(cut.at(-1).ticker)).trim()} [${report.cutoff.source}]`);
    console.log(`first left out: ${report.firstLeftOut}`);
    console.log(`${report.among} lines: ${report.noData} with no data (${report.noDataTickers.join(", ")}), ${report.sizeOnly} ranked by size only, ${report.latestDayOnly} by a latest-day value`);
  }
  const { sources } = await usPopularity();
  console.log(`\nTradingView ${sources.tradingView}; Nasdaq screener ${sources.nasdaqScreener}${sources.notes.length ? `; ${sources.notes.join("; ")}` : ""}`);
}
