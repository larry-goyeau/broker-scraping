// How much each ASX line trades, for the owner rule "a broker that states
// it offers N titles on a place gets the N most popular titles of that
// place" (../selfwealth). The same measure as ../wellstrade/usPopular.mjs
// for the US: the average daily traded value in dollars, here Australian
// dollars, the 30-day average daily volume x the last close, from
// TradingView's public screener endpoint for Australia (no login, one POST
// for every ASX line):
//
//   POST https://scanner.tradingview.com/australia/scan
//   {"columns":["name","type","subtype","close","Value.Traded","average_volume_10d_calc",
//     "average_volume_30d_calc","market_cap_basic","aum"],
//    "filter":[{"left":"exchange","operation":"in_range","right":["ASX"]}],"range":[0,10000]}
//
// The volume is the ASX line's (about 2,240 lines on 25 October 2026:
// shares, ETFs, LICs, REITs, second classes such as NWSLV).
// Fallbacks, in this order: the 10-day average volume x close; the latest
// day's traded value; size (market cap for a share, net assets for a
// fund), ranked after every line with a traded value; for a code
// TradingView does not list (about 60 small or long-idle names, and a few
// new listings), the market cap of the ASX company directory, also as
// size; nothing, ranked last, by code (on 25 October 2026 about 35 dormant
// ASX shares, MAT, IPC, MSI..., which the directory leaves out and whose
// quote header gives a market cap of 0).
//
//   https://asx.api.markitdigital.com/asx-research/1.0/companies/directory?page=0&itemsPerPage=5000&order=ascending&orderBy=companyName&includeFilterOptions=false&recentListingsOnly=false
//
//   import { asxTopN } from "../selfwealth/asxPopular.mjs";
//   const kept = await asxTopN(rows, 1800, { types: ["STOCK"] });   // rows of the ASX
//   kept.report;   // cut-off line, lines without data
//
//   node brokers/selfwealth/asxPopular.mjs     (top 10 shares and ETFs)

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const SCAN = "https://scanner.tradingview.com/australia/scan";
const DIRECTORY = "https://asx.api.markitdigital.com/asx-research/1.0/companies/directory?page=0&itemsPerPage=5000&order=ascending&orderBy=companyName&includeFilterOptions=false&recentListingsOnly=false";
const COLUMNS = ["name", "type", "subtype", "close", "Value.Traded", "average_volume_10d_calc", "average_volume_30d_calc", "market_cap_basic", "aum"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const BASIS_ORDER = { traded: 0, size: 1 };

let cached = null;

// Map ASX code -> { value, source, basis } (basis "traded" | "size" | null).
export async function asxPopularity() {
  if (cached) return cached;
  let last = "";
  let body = null;
  for (let attempt = 0; attempt < 4 && !body; attempt += 1) {
    try {
      const response = await fetch(SCAN, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/json", Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/" },
        body: JSON.stringify({ columns: COLUMNS, filter: [{ left: "exchange", operation: "in_range", right: ["ASX"] }], range: [0, 10000] }),
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) body = await response.json();
      else last = `${response.status} ${SCAN}`;
    } catch (error) {
      last = `${SCAN}: ${error.message || error}`;
    }
    if (!body) await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  if (!body) throw new Error(last);
  if (!Array.isArray(body.data) || body.data.length < 2000) throw new Error(`TradingView gave ${body.data?.length ?? "no"} ASX lines`);
  const popularity = new Map();
  for (const line of body.data) {
    const symbol = String(line.s || "");
    if (!symbol.startsWith("ASX:")) continue;
    const code = symbol.slice(4).toUpperCase();
    const item = Object.fromEntries(COLUMNS.map((name, index) => [name, line.d[index]]));
    const close = Number(item.close) || 0;
    const fund = item.type === "fund";
    let entry = { value: null, source: "no TradingView data", basis: null };
    if (close && item.average_volume_30d_calc > 0) entry = { value: close * item.average_volume_30d_calc, source: "TradingView 30-day average volume x close", basis: "traded" };
    else if (close && item.average_volume_10d_calc > 0) entry = { value: close * item.average_volume_10d_calc, source: "TradingView 10-day average volume x close", basis: "traded" };
    else if (item["Value.Traded"] > 0) entry = { value: item["Value.Traded"], source: "TradingView latest-day traded value", basis: "traded" };
    else {
      const size = fund ? item.aum || item.market_cap_basic : item.market_cap_basic || item.aum;
      if (size > 0) entry = { value: size, source: fund ? "TradingView net assets" : "TradingView market cap", basis: "size" };
    }
    popularity.set(code, entry);
  }
  const directory = await fetch(DIRECTORY, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
  const items = directory?.data?.items || [];
  if (items.length < 1500) throw new Error(`the ASX company directory gave ${items.length} codes`);
  for (const item of items) {
    const code = String(item.symbol || "").toUpperCase();
    if (code && !popularity.has(code) && item.marketCap > 0) popularity.set(code, { value: item.marketCap, source: "ASX directory market cap", basis: "size" });
  }
  for (const code of ["BHP", "CBA", "VAS"]) {
    if (popularity.get(code)?.basis !== "traded") throw new Error(`TradingView has no traded value for ${code}`);
  }
  cached = popularity;
  return popularity;
}

const aud = (value) => (value === null || value === undefined ? "no data" : `A$${(value / 1e6).toFixed(3)}M`);

// The n most popular of the rows of the given types, most popular first.
export async function asxTopN(rows, n, { types } = {}) {
  const wanted = types ? new Set(types) : null;
  const popularity = await asxPopularity();
  const none = { value: null, source: "not on TradingView", basis: null };
  const ranked = rows
    .filter((row) => !wanted || wanted.has(row.type))
    .map((row) => ({ row, popular: popularity.get(row.ticker) || none }))
    .sort((left, right) => {
      const leftOrder = BASIS_ORDER[left.popular.basis] ?? 2;
      const rightOrder = BASIS_ORDER[right.popular.basis] ?? 2;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      if (leftOrder < 2 && left.popular.value !== right.popular.value) return right.popular.value - left.popular.value;
      return left.row.ticker.localeCompare(right.row.ticker);
    });
  const kept = ranked.slice(0, Math.max(0, n));
  const result = kept.map(({ row }) => row);
  const last = kept.at(-1);
  result.report = {
    n,
    among: ranked.length,
    kept: kept.length,
    cutoff: last ? `${last.row.ticker} ${aud(last.popular.value)} (${last.popular.source})` : null,
    firstLeftOut: ranked[kept.length] ? `${ranked[kept.length].row.ticker} ${aud(ranked[kept.length].popular.value)}` : null,
    noData: ranked.filter(({ popular }) => !popular.basis).length,
    sizeOnly: ranked.filter(({ popular }) => popular.basis === "size").length,
    keptNoData: kept.filter(({ popular }) => !popular.basis).length,
  };
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const popularity = await asxPopularity();
  const top = [...popularity].filter(([, entry]) => entry.basis === "traded").sort((left, right) => right[1].value - left[1].value);
  console.log(`${popularity.size} ASX lines, ${top.length} with a traded value`);
  for (const [code, entry] of top.slice(0, 10)) console.log(code.padEnd(8), aud(entry.value).padStart(14), entry.source);
}
