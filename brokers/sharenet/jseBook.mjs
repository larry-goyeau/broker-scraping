// The Johannesburg Stock Exchange (JSE, MIC XJSE) book, for the brokers
// whose only place is the JSE (Sharenet Securities). It is every line of
// the JSE equity market a client can buy, Main Board and AltX, in rand:
//   - ordinary shares, REITs and listed investment companies, local and
//     inward-listed (Anglo American, BHP, Glencore, Investec plc...);
//   - preference shares (equity: they trade on the same order book);
//   - exchange-traded funds and actively managed ETFs (commodity ETFs such
//     as NewGold included, as in the other JSE catalogues: etfsa,
//     easyequities);
//   - exchange-traded notes and actively managed certificates (AMCs, notes
//     issued by Standard Bank, Absa or UBS on a managed basket), both ETN.
//
// The JSE site (jse.co.za and clientportal.jse.co.za: the listed-companies
// list, the instrument and suspension lists) answers every script call with
// a Cloudflare "Attention Required" 403, so it cannot be read. What is read:
//   - TradingView's symbol search on exchange JSE, blank text and then each
//     letter and digit, for stocks, funds and the rest (structured lines,
//     and preference shares filed as bonds), for every line with its ISIN
//     (the blank listing alone skips most of them):
//       https://symbol-search.tradingview.com/symbol_search/v3/?text=&exchange=JSE&lang=en&domain=production&search_type=stocks
//   - TradingView's South Africa scanner, for the date of each line's last
//     daily bar:
//       https://scanner.tradingview.com/rsa/scan
//   - Sharenet's free share page of each line, which names the JSE sector
//     (the JSE's own classification: an industry, or "Exchange Traded
//     Funds", "ACTIVELY MANAGED ETF", "Exchange Traded Notes", "Actively
//     Managed Certificates", "Preference Shares", "Warrants"...) and, for a
//     suspended line, opens with "This share has been suspended...":
//       https://www.sharenet.co.za/v3/quickshare.php?scode=NPN
//
// What stays out (2026-10-25: 591 lines kept, 23 left out):
//   - a line Sharenet marks suspended: 11, Tongaat Hulett TON (removal from
//     the list announced 12 October 2026), Trustco TTO, Efora EEL, Kibo KBO,
//     Sail Mining SGP, Sable SXM, aReit APO, African Dawn ADW, Labat LAB,
//     Visual VIS and the Reitway property ETF RWDVF;
//   - a line Sharenet does not know (no share page): delisted (none on
//     2026-10-25; Balwin BWN, delisted, is no longer on TradingView either);
//   - a line the scanner carries with no daily bar at all (never traded):
//     the Investec Bank (Mauritius) credit-linked preference shares IMRP1-12;
//   - warrants (JSE sector "Warrants"), Krugerrands, "Investment Products"
//     (IMRP13, IMRP14), "Other Securities", indices. The JSE files four AMCs
//     under "Warrants" (ABAM1, ABAM2, UNICRN, UNPWGP) and an Investec ETN
//     under "Investment Products" (IBLVR4); their names say AMC or ETN, and
//     they are kept as ETN, as etfSA sells them;
//   - a line with no ISIN (TradingView's, else assets/stocks.csv or
//     assets/etfs.csv "JSE:<ticker>"; none on 2026-10-25).
// A line that is not suspended but has not traded for 30 days or more is
// kept, and reported as quiet (24 on 2026-10-25, e.g. Nampak's preference
// shares NPKP, NPP1): the JSE keeps it on the board. The scanner carries no
// "structured" line (most AMCs and UBS trackers) and none of the preference
// shares TradingView files as bonds (SBKP, CPIP, INPP...): those 97 lines
// have no trade date and are kept on Sharenet's word (`unchecked`).
//
// Names are TradingView's, except an ETN, which takes the name etfSA's
// list (or another JSE catalogue, same code and ISIN) gives it: TradingView
// names most AMCs and trackers after the issuing bank.
//
// TradingView quotes JSE lines in cents (ZAC). The rows say ZAR, the
// trading currency, as the other JSE catalogues do.
//
// The crawl (about 150 TradingView calls and 610 Sharenet pages, three
// at a time with a pause; about 25 minutes, Sharenet is slow) is kept for
// 12 hours in the system temp folder (jse-sharenet-book-cache.json), so the
// scrapers run back to back read the sources once.
//
// Use:
//   import { jseBook, writeJseCatalogue } from "../sharenet/jseBook.mjs";
//   const { rows, dropped, suspended, quiet, unchecked } = await jseBook();
//   rows: { query, ticker, name, exchange: "JSE", mic: "XJSE",
//           currency: "ZAR", type: STOCK|ETF|ETN, isin, raw }
//   raw: "ticker | name | JSE sector | isin | last trade <date|unknown>"
//   await writeJseCatalogue(import.meta.url, "<folder>-parsed.json", { types });
//
//   node brokers/sharenet/jseBook.mjs      prints the counts

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueRows } from "../../catalogues.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const SCANNER = "https://scanner.tradingview.com/rsa/scan";
const QUICKSHARE = "https://www.sharenet.co.za/v3/quickshare.php?scode=";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const TV = { "User-Agent": UA, Origin: "https://www.tradingview.com" };
const CACHE = path.join(os.tmpdir(), "jse-sharenet-book-cache.json");
const CACHE_HOURS = 12;
const DAY = 86400;
const QUIET_DAYS = 30;
const ROOT = new URL("../../", import.meta.url);

// JSE sector codes of Sharenet's "Additional" group: what each line is.
// "ALT" is the bare AltX code a few AltX shares carry (Numeral, XII).
const PRODUCT = {
  "0000A311": "ETF",
  "0000A312": "ETF",
  "0000A321": "ETN",
  "0000A322": "ETN",
  "0000A221": "STOCK",
  ALT: "STOCK",
};
const OUT = {
  "0000A131": "warrant",
  "0000A111": "Krugerrand",
  "0000A151": "investment product (not a share or an exchange-traded product)",
  "0000A911": "other security",
};
// The JSE files a few AMCs under "Warrants" (ABAM1, ABAM2, UNICRN, UNPWGP)
// and an Investec ETN under "Investment Products" (IBLVR4); their names say
// what they are.
const NOTE_NAME = /\bAMC\b|Actively Managed Certificate|\bETN\b|ETN\d|Tracker/i;

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

// Every JSE line TradingView names, indices aside.
async function searchAll() {
  const lines = new Map();
  for (const type of ["stocks", "funds", ""]) {
    for (const text of ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"]) {
      let start = 0;
      for (;;) {
        const url = `${SEARCH}?text=${encodeURIComponent(text)}&exchange=JSE&lang=en&domain=production&search_type=${type}&start=${start}`;
        const body = await get(url, { headers: TV });
        if (!Array.isArray(body.symbols) || !Number.isInteger(body.symbols_remaining)) throw new Error(`no page for ${url}`);
        for (const symbol of body.symbols) {
          const ticker = normalize(symbol.symbol).toUpperCase();
          if (symbol.exchange === "JSE" && ticker && symbol.type !== "index") lines.set(ticker, symbol);
        }
        start += body.symbols.length;
        await sleep(250);
        if (!body.symbols.length || body.symbols_remaining <= 0) break;
      }
    }
  }
  if (lines.size < 550) throw new Error(`TradingView names only ${lines.size} JSE lines`);
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
      body: JSON.stringify({ columns: ["time"], symbols: { tickers: chunk.map((t) => `JSE:${t}`) } }),
    });
    for (const row of body.data || []) out.set(String(row.s).slice(4), row.d?.[0] ?? null);
    await sleep(700);
  }
  return out;
}

// Sharenet's share page: { known, suspended, short, long, sector, code }.
function readQuickshare(html) {
  const start = html.indexOf("GENERAL SHARE INFORMATION");
  if (start < 0) return { known: false };
  const table = html.slice(start, html.indexOf("</table>", start));
  const cell = (label) => {
    const match = table.match(new RegExp(`<b>\\s*${label}\\s*</b>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)</td>`, "i"));
    return match ? normalize(match[1].replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")) : "";
  };
  const sectorText = cell("JSE SECTOR");
  const sector = sectorText.match(/^(.*?)\s*\(([0-9A-Z]{2,8})\)/);
  return {
    known: true,
    suspended: /This share has been suspended/i.test(table),
    short: cell("SHORT NAME"),
    long: cell("LONG NAME"),
    sector: sector ? normalize(sector[1]) : sectorText,
    code: sector ? sector[2] : "",
  };
}

// A Sharenet page takes about six seconds to come back; three are read at
// a time, each reader pausing between pages.
async function sharenet(tickers) {
  const out = new Map();
  let cursor = 0;
  async function reader() {
    while (cursor < tickers.length) {
      const ticker = tickers[cursor];
      cursor += 1;
      const html = await get(QUICKSHARE + encodeURIComponent(ticker), { headers: { "User-Agent": UA, Accept: "text/html" } }, "text");
      out.set(ticker, readQuickshare(html));
      await sleep(800);
    }
  }
  await Promise.all([reader(), reader(), reader()]);
  return out;
}

// assets/stocks.csv and etfs.csv: the ISIN and name of each JSE ticker.
function sharedLines() {
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
      const name = normalize(line.split(",").slice(3).join(","));
      if (exchange === "JSE" && isinOf(isin)) out.set(ticker.slice(4).toUpperCase(), { isin: isin.toUpperCase(), name });
    }
  }
  return out;
}

// The product name other JSE catalogues give each ETN, by JSE code (etfSA's
// PDF names every AMC and ETN), for the ETNs TradingView names after the
// issuing bank. A row whose ISIN differs from TradingView's is not used.
function noteNames() {
  const out = new Map();
  for (const row of catalogueRows()) {
    if (row.broker === "sharenet" || row.mic !== "XJSE" || row.type !== "ETN" || !row.ticker || !row.name) continue;
    const ticker = String(row.ticker).toUpperCase();
    if (!out.has(ticker) || row.broker === "etfsa") out.set(ticker, { name: normalize(row.name), isin: isinOf(row.isin) });
  }
  return out;
}

async function crawl() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3600_000 && cached.lines?.length) {
      console.error(`JSE book read from ${CACHE}`);
      return { lines: new Map(cached.lines), trades: new Map(cached.trades), pages: new Map(cached.pages) };
    }
  } catch {}
  const lines = await searchAll();
  const tickers = [...lines.keys()].sort();
  const trades = await lastTrades(tickers);
  console.error(`${lines.size} JSE lines on TradingView; reading Sharenet's share pages`);
  const pages = await sharenet(tickers);
  try {
    fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), lines: [...lines], trades: [...trades], pages: [...pages] }));
  } catch {}
  return { lines, trades, pages };
}

// Every JSE line that can be bought today, as catalogue rows sorted by type
// then ticker. `dropped` names each line left out and why, `suspended` the
// lines Sharenet marks suspended, `quiet` the kept lines with no trade for
// 30 days or more.
export async function jseBook() {
  const { lines, trades, pages } = await crawl();
  const fallback = sharedLines();
  const notes = noteNames();
  const latest = Math.max(...[...trades.values()].filter(Boolean));
  const rows = [];
  const dropped = [];
  const suspended = [];
  const quiet = [];
  const unchecked = [];

  for (const [ticker, symbol] of lines) {
    const page = pages.get(ticker) || { known: false };
    if (!page.known) {
      dropped.push({ ticker, reason: "no Sharenet share page (delisted)" });
      continue;
    }
    if (page.suspended) {
      dropped.push({ ticker, reason: "suspended" });
      suspended.push(ticker);
      continue;
    }
    const noteByName = (page.code === "0000A131" || page.code === "0000A151") && NOTE_NAME.test(`${page.long} ${symbol.description}`);
    if (OUT[page.code] && !noteByName) {
      dropped.push({ ticker, reason: OUT[page.code] });
      continue;
    }
    const type = noteByName ? "ETN" : PRODUCT[page.code] || (/^\d{8}$/.test(page.code) ? "STOCK" : "");
    if (!type) {
      dropped.push({ ticker, reason: `JSE sector ${page.sector || "none"} (${page.code || "no code"})` });
      continue;
    }
    // The scanner carries no "structured" line and no preference share
    // TradingView files as a bond: those have no trade date, and are kept
    // on Sharenet's word that they are listed and not suspended.
    const time = trades.get(ticker);
    if (!trades.has(ticker)) unchecked.push(ticker);
    else if (!time) {
      dropped.push({ ticker, reason: "never traded" });
      continue;
    }
    const last = time ? day(time) : "unknown";
    if (time && (latest - time) / DAY >= QUIET_DAYS) quiet.push(`${ticker} ${last}`);
    const isin = isinOf(symbol.isin) || fallback.get(ticker)?.isin || "";
    if (!isin) {
      dropped.push({ ticker, reason: "no ISIN" });
      continue;
    }
    // TradingView names many ETNs after the issuing bank ("Investec Bank
    // Limited"); etfSA's list or the shared list names the product.
    const shared = fallback.get(ticker);
    const note = notes.get(ticker);
    const noteName = type === "ETN" ? (note && (!note.isin || note.isin === isin) && note.name) || (shared?.isin === isin && shared.name) : "";
    const name = noteName || normalize(symbol.description) || page.long;
    if (!name) throw new Error(`JSE ${ticker} has no name`);
    const currency = normalize(symbol.currency_code).toUpperCase() || "ZAC";
    if (currency !== "ZAC" && currency !== "ZAR") throw new Error(`JSE ${ticker} is quoted ${currency}`);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "JSE",
      mic: "XJSE",
      currency: "ZAR",
      type,
      isin,
      raw: [ticker, name, page.sector || page.code, isin, `last trade ${last}`].join(" | "),
    });
  }

  const order = { STOCK: 0, ETF: 1, ETN: 2 };
  rows.sort((a, b) => order[a.type] - order[b.type] || a.ticker.localeCompare(b.ticker));

  for (const ticker of ["NPN", "SOL", "AGL", "BHG", "SBKP", "STX40", "GLD", "AMC001"]) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`JSE book misses ${ticker}`);
  }
  if (rows.some((row) => row.ticker === "TON")) throw new Error("TON is suspended and was kept");
  const count = (type) => rows.filter((row) => row.type === type).length;
  if (count("STOCK") < 250) throw new Error(`only ${count("STOCK")} JSE shares`);
  if (count("ETF") < 100) throw new Error(`only ${count("ETF")} JSE ETFs`);
  if (count("ETN") < 100) throw new Error(`only ${count("ETN")} JSE ETNs`);
  const unknown = dropped.filter((item) => item.reason.startsWith("no Sharenet")).length;
  if (unknown > 40) throw new Error(`${unknown} JSE lines have no Sharenet page`);
  return { rows, dropped, suspended: suspended.sort(), quiet: quiet.sort(), unchecked: unchecked.sort(), latest: day(latest) };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types.
export async function writeJseCatalogue(here, file, { types = ["STOCK", "ETF", "ETN"] } = {}) {
  const { rows, suspended, quiet } = await jseBook();
  const chosen = rows.filter((row) => types.includes(row.type));
  const kept = stampRows(withoutObligations(chosen));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const count = {};
  for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
  console.error(`${kept.length} JSE lines (${Object.entries(count).map(([type, n]) => `${n} ${type}`).join(", ")})`);
  console.error(`${suspended.length} suspended lines left out; ${quiet.length} quiet lines kept`);
  if (chosen.length < rows.length) console.error(`${rows.length - chosen.length} lines of another type left out`);
  if (kept.length < chosen.length) console.error(`${chosen.length - kept.length} bonds left out`);
  return kept;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const book = await jseBook();
  const count = {};
  for (const row of book.rows) count[row.type] = (count[row.type] || 0) + 1;
  const reasons = {};
  for (const item of book.dropped) reasons[item.reason] = (reasons[item.reason] || 0) + 1;
  console.log(`jseBook: ${book.rows.length} rows, latest session ${book.latest}: ${JSON.stringify(count)}`);
  console.log(`dropped ${book.dropped.length}: ${JSON.stringify(reasons)}`);
  for (const item of book.dropped) console.log(`  ${item.ticker}: ${item.reason}`);
  console.log(`suspended: ${book.suspended.join(", ")}`);
  console.log(`quiet (kept): ${book.quiet.join(", ")}`);
  console.log(`no trade data (kept): ${book.unchecked.length}`);
}
