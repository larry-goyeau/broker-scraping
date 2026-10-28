// The Stock Exchange of Thailand (SET, MIC XBKK) book, for the brokers whose
// only place is the Thai exchange (KGI Securities Thailand, Land and Houses
// Securities, I V Global Securities). It is every line of the one SET order
// book a Thai account can buy, both boards (SET and mai), in baht:
//   - common and preferred shares, REITs, property funds and infrastructure
//     funds of the companies on SET's own listed-companies file;
//   - NVDRs (the ".R" lines of Thai NVDR Co., a SET subsidiary), each kept
//     while its share is kept;
//   - depositary receipts on foreign shares and funds (AAPL80, SP500US80...);
//   - the Thai ETFs (TDEX, 1DIV, BSET100, GLD...).
//
// The SET site (set.or.th and settrade.com: stock list, quote pages, SP / H
// signs) answers every API call with an Incapsula bot page, so the
// suspension list cannot be read there. What is read:
//   - SET's listed-companies file (plain HTML table, one row per company,
//     its board SET or mai), the list of the companies, REITs and property
//     and infrastructure funds listed today:
//       https://www.set.or.th/dat/eod/listedcompany/static/listedCompanies_en_US.xls
//   - TradingView's symbol search on exchange SET, blank text and then each
//     letter and digit, for every line with its kind and ISIN (the blank
//     listing alone skips about a fifth of them):
//       https://symbol-search.tradingview.com/symbol_search/v3/?text=&exchange=SET&lang=en&domain=production&search_type=stocks
//   - TradingView's Thailand scanner, for the date of each line's last
//     daily bar:
//       https://scanner.tradingview.com/thailand/scan
//
// What stays out:
//   - warrants and derivative warrants (TCAP01C2612A is filed as a share:
//     it is not on SET's file), rights, and lines not on SET's file;
//   - foreign-board lines (".F", ".Q", "Alien Mkt"): a separate line open to
//     foreign investors only, which hardly ever trades;
//   - pre-IPO lines (never traded);
//   - a line with no daily bar at all, or none for more than 30 days before
//     the latest SET session: these are the suspended (SP), halted and
//     delisting lines. On 2026-10-24 that was e.g. TTCL and TSR (last trade
//     20 May 2026), CHO, ECF, HPT, MVP, SAM and MILL (3 July 2026), PF,
//     GRAND and EMPIRE (14 August 2026), ACAP (2023), KTB.P (February 2026).
//     A line with no trade for 14 to 30 days is kept and reported as quiet
//     (thin lines such as KWC and CSR trade every two or three weeks);
//     a Thai ETF is kept however quiet (ABFTH, a bond index ETF, last traded
//     on 31 July 2026), as its market maker quotes it;
//   - a line with no ISIN (TradingView's, else assets/stocks.csv or
//     assets/etfs.csv "SET:<ticker>").
//
// Types: shares, preferred shares, REITs, property and infrastructure
// funds are STOCK (as for the other SET catalogues: listed units that trade
// like shares); an NVDR takes its share's type; a DR on a fund is ETF, ETC
// for a gold trust (SPDR Gold Shares, Gold MiniShares) or an oil fund; VAYU1 (Vayupak Fund 1, a listed mutual
// fund) is FUND. Tickers are TradingView's and the asset lists' (PTT.R,
// RABBIT.P), which spreads/set-touch.mjs reads.
//
// The crawl (about 400 calls) is kept for 12 hours in the system temp
// folder, so the scrapers run back to back read the sources once.
//
// Use:
//   import { setBook, writeSetCatalogue } from "../kgithailand/setBook.mjs";
//   const { rows, dropped, quiet, suspended } = await setBook({ nvdr: true, dr: true });
//   rows: { query, ticker, name, exchange: "Stock Exchange of Thailand",
//           mic: "XBKK", currency: "THB", type: STOCK|ETF|ETC|FUND, isin, raw }
//   raw: "ticker | name | board (SET, mai, DR, NVDR, ETF) | kind | isin | last trade"
//   await writeSetCatalogue(import.meta.url, "<folder>-parsed.json", { nvdr, dr, types });
//
//   node brokers/kgithailand/setBook.mjs      prints the counts

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COMPANIES = "https://www.set.or.th/dat/eod/listedcompany/static/listedCompanies_en_US.xls";
const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const SCANNER = "https://scanner.tradingview.com/thailand/scan";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const TV = { "User-Agent": UA, Origin: "https://www.tradingview.com" };
const CACHE = path.join(os.tmpdir(), "set-book-cache.json");
const CACHE_HOURS = 12;
const DAY = 86400;
const STALE_DAYS = 30;
const QUIET_DAYS = 14;
const EXCHANGE = "Stock Exchange of Thailand";
const ROOT = new URL("../../", import.meta.url);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function day(unix) {
  return unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "";
}

async function get(url, options = {}, as = "json") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow", ...options, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return as === "json" ? await response.json() : await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// SET's listed-companies file: symbol -> { board, name }.
async function setCompanies() {
  const text = await get(COMPANIES, { headers: { "User-Agent": UA } }, "text");
  const out = new Map();
  for (const row of text.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => normalize(cell[1].replace(/<[^>]+>/g, "")));
    if (cells.length > 3 && /^(SET|mai)$/.test(cells[2])) out.set(cells[0].toUpperCase(), { board: cells[2], name: cells[1] });
  }
  if (out.size < 800) throw new Error(`SET listed-companies file gave ${out.size} lines`);
  return out;
}

// Every SET line TradingView names (stocks, DRs, warrants, funds).
async function searchAll() {
  const lines = new Map();
  let announced = 0;
  for (const type of ["stocks", "funds"]) {
    for (const text of ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"]) {
      let start = 0;
      for (;;) {
        const url = `${SEARCH}?text=${encodeURIComponent(text)}&exchange=SET&lang=en&domain=production&search_type=${type}&start=${start}`;
        const body = await get(url, { headers: TV });
        if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) throw new Error(`no page for ${url}`);
        if (text === "" && start === 0) announced += body.symbols.length + body.symbols_remaining;
        for (const symbol of body.symbols) {
          const ticker = normalize(symbol.symbol).toUpperCase();
          if (symbol.exchange === "SET" && ticker) lines.set(ticker, symbol);
        }
        start += body.symbols.length;
        await sleep(250);
        if (!body.symbols.length || body.symbols_remaining <= 0) break;
      }
    }
  }
  if (lines.size < announced) console.error(`SET: ${lines.size} of the ${announced} lines TradingView announces`);
  return lines;
}

// Last daily bar (unix seconds) of each line; null when there is none.
async function lastTrades(tickers) {
  const out = new Map();
  for (let i = 0; i < tickers.length; i += 400) {
    const chunk = tickers.slice(i, i + 400);
    const body = await get(SCANNER, {
      method: "POST",
      headers: { ...TV, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ columns: ["time"], symbols: { tickers: chunk.map((t) => `SET:${t}`) } }),
    });
    for (const row of body.data || []) out.set(String(row.s).slice(4), row.d?.[0] ?? null);
    await sleep(700);
  }
  return out;
}

// assets/stocks.csv and etfs.csv: the ISIN of each SET ticker.
function sharedIsins() {
  const out = new Map();
  for (const file of ["assets/stocks.csv", "assets/etfs.csv"]) {
    let text = "";
    try {
      text = fs.readFileSync(new URL(file, ROOT), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const [ticker, exchange, isin] = line.split(",");
      if (exchange === "SET" && isinOf(isin)) out.set(ticker.slice(4).toUpperCase(), isin.toUpperCase());
    }
  }
  return out;
}

const foreignLine = (ticker, symbol) =>
  (symbol.typespecs || []).includes("foreign") || /\.(F|Q\d*)$/.test(ticker) || /alien mkt/i.test(symbol.description || "");

async function crawl() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3600_000 && cached.lines?.length) {
      console.error(`SET book read from ${CACHE}`);
      return { companies: new Map(cached.companies), lines: new Map(cached.lines), trades: new Map(cached.trades) };
    }
  } catch {}
  const companies = await setCompanies();
  const lines = await searchAll();
  const wanted = [...lines].filter(([ticker, symbol]) => symbol.type !== "warrant" && !foreignLine(ticker, symbol)).map(([ticker]) => ticker);
  const trades = await lastTrades(wanted);
  try {
    fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), companies: [...companies], lines: [...lines], trades: [...trades] }));
  } catch {}
  return { companies, lines, trades };
}

function drType(name) {
  if (/gold (mini ?shares )?trust|spdr gold shares|oil fund/i.test(name)) return "ETC";
  if (/\bETF\b|exchange traded fund|index funds? |tracker fund/i.test(name)) return "ETF";
  return "STOCK";
}

// What a line is: { type, board, kind } or { reason } when it stays out.
function classify(ticker, symbol, companies) {
  const type = normalize(symbol.type).toLowerCase();
  const specs = (symbol.typespecs || []).map((s) => String(s).toLowerCase());
  const name = normalize(symbol.description);
  if (type === "warrant") return { reason: "warrant" };
  if (foreignLine(ticker, symbol)) return { reason: "foreign board (foreign investors only)" };
  if (specs.includes("pre-ipo")) return { reason: "pre-IPO" };
  if (type === "dr") return { type: drType(name), board: "DR", kind: "depositary receipt" };
  if (type === "fund" && specs.includes("etf")) return { type: "ETF", board: "ETF", kind: "ETF" };
  if (type === "fund" && specs.includes("closedend")) {
    const company = companies.get(ticker);
    if (!company) return { reason: "fund not on SET's listed-companies file" };
    return { type: "STOCK", board: company.board, kind: /infrastructure/i.test(name) ? "infrastructure fund" : "property fund" };
  }
  if (type === "fund") return { reason: `fund/${specs.join("+")} never traded` };
  if (type === "stock" && specs.includes("preferred")) {
    const company = companies.get(ticker.split(".")[0]);
    if (!company) return { reason: "preferred share of a company not on SET's file" };
    return { type: "STOCK", board: company.board, kind: "preferred" };
  }
  if (type === "stock" && specs.includes("common")) {
    const company = companies.get(ticker);
    if (company) return { type: "STOCK", board: company.board, kind: /\bREIT\b|real estate investment trust/i.test(name) ? "REIT" : "common" };
    if (/\bfund\b/i.test(name) && isinOf(symbol.isin)) return { type: "FUND", board: "SET", kind: "listed mutual fund" };
    return { reason: "not on SET's listed-companies file (derivative warrant, expired line)" };
  }
  return { reason: `TradingView type ${type}/${specs.join("+")}` };
}

// Every SET line that can be bought today, as catalogue rows sorted by type
// then ticker. `dropped` names each line left out and why (warrants are only
// counted), `suspended` the lines with no trade for more than 30 days,
// `quiet` the kept lines with no trade for 14 days or more.
export async function setBook({ nvdr = true, dr = true } = {}) {
  const { companies, lines, trades } = await crawl();
  const fallback = sharedIsins();
  const latest = Math.max(...[...trades.values()].filter(Boolean));
  const ageOf = (ticker) => {
    const time = trades.get(ticker);
    return time ? (latest - time) / DAY : Infinity;
  };
  const rows = [];
  const dropped = [];
  const suspended = [];
  const quiet = [];
  let warrants = 0;
  const kept = new Map();
  const nvdrs = [];

  for (const [ticker, symbol] of lines) {
    if (ticker.endsWith(".R")) {
      nvdrs.push([ticker, symbol]);
      continue;
    }
    const what = classify(ticker, symbol, companies);
    if (what.reason === "warrant") {
      warrants += 1;
      continue;
    }
    if (what.reason) {
      dropped.push({ ticker, reason: what.reason });
      continue;
    }
    const age = ageOf(ticker);
    const last = day(trades.get(ticker));
    if (age === Infinity) {
      dropped.push({ ticker, reason: "never traded" });
      continue;
    }
    if (age > STALE_DAYS && what.kind !== "ETF") {
      dropped.push({ ticker, reason: `no trade since ${last} (suspended, halted or delisting)` });
      suspended.push(ticker);
      continue;
    }
    if (age >= QUIET_DAYS) quiet.push(`${ticker} ${last}`);
    if (what.board === "DR" && !dr) continue;
    const isin = isinOf(symbol.isin) || fallback.get(ticker) || "";
    if (!isin) {
      dropped.push({ ticker, reason: "no ISIN" });
      continue;
    }
    const name = normalize(symbol.description) || companies.get(ticker)?.name;
    if (!name) throw new Error(`SET ${ticker} has no name`);
    const currency = normalize(symbol.currency_code).toUpperCase() || "THB";
    if (currency !== "THB") throw new Error(`SET ${ticker} is quoted ${currency}`);
    const row = {
      query: ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: "XBKK",
      currency,
      type: what.type,
      isin,
      raw: [ticker, name, what.board, what.kind, isin, `last trade ${last}`].join(" | "),
    };
    rows.push(row);
    kept.set(ticker, row);
  }

  // An NVDR is issued on demand against its share: kept while the share is.
  for (const [ticker, symbol] of nvdrs) {
    const base = kept.get(ticker.slice(0, -2));
    if (!base) {
      dropped.push({ ticker, reason: "NVDR of a line left out" });
      continue;
    }
    if (base.raw.includes("| DR |")) throw new Error(`${ticker} is an NVDR on a DR`);
    if (!nvdr) continue;
    const isin = isinOf(symbol.isin) || fallback.get(ticker) || "";
    if (!isin) {
      dropped.push({ ticker, reason: "no ISIN" });
      continue;
    }
    const name = normalize(symbol.description) || `${base.name} NVDR`;
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: "XBKK",
      currency: "THB",
      type: base.type,
      isin,
      raw: [ticker, name, "NVDR", `NVDR of ${base.ticker}`, isin, `last trade ${day(trades.get(ticker)) || "none"}`].join(" | "),
    });
  }

  const missing = [...companies.keys()].filter((symbol) => !lines.has(symbol));
  for (const symbol of missing) dropped.push({ ticker: symbol, reason: "on SET's file, unknown to TradingView" });

  const order = { STOCK: 0, ETF: 1, ETC: 2, FUND: 3 };
  rows.sort((a, b) => order[a.type] - order[b.type] || a.ticker.localeCompare(b.ticker));

  const must = ["PTT", "ADVANC", "CPALL", "CPNREIT", "DIF", "TDEX", "1DIV", ...(nvdr ? ["PTT.R"] : []), ...(dr ? ["AAPL80"] : [])];
  for (const ticker of must) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`SET book misses ${ticker}`);
  }
  if (rows.some((row) => row.ticker === "ACAP")) throw new Error("ACAP is suspended and was kept");
  const local = rows.filter((row) => / \| (SET|mai) \| /.test(row.raw)).length;
  if (local < 750) throw new Error(`only ${local} SET / mai lines`);
  if (dr && rows.filter((row) => row.raw.includes(" | DR | ")).length < 300) throw new Error("too few DRs");
  if (missing.length > 20) throw new Error(`${missing.length} companies of SET's file are unknown to TradingView`);
  return { rows, dropped, suspended: suspended.sort(), quiet: quiet.sort(), warrants, latest: day(latest) };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types; `nvdr` and `dr` keep the NVDR and DR lines.
export async function writeSetCatalogue(here, file, { types = ["STOCK", "ETF", "ETC", "FUND"], nvdr = true, dr = true } = {}) {
  const { rows, suspended, quiet } = await setBook({ nvdr, dr });
  const chosen = rows.filter((row) => types.includes(row.type));
  const kept = stampRows(withoutObligations(chosen));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const count = {};
  for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
  console.error(`${kept.length} SET lines (${Object.entries(count).map(([type, n]) => `${n} ${type}`).join(", ")})`);
  console.error(`${suspended.length} suspended / halted lines left out; ${quiet.length} quiet lines kept`);
  if (chosen.length < rows.length) console.error(`${rows.length - chosen.length} lines of another type left out`);
  if (kept.length < chosen.length) console.error(`${chosen.length - kept.length} bonds left out`);
  return kept;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const book = await setBook();
  const count = {};
  for (const row of book.rows) {
    const board = row.raw.split(" | ")[2];
    const key = `${row.type} ${board}`;
    count[key] = (count[key] || 0) + 1;
  }
  const reasons = {};
  for (const item of book.dropped) {
    const key = item.reason.replace(/ \d{4}-\d{2}-\d{2}/, "");
    reasons[key] = (reasons[key] || 0) + 1;
  }
  console.log(`setBook: ${book.rows.length} rows, latest session ${book.latest}: ${JSON.stringify(count)}`);
  console.log(`dropped ${book.dropped.length} (+ ${book.warrants} warrants): ${JSON.stringify(reasons)}`);
  console.log(`suspended: ${book.suspended.join(", ")}`);
  console.log(`quiet (kept): ${book.quiet.join(", ")}`);
}
