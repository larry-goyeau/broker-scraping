// The Johannesburg Stock Exchange (JSE, MIC XJSE) book, for the brokers
// whose only place is South Africa (../eqt, EQT by Old Mutual Wealth). It is
// every ordinary and preference share (Main Board and AltX, inward listings
// of foreign companies included), every exchange-traded fund (index ETFs,
// actively managed ETFs, NewGold-style commodity ETFs) and every
// exchange-traded note and actively managed certificate (AMC) the JSE
// quotes, all in rand.
//
// The JSE site (issuer list, ETP list, suspensions) answers every plain
// request with Cloudflare's "Attention Required" block page (403, also
// clientportal.jse.co.za and senspdf.jse.co.za, on 2026-10-25), so the
// lines are read from TradingView, which carries the JSE feed with each
// line's ISIN and kind:
//   - the symbol search on exchange JSE, "stocks" and "funds", blank text
//     and then each letter and digit (607 lines on 2026-10-25);
//   - the South Africa scanner, for the date of each line's last daily bar.
// Checked against the two public whole-JSE shelves in the repo on
// 2026-10-25: every code of etfSA's "Products offered through ETFSA" PDF
// (320 ETPs, ../etfsa) and every JSE line EasyEquities sells (../easyequities)
// is in TradingView's list, except Balwin Properties (BWN), delisted.
//
// Types:
//   - STOCK: TradingView "stock" common or preferred (REITs are common
//     shares on the JSE), except the Standard Bank AMC series (AMC008,
//     AMC022), which TradingView files as shares and are ETN here;
//   - ETN: every TradingView "structured" line (UBS, Absa and Standard Bank
//     AMCs and index trackers; etfSA's PDF lists 90 of these 91 as ETNs or
//     AMCs) and every "fund" line whose name says ETN, exchange-traded
//     product, tracker, AMC, structured note or names the issuing bank
//     (FirstRand's single-stock and index ETNs, Standard Bank's SBCOP ...);
//   - ETF: every other "fund" line (142 on 2026-10-25).
// On 2026-10-25 each of the 320 codes in etfSA's PDF got the type etfSA
// gives it (ETF or ETN); the one ETN here etfSA does not list is IBLVR4.
//
// What stays out:
//   - a share or ETP TradingView has never seen trade ("never traded"):
//     Investec Bank (Mauritius)'s credit-linked redeemable preference shares
//     IMRP1 to IMRP14;
//   - a share or ETP with no trade for more than a year: the suspended and
//     delisted ones, e.g. Tongaat Hulett (TON, last trade 2022-07), Sail
//     Mining (SGP, 2022), aReit Prop (APO, 2024-05), Trustco (TTO, 2025-01),
//     African Dawn (ADW), Efora Energy (EEL), Kibo Energy (KBO), Sable
//     Exploration (SXM), all 2025 suspensions, and Nampak's two old
//     preference shares (NPKP 2025-06, NPP1 2019). A thin line that traded
//     within the year (African and Overseas preference shares, Africa
//     Bitcoin Corporation, Globe Trade Centre) is kept.
// TradingView has no daily bar for any "structured" line, so the AMCs and
// UBS trackers cannot be checked for suspension: they are kept, and listed
// in `unchecked`. The maturity in TradingView's name is not used either:
// FNBGSE ("2020-20.03.25") still trades, and AMCs are rolled on.
// Warrants and rights are not in TradingView's JSE list at all.
// A line with no ISIN on TradingView takes it from assets/stocks.csv or
// assets/etfs.csv ("JSE:<ticker>"); with none, it stays out. An ETN keeps
// the shared list's name when it has one (TradingView names the issuing
// bank), any other line TradingView's.
//
// Prices on the JSE are in cents (TradingView's "ZAC"); the rows say ZAR,
// as every other JSE catalogue in the repo does.
//
//   https://www.jse.co.za/  (Cloudflare block for plain requests)
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=&exchange=JSE&lang=en&domain=production&search_type=stocks
//   https://scanner.tradingview.com/rsa/scan
//
// The crawl (about 110 calls) is kept for 12 hours in the system temp
// folder, so scrapers run back to back read TradingView once.
//
// Use:
//   import { jseBook } from "../eqt/jseBook.mjs";
//   const { rows, dropped, unchecked } = await jseBook();
//   rows: { query, ticker, name, exchange: "JSE", mic: "XJSE",
//           currency: "ZAR", type: STOCK|ETF|ETN, isin, raw }
//
//   node brokers/eqt/jseBook.mjs      prints the counts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const SCANNER = "https://scanner.tradingview.com/rsa/scan";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, Origin: "https://www.tradingview.com" };
const CACHE = path.join(os.tmpdir(), "jse-book-cache.json");
const CACHE_HOURS = 12;
const DAY = 86400;
const STALE_DAYS = 365;
const ROOT = new URL("../../", import.meta.url);

const ETN_NAME = /\bETNs?\b|Exchange Traded (Note|Product)|\bETP\b|Tracker|\bAMC\b|Actively Managed Certificate|Structured|\bNotes?\b|\bBank\b|\bUBS\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/<\/?em>/g, "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function day(unix) {
  return unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "";
}

async function getJson(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return await response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function searchPage(text, type, start) {
  const url = `${SEARCH}?text=${encodeURIComponent(text)}&exchange=JSE&lang=en&domain=production&search_type=${type}&start=${start}`;
  const body = await getJson(url, { headers: HEADERS });
  if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) throw new Error(`no page for ${url}`);
  return body;
}

// Every JSE line TradingView names, and the total it announces per search.
async function searchAll() {
  const lines = new Map();
  const totals = {};
  for (const type of ["stocks", "funds"]) {
    for (const text of ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"]) {
      let start = 0;
      for (;;) {
        const body = await searchPage(text, type, start);
        if (text === "" && start === 0) totals[type] = body.symbols.length + body.symbols_remaining;
        for (const symbol of body.symbols) {
          if (symbol.exchange !== "JSE") continue;
          const ticker = normalize(symbol.symbol).toUpperCase();
          if (ticker) lines.set(ticker, symbol);
        }
        start += body.symbols.length;
        await sleep(250);
        if (!body.symbols.length || body.symbols_remaining <= 0) break;
      }
    }
  }
  return { lines, totals };
}

// Last daily bar (unix seconds) of each JSE line; null when there is none.
async function lastTrades(tickers) {
  const out = new Map();
  for (let i = 0; i < tickers.length; i += 400) {
    const chunk = tickers.slice(i, i + 400);
    const body = await getJson(SCANNER, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ columns: ["time"], symbols: { tickers: chunk.map((t) => `JSE:${t}`) } }),
    });
    for (const row of body.data || []) out.set(String(row.s).slice(4), row.d?.[0] ?? null);
    await sleep(700);
  }
  return out;
}

// assets/stocks.csv and etfs.csv: ISIN and name of each JSE ticker, and the
// name of each JSE ISIN.
function sharedLists() {
  const byTicker = new Map();
  const nameByIsin = new Map();
  for (const file of ["assets/stocks.csv", "assets/etfs.csv"]) {
    let text = "";
    try {
      text = fs.readFileSync(new URL(file, ROOT), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const [ticker, exchange, isin, ...name] = line.split(",");
      if (exchange !== "JSE" || !isinOf(isin)) continue;
      const label = normalize(name.join(","));
      byTicker.set(ticker.slice(4).toUpperCase(), isin.toUpperCase());
      if (label) nameByIsin.set(isin.toUpperCase(), label);
    }
  }
  return { byTicker, nameByIsin };
}

async function crawl() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3600_000 && cached.lines?.length) {
      console.error(`JSE book read from ${CACHE}`);
      return { lines: new Map(cached.lines), totals: cached.totals, trades: new Map(cached.trades) };
    }
  } catch {}
  const { lines, totals } = await searchAll();
  const found = { stocks: 0, funds: 0 };
  for (const symbol of lines.values()) found[symbol.type === "fund" ? "funds" : "stocks"] += 1;
  for (const type of ["stocks", "funds"]) {
    if (found[type] < totals[type]) console.error(`JSE ${type}: ${found[type]} of the ${totals[type]} TradingView announces`);
  }
  const trades = await lastTrades([...lines.keys()]);
  try {
    fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), lines: [...lines], totals, trades: [...trades] }));
  } catch {}
  return { lines, totals, trades };
}

function kindOf(ticker, symbol) {
  const type = normalize(symbol.type).toLowerCase();
  const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs.map((s) => String(s).toLowerCase()) : [];
  const name = normalize(symbol.description);
  if (specs.includes("warrant") || specs.includes("right")) return "";
  if (/^AMC\d{3}$/.test(ticker)) return "ETN";
  if (type === "structured") return "ETN";
  if (type === "stock" && (specs.includes("common") || specs.includes("preferred"))) return "STOCK";
  if (type === "dr") return "STOCK";
  if (type === "fund" && specs.includes("etf")) return ETN_NAME.test(name) ? "ETN" : "ETF";
  return "";
}

// Every JSE line that can be bought today, as catalogue rows sorted by type
// then ticker; `dropped` names each line left out and why, `unchecked` the
// ETNs kept with no trade data to test them against.
export async function jseBook() {
  const { lines, totals, trades } = await crawl();
  const { byTicker, nameByIsin } = sharedLists();
  const now = Date.now() / 1000;
  const rows = [];
  const dropped = [];
  const unchecked = [];
  for (const [ticker, symbol] of lines) {
    const kind = kindOf(ticker, symbol);
    const label = `${symbol.type}${symbol.typespecs?.length ? "/" + symbol.typespecs.join("+") : ""}`;
    if (!kind) {
      dropped.push({ ticker, reason: `not a share or ETP (${label})` });
      continue;
    }
    const currency = normalize(symbol.currency_code).toUpperCase();
    if (currency !== "ZAC" && currency !== "ZAR") throw new Error(`JSE ${ticker} is quoted ${currency || "nowhere"}`);
    const isin = isinOf(symbol.isin) || byTicker.get(ticker) || "";
    const time = trades.get(ticker) ?? null;
    if (symbol.type === "structured") {
      unchecked.push(ticker);
    } else if (!time) {
      dropped.push({ ticker, reason: "never traded on the JSE" });
      continue;
    } else if (now - time > STALE_DAYS * DAY) {
      dropped.push({ ticker, reason: `last trade ${day(time)} (suspended or delisted)` });
      continue;
    }
    if (!isin) {
      dropped.push({ ticker, reason: "no ISIN" });
      continue;
    }
    const tvName = normalize(symbol.description);
    const name = (kind === "ETN" && nameByIsin.get(isin)) || tvName;
    if (!name) throw new Error(`JSE ${ticker} has no name`);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "JSE",
      mic: "XJSE",
      currency: "ZAR",
      type: kind,
      isin,
      raw: [ticker, tvName, label, isin, time ? `last trade ${day(time)}` : "no trade data"].join(" | "),
    });
  }
  const order = { STOCK: 0, ETF: 1, ETC: 2, ETN: 3, FUND: 4 };
  rows.sort((a, b) => order[a.type] - order[b.type] || a.ticker.localeCompare(b.ticker));

  for (const ticker of ["NPN", "SOL", "SBK", "GRT", "STX40", "GLD", "SYG500", "SBCOP"]) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`JSE book misses ${ticker}`);
  }
  const count = (type) => rows.filter((row) => row.type === type).length;
  if (count("STOCK") < 230) throw new Error(`only ${count("STOCK")} JSE shares`);
  if (count("ETF") < 120) throw new Error(`only ${count("ETF")} JSE ETFs`);
  if (count("ETN") < 120) throw new Error(`only ${count("ETN")} JSE ETNs`);
  return { rows, dropped, unchecked: unchecked.sort(), totals };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const book = await jseBook();
  const count = {};
  for (const row of book.rows) count[row.type] = (count[row.type] || 0) + 1;
  const reasons = {};
  for (const item of book.dropped) {
    const key = item.reason.replace(/ \d{4}-\d{2}-\d{2}/, "").replace(/\(.*\)$/, "").trim();
    reasons[key] = (reasons[key] || 0) + 1;
  }
  console.log(`jseBook: ${book.rows.length} rows (${Object.entries(count).map(([type, n]) => `${n} ${type}`).join(", ")}); ETNs without trade data kept: ${book.unchecked.length}`);
  console.log(`dropped ${book.dropped.length}: ${JSON.stringify(reasons)}`);
  for (const item of book.dropped) console.log(`  ${item.ticker}: ${item.reason}`);
}
