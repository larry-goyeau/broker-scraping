// The Nasdaq Helsinki book, for the Finnish banks whose only place is the
// Helsinki exchange and which print no list of their own (Aktia). The book
// is every line Nasdaq's own Nordic screeners show for Helsinki, minus the
// suspended and untraded ones.
//
// Source, public, no login: the screeners behind nasdaq.com's "European
// market activity" pages (shares, ETF), which answer every line with its
// order book id, symbol, name, ISIN, trading currency and prices. Each
// line's summary page gives the ISIN, the trading currency, the venue of
// execution and Nasdaq's status note ("Observation status", a
// suspension...).
//   https://www.nasdaq.com/european-market-activity/shares
//   https://api.nasdaq.com/api/nordic/screener/shares?category=MAIN_MARKET&market=HEL&tableonly=true&size=500&page=1
//   https://api.nasdaq.com/api/nordic/screener/shares?category=FIRST_NORTH&market=HEL&tableonly=true&size=500&page=1
//   https://api.nasdaq.com/api/nordic/screener/etp?category=ETF&market=HEL&tableonly=true&size=500&page=1
//   https://api.nasdaq.com/api/nordic/instruments/<orderbookId>/summary?assetClass=<SHARES|ETF>
//
// Kept (exchange "Nasdaq Helsinki", MIC XHEL, as the Nordnet, DNB and
// IBKR scrapers write it):
// - Main market shares, Large, Mid and Small Cap (148 lines in October
//   2026, Finnish or foreign: Nordea "NDA FI", Sampo, Stora Enso A and R,
//   Kone...). Type STOCK. A share on "Observation status" still trades and
//   stays; raw ends with "| Observation status".
// - ETFs (one in October 2026, Seligson & Co OMX Helsinki 25 UCITS ETF).
//   Type ETF. Nasdaq lists no ETN, ETC or AIF in Helsinki (the ETN and AIF
//   screeners answer 400 for HEL).
// - Currency: the line's trading currency on Nasdaq (every Helsinki line
//   trades in EUR in October 2026).
// Left out:
// - A line whose summary note says it is suspended, halted, delisted or in
//   liquidation, and a line with no last price at all (Dovre Group and
//   Lehto Group in October 2026: no price, no bid, no ask, no volume).
// - First North Finland (MIC FSME in this repo): another market and
//   another place in broker-list.json ("First North Helsinki"). `firstNorth:
//   true` adds it as exchange "First North Helsinki", MIC FSME (the Nordnet
//   labels), for a broker whose pages say it trades there.
// - Bonds, warrants, certificates, turbos and structured products: other
//   screeners, not read. The Finnish mutual funds have no order book on
//   Nasdaq Helsinki.
//
// Calls: two or three screener pages, then one summary per line (about
// 150, or 200 with First North), 150 ms apart. The summaries are cached for
// 12 hours in helsinki-summaries.json next to this file, so a second broker
// run the same day makes only the screener calls.
//
// Use:
//   import { writeHelsinkiCatalogue } from "../aktia/helsinkiBook.mjs";
//   await writeHelsinkiCatalogue(import.meta.url, "aktia-parsed.json");
//   // options: { firstNorth: false, types: ["STOCK", "ETF"] }
//   // or: const { listed, suspended, leftOut } = await helsinkiBook({ firstNorth });
//
//   node brokers/aktia/helsinkiBook.mjs [--first-north]     (prints the counts, writes nothing)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api.nasdaq.com/api/nordic";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CACHE = new URL("helsinki-summaries.json", import.meta.url);
const CACHE_HOURS = 12;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const DEAD_NOTE = /suspen|halt|delist|liquidat|bankrupt|stopped|removed/i;

const MAIN = { exchange: "Nasdaq Helsinki", mic: "XHEL" };
const FIRST_NORTH = { exchange: "First North Helsinki", mic: "FSME" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const noPrice = (value) => !clean(value) || clean(value) === "-";

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

async function screener(path, params) {
  const found = [];
  let page = 1;
  let pages = 1;
  while (page <= pages) {
    const query = new URLSearchParams({ ...params, size: "500", page: String(page) });
    const body = await getJson(`${API}/screener/${path}?${query}`);
    if (body?.status?.rCode !== 200) throw new Error(`${path} ${JSON.stringify(params)} answered ${body?.status?.rCode || "nothing"}`);
    const rows = body.data?.instrumentListing?.rows;
    if (!Array.isArray(rows)) throw new Error(`${path} ${JSON.stringify(params)} has no rows`);
    pages = body.data?.pagination?.totalPages || 1;
    found.push(...rows);
    page += 1;
    await sleep(300);
  }
  return found;
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
}

async function summaries(lines) {
  const cache = readCache();
  const fresh = Date.now() - CACHE_HOURS * 3600_000;
  let asked = 0;
  for (const line of lines) {
    const hit = cache[line.id];
    if (hit && hit.at > fresh) continue;
    const body = await getJson(`${API}/instruments/${encodeURIComponent(line.id)}/summary?assetClass=${line.assetClass}`);
    const data = body?.data?.summaryData;
    if (body?.status?.rCode !== 200 || !data) throw new Error(`summary of ${line.symbol} (${line.id}) answered ${body?.status?.rCode || "nothing"}`);
    cache[line.id] = {
      isin: clean(data.isin?.value).toUpperCase(),
      currency: clean(data.ccy?.value || data.currencyEtf?.value || data.currency?.value).toUpperCase(),
      note: clean(data.note?.value),
      venue: clean(data.insExecutionVenue?.value || data.venueOfExecution?.value).toUpperCase(),
      segment: clean(data.insSegment?.value),
      at: Date.now(),
    };
    asked += 1;
    if (asked % 100 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      console.error(`  ${asked} summaries read`);
    }
    await sleep(150);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return cache;
}

export async function helsinkiBook({ firstNorth = false } = {}) {
  const lines = [];
  const add = (rows, book, type, assetClass) => {
    for (const raw of rows) lines.push({ raw, book, type, assetClass, id: clean(raw.orderbookId), symbol: clean(raw.symbol).toUpperCase() });
  };

  const main = await screener("shares", { category: "MAIN_MARKET", market: "HEL", tableonly: "true" });
  if (main.length < 120) throw new Error(`only ${main.length} Helsinki main market shares`);
  add(main, MAIN, "STOCK", "SHARES");
  const etfs = await screener("etp", { category: "ETF", market: "HEL", tableonly: "true" });
  add(etfs, MAIN, "ETF", "ETF");
  if (firstNorth) {
    const fn = await screener("shares", { category: "FIRST_NORTH", market: "HEL", tableonly: "true" });
    if (fn.length < 30) throw new Error(`only ${fn.length} First North Finland shares`);
    add(fn, FIRST_NORTH, "STOCK", "SHARES");
  }

  const seenId = new Set();
  const unique = lines.filter((line) => {
    if (!line.id || seenId.has(line.id)) return false;
    seenId.add(line.id);
    return true;
  });

  const info = await summaries(unique);
  const listed = [];
  const suspended = [];
  const leftOut = [];
  const byIsin = new Map();
  for (const line of unique) {
    const sum = info[line.id] || {};
    const name = clean(line.raw.fullName);
    const isin = ISIN.test(sum.isin) ? sum.isin : clean(line.raw.isin).toUpperCase();
    const currency = clean(line.raw.currency).toUpperCase() || sum.currency;
    if (!line.symbol || !name) throw new Error(`${line.id} has no symbol or name`);
    if (!ISIN.test(isin)) throw new Error(`${line.symbol} (${line.id}) has no ISIN`);
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${line.symbol} has no currency`);
    if (sum.venue && sum.venue !== "XHEL" && sum.venue !== line.book.mic) throw new Error(`${line.symbol} executes on ${sum.venue}`);
    if (DEAD_NOTE.test(sum.note || "")) {
      suspended.push({ ticker: line.symbol, isin, note: sum.note });
      continue;
    }
    if (noPrice(line.raw.lastSalePrice) && noPrice(line.raw.bidPrice) && noPrice(line.raw.askPrice)) {
      leftOut.push(`${line.symbol} (no last price${sum.note ? `, ${sum.note}` : ""})`);
      continue;
    }
    const key = `${isin}|${currency}|${line.book.mic}`;
    if (byIsin.has(key)) {
      leftOut.push(`${line.symbol} (same line as ${byIsin.get(key)})`);
      continue;
    }
    byIsin.set(key, line.symbol);
    const parts = [line.symbol, name, isin, currency];
    if (line.raw.sector) parts.push(clean(line.raw.sector));
    if (sum.segment) parts.push(sum.segment);
    if (sum.note) parts.push(sum.note);
    listed.push({
      query: line.symbol,
      ticker: line.symbol,
      name,
      exchange: line.book.exchange,
      mic: line.book.mic,
      currency,
      type: line.type,
      isin,
      raw: parts.join(" | "),
    });
  }

  const order = { STOCK: 0, ETF: 1 };
  listed.sort((a, b) => b.mic.localeCompare(a.mic) || order[a.type] - order[b.type] || a.ticker.localeCompare(b.ticker));
  for (const ticker of ["NOKIA", "NDA FI", "KNEBV", "SLG OMXH25"]) {
    if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
  }
  return { listed, suspended, leftOut };
}

export async function writeHelsinkiCatalogue(here, file, { types = ["STOCK", "ETF"], firstNorth = false } = {}) {
  const book = await helsinkiBook({ firstNorth });
  const rows = book.listed.filter((row) => types.includes(row.type)).map((row) => ({ ...row }));
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  report(book, kept);
  return kept;
}

function report(book, kept) {
  const counts = {};
  for (const row of kept) {
    const key = `${row.mic} ${row.type} ${row.currency}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.error(`${kept.length} Helsinki lines ${JSON.stringify(counts)}`);
  console.error(`${book.suspended.length} suspended left out${book.suspended.length ? `: ${book.suspended.map((line) => `${line.ticker} (${line.note})`).join(", ")}` : ""}`);
  if (book.leftOut.length) console.error(`left out: ${book.leftOut.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const book = await helsinkiBook({ firstNorth: process.argv.includes("--first-north") });
  report(book, book.listed);
}
