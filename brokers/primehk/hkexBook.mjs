// Every share, REIT and exchange-traded product that can be bought on the
// Stock Exchange of Hong Kong today, for the brokers whose only place is
// HKEX (primehk, upbest, asa, publichk, bancowelllink and the others of the
// same kind).
//
// The list is HKEX's own List of Securities (one line per stock code; an RMB
// or USD counter has its own code). Kept: the categories "Equity" (Main
// Board and GEM shares, investment companies, depositary receipts, trading
// only securities), "Real Estate Investment Trusts" and "Exchange Traded
// Products" (sub-categories "Exchange Traded Funds" and "Leveraged and
// Inverse"). Left out: debt securities, derivative warrants, callable
// bull/bear contracts and equity warrants. ETPs are type ETF (HKEX lists no
// ETN; its gold, crypto and leveraged/inverse products are funds); the rest
// is STOCK, REITs included. Currency is the "Trading Currency" column: HKD,
// USD, and RMB written CNH (the RMB counters trade offshore yuan). ISIN and
// board lot (`lot`) are HKEX's; a code HKEX gives no ISIN takes it from
// ../../assets/stocks.csv / etfs.csv (HKEX:<code>) when one line matches.
// The name is the full name of that asset line, else HKEX's short name.
//
// Each line is then checked against the exchange's latest daily quotations
// (Main Board and trading-only stocks, and GEM), and dropped when:
//   - it is marked "TRADING SUSPENDED" (from a one-day suspension pending
//     an announcement to companies suspended for years and in liquidation;
//     a "#" before the code means the suspension took effect that day);
//   - it has no line in those quotations at all (not trading yet, or
//     withdrawn);
//   - it has never traded: previous close "N/A" and no shares traded that
//     day. That is the six US "trading only" lines of the 2010 Nasdaq pilot
//     (AMGEN-T 04332, CISCO-T 04333, MICROSOFT-T 04338...).
// A line marked "TRADING HALTED" (an intraday halt, normally lifted the next
// session) is kept and reported in `halted`. A line with no trade that day
// is kept (quiet, reported as a count).
//
// Temporary counters are dropped too. When a company changes its board lot
// or consolidates its shares, HKEX opens a second counter (a new code, in
// 029xx on the Main Board, 085xx on GEM) for a few weeks and then closes
// it; the share stays on its original code. The two lines carry the same
// name, or the same stem with a suffix (-OLD, -NEW, -100, -2K...), in the
// same currency. The temporary one is the code in HKEX's temporary ranges
// (02900-02999, 08550-08599), else the higher code (02916 TECHTRONIC-500
// beside 00669 TECHTRONIC-100, 08583 CB GLOBAL-OLD beside 08026 CB
// GLOBAL-NEW, 02942 STAR GROUP ASIA beside 01560, 02948 TR INTERIORS
// beside 06162). Same idea as
// ../moomoous/moomoous_scraping.mjs. In the first phase only the temporary
// counter trades and the original code has no line in the quotations; the
// original code is then kept all the same (it reopens on the new board lot)
// and listed in `reopening`.
//
// Restrictions this module does not apply (they depend on the client, so a
// broker scraper writes them as a remark): leveraged and inverse products
// need a derivatives-knowledge assessment under SFC rules; SPAC shares are
// for professional investors only (none listed on 2026-10-23).
//
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/d261023e.htm   (Main Board, 28 MB; read up to its sales records)
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_G261023.htm
//
// Use:
//   import { hkexBook } from "../primehk/hkexBook.mjs";
//   const { rows, dropped, halted, reopening, quiet, listDate, quoteDate } = await hkexBook();
//
//   node brokers/primehk/hkexBook.mjs      prints the counts

import fs from "node:fs";
import { parseCsv, xlsxRows } from "../jtrust/jp_listings.mjs";

const LIST = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx";
const QUOTES = (yymmdd) => [
  ["Main Board", `https://www.hkex.com.hk/eng/stat/smstat/dayquot/d${yymmdd}e.htm`],
  ["GEM", `https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_G${yymmdd}.htm`],
];
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const KEEP = new Set(["Equity", "Real Estate Investment Trusts", "Exchange Traded Products"]);
const CURRENCY = { RMB: "CNH", CNY: "CNH" };
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const SUFFIX = /^(.*\S)-(OLD|NEW|\d+K?)$/i;
const TEMPORARY_RANGE = /^(029\d\d|085[5-9]\d)$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function fetchBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// ---- List of Securities -----------------------------------------------------

async function listOfSecurities() {
  const grid = xlsxRows(await fetchBytes(LIST), "HKEX List of Securities");
  const asAt = grid.slice(0, 5).map((row) => clean(row[0])).find((cell) => /^Updated as at/i.test(cell)) || "";
  const at = grid.findIndex((row) => clean(row[0]) === "Stock Code");
  if (at < 0) throw new Error("the HKEX list has no Stock Code header");
  const head = grid[at].map(clean);
  const col = (name) => {
    const index = head.indexOf(name);
    if (index < 0) throw new Error(`the HKEX list has no column ${name}`);
    return index;
  };
  const c = { name: col("Name of Securities"), category: col("Category"), sub: col("Sub-Category"), lot: col("Board Lot"), isin: col("ISIN"), currency: col("Trading Currency") };
  const lines = [];
  for (const row of grid.slice(at + 1)) {
    const code = clean(row[0]);
    if (!/^\d{5}$/.test(code)) continue;
    const isin = clean(row[c.isin]).toUpperCase();
    const trading = clean(row[c.currency]).toUpperCase();
    lines.push({
      code,
      name: clean(row[c.name]),
      category: clean(row[c.category]),
      sub: clean(row[c.sub]),
      lot: Number(clean(row[c.lot]).replace(/,/g, "")) || null,
      isin: ISIN.test(isin) ? isin : "",
      currency: CURRENCY[trading] || trading,
    });
  }
  if (lines.length < 10_000) throw new Error(`the HKEX list has ${lines.length} codes`);
  return { lines, asAt: asAt.replace(/^Updated as at\s*/i, "") };
}

// ---- daily quotations -------------------------------------------------------

// code -> { status: "suspended" | "halted" | "quoted", today, previous, volume }
function quoteLines(text, into) {
  let count = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
    const match = line.match(/^([ *#^]*?)\s*(\d{1,5})[ #*]+(\S.*?) +(HKD|USD|CNY|RMB|CNH|EUR|JPY|SGD|AUD|CAD|GBP) +(TRADING SUSPENDED|TRADING HALTED|N\/A|[\d.,]+|-)(.*)$/);
    if (!match) continue;
    const code = match[2].padStart(5, "0");
    const [, mark, , name, , first, rest] = match;
    const status = first === "TRADING SUSPENDED" ? "suspended" : first === "TRADING HALTED" ? "halted" : "quoted";
    const cells = rest.trim().split(/\s+/);
    const volume = status === "quoted" ? Number((cells[cells.length - 1] || "").replace(/,/g, "")) || 0 : 0;
    into.set(code, { status, today: mark.includes("#"), name: clean(name), previous: status === "quoted" && first !== "N/A" && first !== "-" ? Number(first.replace(/,/g, "")) : null, volume });
    count += 1;
  }
  return count;
}

// The Main Board file is read only up to its sales records (the first few MB
// of 28); GEM is small.
async function quotationText(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(180_000) });
  if (!response.ok) return null;
  const decoder = new TextDecoder("latin1");
  let text = "";
  for await (const chunk of response.body) {
    text += decoder.decode(chunk, { stream: true });
    if (/CODE\s+NAME OF STOCK\s+SALES RECORD/.test(text.slice(-300_000))) break;
  }
  const at = text.indexOf('name = "quotations"');
  if (at < 0) return null;
  return text.slice(at).split(/CODE\s+NAME OF STOCK\s+SALES RECORD/)[0];
}

// The latest trading day of the last ten (Hong Kong time) with both files.
export async function hkexQuotations() {
  for (let back = 0; back < 10; back += 1) {
    const day = new Date(Date.now() + 8 * 3600_000 - back * 86_400_000).toISOString().slice(0, 10);
    const yymmdd = day.slice(2).replace(/-/g, "");
    const quotes = new Map();
    const counts = {};
    let ok = true;
    for (const [board, url] of QUOTES(yymmdd)) {
      let text = null;
      try {
        text = await quotationText(url);
      } catch {
        text = null;
      }
      if (!text) { ok = false; break; }
      counts[board] = quoteLines(text, quotes);
      await sleep(1000);
    }
    if (ok && counts["Main Board"] > 5000 && counts.GEM > 200) return { day, quotes, counts, urls: QUOTES(yymmdd).map(([, url]) => url) };
    await sleep(800);
  }
  throw new Error("no HKEX daily quotations in the last ten days");
}

// ---- asset lists (ISIN fallback and full names) ------------------------------

function assetLines() {
  const byCode = new Map();
  for (const file of [STOCKS, ETFS]) {
    if (!fs.existsSync(file)) continue;
    const rows = parseCsv(fs.readFileSync(file, "utf8"));
    const head = rows[0];
    const t = head.indexOf("ticker");
    const i = head.indexOf("isin");
    const n = head.indexOf("name");
    for (const row of rows.slice(1)) {
      const ticker = row[t] || "";
      if (!ticker.startsWith("HKEX:")) continue;
      const code = ticker.slice(5);
      if (!/^\d{1,5}$/.test(code)) continue;
      const key = code.padStart(5, "0");
      byCode.set(key, [...(byCode.get(key) || []), { isin: (row[i] || "").toUpperCase(), name: clean(row[n]) }]);
    }
  }
  return byCode;
}

// ---- the book ----------------------------------------------------------------

export async function hkexBook() {
  const list = await listOfSecurities();
  await sleep(1000);
  const quotations = await hkexQuotations();
  const assets = assetLines();

  const kept = list.lines.filter((line) => KEEP.has(line.category));
  const outOfScope = {};
  for (const line of list.lines) if (!KEEP.has(line.category)) outOfScope[line.category || "(blank)"] = (outOfScope[line.category || "(blank)"] || 0) + 1;

  // Temporary counters: same stem and currency; the one in a temporary
  // range, else the higher code.
  const byStem = new Map();
  for (const line of kept) {
    const stem = `${(line.name.match(SUFFIX)?.[1] || line.name).toUpperCase()}|${line.currency}`;
    byStem.set(stem, [...(byStem.get(stem) || []), line]);
  }
  const temporary = new Map();
  const temporaryOf = new Map();
  for (const lines of byStem.values()) {
    if (lines.length < 2) continue;
    const [main, ...others] = [...lines].sort((a, b) => TEMPORARY_RANGE.test(a.code) - TEMPORARY_RANGE.test(b.code) || a.code.localeCompare(b.code));
    for (const line of others) temporary.set(line.code, `${main.code} ${main.name}`);
    temporaryOf.set(main.code, others.map((line) => line.code));
  }

  const rows = [];
  const dropped = [];
  const halted = [];
  const reopening = [];
  let quiet = 0;
  for (const line of kept) {
    const quote = quotations.quotes.get(line.code);
    const drop = (reason) => dropped.push({ ticker: line.code, name: line.name, reason });
    if (temporary.has(line.code)) { drop(`temporary counter (main counter ${temporary.get(line.code)})`); continue; }
    if (!quote) {
      const open = (temporaryOf.get(line.code) || []).find((code) => quotations.quotes.get(code)?.status === "quoted");
      if (!open) { drop(`not in the ${quotations.day} daily quotations`); continue; }
      reopening.push(`${line.code} ${line.name} (trading on ${open} meanwhile)`);
    }
    else if (quote.status === "suspended") { drop(quote.today ? `suspended from ${quotations.day}` : "suspended"); continue; }
    else if (quote.status === "quoted" && quote.previous == null && !quote.volume) { drop("never traded (previous close N/A)"); continue; }
    else if (quote.status === "halted") halted.push(`${line.code} ${line.name}`);
    else if (!quote.volume) quiet += 1;

    const matches = assets.get(line.code) || [];
    const isinMatches = [...new Set(matches.map((m) => m.isin).filter((isin) => ISIN.test(isin)))];
    const isin = line.isin || (isinMatches.length === 1 ? isinMatches[0] : "");
    const named = matches.find((m) => m.isin === isin && m.name) || (matches.length === 1 ? matches[0] : null);
    const type = line.category === "Exchange Traded Products" ? "ETF" : "STOCK";
    rows.push({
      query: isin || line.code,
      ticker: line.code,
      name: line.currency === "HKD" && named?.name ? named.name : line.name,
      exchange: "HKEX",
      mic: "XHKG",
      currency: line.currency,
      type,
      isin,
      raw: [line.code, line.name, line.category, line.sub, line.currency, `lot ${line.lot ?? "?"}`].filter(Boolean).join(" | "),
      lot: line.lot,
    });
  }
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  if (rows.length < 2500) throw new Error(`only ${rows.length} HKEX lines kept`);
  if (dropped.length > 400) throw new Error(`${dropped.length} HKEX lines dropped, check the quotations`);
  return {
    rows,
    dropped,
    halted,
    reopening,
    quiet,
    outOfScope,
    listDate: list.asAt,
    quoteDate: quotations.day,
    urls: [LIST, ...quotations.urls],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const book = await hkexBook();
  const by = (rows, key) => rows.reduce((acc, row) => ((acc[key(row)] = (acc[key(row)] || 0) + 1), acc), {});
  const reasons = by(book.dropped, (item) => item.reason.replace(/ \(main counter.*\)$/, ""));
  console.log(`hkexBook: ${book.rows.length} rows, list as at ${book.listDate}, quotations ${book.quoteDate}`);
  console.log("by type", by(book.rows, (row) => row.type), "by currency", by(book.rows, (row) => row.currency));
  console.log(`ISIN ${book.rows.filter((row) => row.isin).length}/${book.rows.length}; no ISIN: ${book.rows.filter((row) => !row.isin).map((row) => `${row.ticker} ${row.name}`).join(", ") || "none"}`);
  console.log("dropped", reasons);
  console.log("dropped (not suspended):", book.dropped.filter((item) => item.reason !== "suspended").map((item) => `${item.ticker} ${item.name} [${item.reason}]`).join("; "));
  console.log(`halted (kept): ${book.halted.join(", ") || "none"}; no trade that day (kept): ${book.quiet}`);
  console.log(`reopening (kept): ${book.reopening.join(", ") || "none"}`);
  console.log("out of scope", book.outOfScope);
}
