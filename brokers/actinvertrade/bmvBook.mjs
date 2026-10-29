// The Bolsa Mexicana de Valores (BMV, MIC XMEX) book, for the brokers whose
// only place is the Mexican exchange (Actinver Trade, Kuspit, Bx+, INVEX
// Casa de Bolsa). It is every share, depositary receipt, FIBRA and
// exchange-traded fund (ETF, ETC, ETN) the BMV quotes, on its local board
// and on its Sistema Internacional de Cotizaciones (SIC, the foreign lines,
// tickers ending "/N" or bare US symbols), all quoted in pesos.
//
// The BMV site (issuer search, suspension notices) answered every page with
// its maintenance page ("Sitio Grupo BMV no disponible") on 2026-10-24, so
// the lines are read from TradingView, which carries the BMV feed with each
// line's ISIN, its kind and its last trade:
//   - the symbol search on exchange BMV, blank text and then each letter
//     and digit (the blank listing alone skips about 90 lines; together
//     they reach the total TradingView announces);
//   - the Mexico scanner, for the date of each line's last daily bar.
//
// What stays out:
//   - development and investment-project certificates (CKD, CERPI), and
//     the other trust and mutual-fund certificates (TradingView types
//     "structured", "fund/trust", "fund/mutual"): not shares, not ETFs;
//   - warrants (títulos opcionales) and rights;
//   - a line TradingView has never seen trade on the BMV ("never traded"):
//     the share series held only inside a CPO (CEMEX/A, CEMEX/B, AGUILAS/A,
//     AGUILAS/B), suspended lines whose history was cleared (AHMSA, Altos
//     Hornos de México, suspended since 2023), and SIC lines listed by a
//     sponsor that never traded;
//   - a Mexican line (MX ISIN) with no trade for more than a year: these are
//     the suspended and delisted issuers, e.g. GFAMSA/A (last trade May
//     2023), SARE/B (2019), HOMEX (May 2025), UNIFIN/A (2022), CREAL (2022),
//     and Televisa's A, B, D and L series (2005; only TLEVISA/CPO trades);
//   - a SIC line with no BMV trade for more than a year whose ISIN no longer
//     trades on any other exchange TradingView's global scanner carries (no
//     daily bar in the last 30 days anywhere) and is on no other exchange in
//     assets/stocks.csv or assets/etfs.csv: the home listing is gone
//     (merger, takeover, delisting), e.g. MAREL/N (Marel, taken over by
//     JBT), CPE (Callon, merged into APA), CHU/N (China Unicom ADR).
//     The global scanner has no SIX line, hence the shared lists too.
// A SIC line with no BMV trade for a year whose home listing still trades is
// kept, and reported as quiet: the SIC keeps it listed. Peso-hedged UCITS
// classes listed only in Mexico (ID34MX/N, SUSEMX/N) trade every few months,
// which is why the one-year bar applies to SIC lines too.
// A line with no ISIN on TradingView takes it from assets/stocks.csv or
// assets/etfs.csv ("BMV:<ticker>"); with none, it stays out.
//
//   https://www.bmv.com.mx/es/emisoras/informacion-de-emisoras
//   https://www.bmv.com.mx/es/Grupo_BMV/Avisos_de_mercado (suspension notices)
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=&exchange=BMV&lang=en&domain=production&search_type=stocks
//   https://scanner.tradingview.com/mexico/scan
//   https://scanner.tradingview.com/global/scan
//
// The crawl (about 230 calls) is kept for 12 hours in the system temp
// folder, so the scrapers run back to back read TradingView once.
//
// Use:
//   import { bmvBook } from "../actinvertrade/bmvBook.mjs";
//   const { rows, dropped, quiet } = await bmvBook();
//   rows: { query, ticker, name, exchange: "Bolsa Mexicana", mic: "XMEX",
//           currency: "MXN", type: STOCK|ETF|ETC|ETN|FUND, isin, raw }
//
// BIVA. bmvBook({ board: "BIVA" }) reads the Bolsa Institucional de Valores
// the same way (TradingView exchange BIVA: its own listings, the BMV
// issuers cross-listed there and its own SIC lines), with the same rules,
// as rows { exchange: "BIVA", mic: "BIVA" }. A line with no ISIN on
// TradingView takes the one assets/*.csv gives the same ticker on BIVA,
// else on the BMV. Its crawl is cached apart (biva-book-cache.json).
//
//   node brokers/actinvertrade/bmvBook.mjs      prints the counts
//   node brokers/actinvertrade/bmvBook.mjs BIVA prints the BIVA counts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const MEXICO = "https://scanner.tradingview.com/mexico/scan";
const GLOBAL = "https://scanner.tradingview.com/global/scan";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, Origin: "https://www.tradingview.com" };
// Each board: TradingView's exchange code, the row's exchange and mic, its
// cache file, the lines a whole book must hold and its floor of shares and
// ETFs.
const BOARDS = {
  BMV: { exchange: "Bolsa Mexicana", mic: "XMEX", cache: "bmv-book-cache.json", must: ["WALMEX", "FUNO/11", "TLEVISA/CPO", "AAPL", "IVV", "NAFTRAC/ISHRS"], shares: 1500, etfs: 1000 },
  BIVA: { exchange: "BIVA", mic: "BIVA", cache: "biva-book-cache.json", must: ["WALMEX", "AAPL", "IVV"], shares: 1000, etfs: 700 },
};
const CACHE_HOURS = 12;
const DAY = 86400;
const STALE_DAYS = 365;
const ELSEWHERE_DAYS = 30;
const ROOT = new URL("../../", import.meta.url);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

async function searchPage(board, text, type, start) {
  const url = `${SEARCH}?text=${encodeURIComponent(text)}&exchange=${board}&lang=en&domain=production&search_type=${type}&start=${start}`;
  const body = await getJson(url, { headers: HEADERS });
  if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) throw new Error(`no page for ${url}`);
  return body;
}

// Every line of the board TradingView names, and the total it announces.
async function searchAll(board) {
  const lines = new Map();
  const totals = {};
  for (const type of ["stocks", "funds"]) {
    for (const text of ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"]) {
      let start = 0;
      for (;;) {
        const body = await searchPage(board, text, type, start);
        if (text === "" && start === 0) totals[type] = body.symbols.length + body.symbols_remaining;
        for (const symbol of body.symbols) {
          if (symbol.exchange !== board) continue;
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

async function scan(url, body) {
  return getJson(url, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

// Last daily bar (unix seconds) of each line of the board; null when there
// is none.
async function lastTrades(board, tickers) {
  const out = new Map();
  for (let i = 0; i < tickers.length; i += 400) {
    const chunk = tickers.slice(i, i + 400);
    const body = await scan(MEXICO, { columns: ["time"], symbols: { tickers: chunk.map((t) => `${board}:${t}`) } });
    for (const row of body.data || []) out.set(String(row.s).slice(board.length + 1), row.d?.[0] ?? null);
    await sleep(700);
  }
  return out;
}

// The ISINs that traded in the last 30 days on an exchange other than the
// Mexican two (the global scanner lists only lines with a recent bar).
async function tradedElsewhere(isins) {
  const alive = new Set();
  const cutoff = Date.now() / 1000 - ELSEWHERE_DAYS * DAY;
  for (let i = 0; i < isins.length; i += 150) {
    const chunk = isins.slice(i, i + 150);
    const body = await scan(GLOBAL, {
      columns: ["isin", "exchange", "time"],
      filter: [{ left: "isin", operation: "in_range", right: chunk }],
      range: [0, 5000],
    });
    for (const row of body.data || []) {
      const [isin, exchange, time] = row.d || [];
      if (exchange === "BMV" || exchange === "BIVA") continue;
      if (time && time >= cutoff) alive.add(isin);
    }
    await sleep(700);
  }
  return alive;
}

// assets/stocks.csv and etfs.csv: the ISIN of each ticker of the board (for
// BIVA, the BMV one when the file has no BIVA line), and the ISINs listed
// on an exchange other than the Mexican two.
function sharedLists(board = "BMV") {
  const out = new Map();
  const bmv = new Map();
  const abroad = new Set();
  for (const file of ["assets/stocks.csv", "assets/etfs.csv"]) {
    let text = "";
    try {
      text = fs.readFileSync(new URL(file, ROOT), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const [ticker, exchange, isin] = line.split(",");
      if (!isinOf(isin)) continue;
      if (exchange === board) out.set(ticker.slice(board.length + 1).toUpperCase(), isin.toUpperCase());
      if (exchange === "BMV") bmv.set(ticker.slice(4).toUpperCase(), isin.toUpperCase());
      else if (exchange !== "BIVA") abroad.add(isin.toUpperCase());
    }
  }
  for (const [ticker, isin] of bmv) if (!out.has(ticker)) out.set(ticker, isin);
  return { isins: out, abroad };
}

async function crawl(board) {
  const CACHE = path.join(os.tmpdir(), BOARDS[board].cache);
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3600_000 && cached.lines?.length) {
      console.error(`${board} book read from ${CACHE}`);
      return { lines: new Map(cached.lines), totals: cached.totals, trades: new Map(cached.trades), alive: new Set(cached.alive) };
    }
  } catch {}
  const { lines, totals } = await searchAll(board);
  const found = { stocks: 0, funds: 0 };
  for (const symbol of lines.values()) found[symbol.type === "fund" ? "funds" : "stocks"] += 1;
  for (const type of ["stocks", "funds"]) {
    if (found[type] < totals[type]) console.error(`${board} ${type}: ${found[type]} of the ${totals[type]} TradingView announces`);
  }
  const trades = await lastTrades(board, [...lines.keys()]);
  const now = Date.now() / 1000;
  const staleSic = [];
  for (const [ticker, symbol] of lines) {
    const isin = isinOf(symbol.isin);
    const time = trades.get(ticker);
    if (isin && !isin.startsWith("MX") && time && now - time > STALE_DAYS * DAY) staleSic.push(isin);
  }
  const alive = await tradedElsewhere([...new Set(staleSic)]);
  try {
    fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), lines: [...lines], totals, trades: [...trades], alive: [...alive] }));
  } catch {}
  return { lines, totals, trades, alive };
}

function kindOf(symbol) {
  const type = normalize(symbol.type).toLowerCase();
  const specs = Array.isArray(symbol.typespecs) ? symbol.typespecs.map((s) => String(s).toLowerCase()) : [];
  const name = normalize(symbol.description);
  if (specs.includes("warrant") || specs.includes("right")) return "";
  if (type === "stock" && (specs.includes("common") || specs.includes("preferred"))) return "STOCK";
  if (type === "dr") return "STOCK";
  if (type === "fund" && specs.includes("reit")) return "STOCK";
  if (type === "fund" && specs.includes("etf")) {
    if (/\bETC\b/i.test(name)) return "ETC";
    if (/\bETN\b/i.test(name)) return "ETN";
    return "ETF";
  }
  if (type === "fund" && specs.includes("closedend")) return "FUND";
  return "";
}

// Every BMV line that can be bought today, as catalogue rows sorted by type
// then ticker; `dropped` names each line left out and why, `quiet` the SIC
// lines kept with no BMV trade for more than a year. `board: "BIVA"` reads
// BIVA instead, with the same rules.
export async function bmvBook({ board = "BMV" } = {}) {
  const spec = BOARDS[board];
  if (!spec) throw new Error(`no board ${board}`);
  const { lines, totals, trades, alive } = await crawl(board);
  const { isins: fallback, abroad } = sharedLists(board);
  const now = Date.now() / 1000;
  const rows = [];
  const dropped = [];
  const quiet = [];
  for (const [ticker, symbol] of lines) {
    const kind = kindOf(symbol);
    const label = `${symbol.type}${symbol.typespecs?.length ? "/" + symbol.typespecs.join("+") : ""}`;
    if (!kind) {
      dropped.push({ ticker, reason: `not a share or ETF (${label})` });
      continue;
    }
    const currency = normalize(symbol.currency_code).toUpperCase();
    if (currency !== "MXN") throw new Error(`${board} ${ticker} is quoted ${currency || "nowhere"}`);
    const isin = isinOf(symbol.isin) || fallback.get(ticker) || "";
    const time = trades.get(ticker) ?? null;
    if (!time) {
      dropped.push({ ticker, reason: `never traded on the ${board}` });
      continue;
    }
    const days = (now - time) / DAY;
    const local = isin.startsWith("MX");
    if (local && days > STALE_DAYS) {
      dropped.push({ ticker, reason: `Mexican line, last trade ${day(time)} (suspended or delisted)` });
      continue;
    }
    if (!local && days > STALE_DAYS) {
      if (!isin || (!alive.has(isin) && !abroad.has(isin))) {
        dropped.push({ ticker, reason: `SIC line, last trade ${day(time)}, listed nowhere else` });
        continue;
      }
      quiet.push(ticker);
    }
    if (!isin) {
      dropped.push({ ticker, reason: "no ISIN" });
      continue;
    }
    const name = normalize(symbol.description);
    if (!name) throw new Error(`${board} ${ticker} has no name`);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: spec.exchange,
      mic: spec.mic,
      currency: "MXN",
      type: kind,
      isin,
      raw: [ticker, name, label, isin, `last trade ${day(time)}`].join(" | "),
    });
  }
  const order = { STOCK: 0, ETF: 1, ETC: 2, ETN: 3, FUND: 4 };
  rows.sort((a, b) => order[a.type] - order[b.type] || a.ticker.localeCompare(b.ticker));

  for (const ticker of spec.must) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${board} book misses ${ticker}`);
  }
  const shares = rows.filter((row) => row.type === "STOCK").length;
  const etfs = rows.filter((row) => row.type !== "STOCK").length;
  if (shares < spec.shares) throw new Error(`only ${shares} ${board} shares`);
  if (etfs < spec.etfs) throw new Error(`only ${etfs} ${board} ETFs`);
  return { rows, dropped, quiet: quiet.sort(), totals };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const board = process.argv[2] || "BMV";
  const book = await bmvBook({ board });
  const count = {};
  for (const row of book.rows) count[row.type] = (count[row.type] || 0) + 1;
  const reasons = {};
  for (const item of book.dropped) {
    const key = item.reason.replace(/ \d{4}-\d{2}-\d{2}/, "").replace(/\(.*\)$/, "").trim();
    reasons[key] = (reasons[key] || 0) + 1;
  }
  const sic = book.rows.filter((row) => !row.isin.startsWith("MX")).length;
  console.log(
    `bmvBook ${board}: ${book.rows.length} rows (${Object.entries(count).map(([type, n]) => `${n} ${type}`).join(", ")}), ` +
      `${book.rows.length - sic} Mexican, ${sic} SIC; quiet SIC lines kept: ${book.quiet.length}`
  );
  console.log(`dropped ${book.dropped.length}: ${JSON.stringify(reasons)}`);
}
