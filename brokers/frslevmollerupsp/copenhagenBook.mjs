// The Nasdaq Copenhagen book, for the Danish banks whose only place is the
// Copenhagen exchange and which print no list of their own (Frøslev-Mollerup
// Sparekasse, Lægernes Bank). The book is every line Nasdaq's own Nordic
// screeners show for Copenhagen, minus the suspended and never-traded ones.
//
// Source, public, no login: the screeners behind nasdaq.com's "European
// market activity" pages (shares, ETF, funds, AIF), which answer every line
// with its order book id, symbol, name and prices, and, for shares and
// ETFs, the ISIN and trading currency. Each line's summary page gives the
// ISIN, the trading currency and Nasdaq's status note ("Observation
// status", a suspension...).
//   https://www.nasdaq.com/european-market-activity/shares
//   https://api.nasdaq.com/api/nordic/screener/shares?category=MAIN_MARKET&market=CPH&tableonly=true&size=500&page=1
//   https://api.nasdaq.com/api/nordic/screener/shares?category=FIRST_NORTH&market=CPH&tableonly=true&size=500&page=1
//   https://api.nasdaq.com/api/nordic/screener/etp?category=ETF&market=CPH&tableonly=true&size=500&page=1
//   https://api.nasdaq.com/api/nordic/screener/etp?category=AIF&market=CPH&tableonly=true&size=500&page=1
//   https://api.nasdaq.com/api/nordic/screener/funds?tableonly=false&fundType=<type>&size=500&page=1
//   https://api.nasdaq.com/api/nordic/instruments/<orderbookId>/summary?assetClass=<SHARES|ETF|AIF|FUNDS>
//
// Kept (exchange "Nasdaq Copenhagen", MIC XCSE, as the Nordnet, DNB and
// IBKR scrapers write it):
// - Main market shares, Large, Mid and Small Cap (117 in October 2026),
//   Danish or foreign (Nordea "NDA DK", Sampo, Boozt, Trifork...). Type
//   STOCK. A share on "Observation status" still trades and stays; raw
//   ends with "| Observation status".
// - ETFs (one in October 2026, XACT OMXC25 ESG). Type ETF. Nasdaq lists no
//   ETN or ETC in Copenhagen (the ETN screener only answers for Stockholm).
// - Danish investment funds ("investeringsforeninger" and
//   "kapitalforeninger", about 490) and the listed AIFs (Accunia CLO
//   funds, Artha Optimum, BI Erhvervsejendomme, Ress Life Investments).
//   They have an order book on Nasdaq Copenhagen and trade like a share;
//   Endavu keeps them as FUND the same way. Type FUND; raw names the
//   Nasdaq fund category. `funds: false` leaves them out.
// - Currency: the line's trading currency on Nasdaq (DKK; Ress Life
//   Investments trades in EUR).
// Left out:
// - A line whose summary note says it is suspended, halted, delisted or in
//   liquidation, and a line with no last price at all (never traded).
// - First North Denmark (MIC DSME): another market and another place in
//   broker-list.json. `firstNorth: true` adds it as exchange "First North
//   Denmark", MIC DSME (the Nordnet labels), for a broker whose pages say
//   it trades there.
// - Bonds, mortgage bonds, warrants, certificates and structured products:
//   other screeners, not read.
//
// Calls: four or five screener pages plus eight fund-category pages, then
// one summary per line (about 615), 150 ms apart. The summaries are cached
// for 12 hours in copenhagen-summaries.json next to this file, so a second
// broker run the same day makes only the screener calls.
//
// Use:
//   import { writeCopenhagenCatalogue } from "../frslevmollerupsp/copenhagenBook.mjs";
//   await writeCopenhagenCatalogue(import.meta.url, "lgernes-parsed.json");
//   // options: { funds: true, firstNorth: false, types: ["STOCK", "ETF", "FUND"] }
//   // or: const { listed, suspended, leftOut } = await copenhagenBook({ funds, firstNorth });
//
//   node brokers/frslevmollerupsp/copenhagenBook.mjs     (prints the counts, writes nothing)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api.nasdaq.com/api/nordic";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CACHE = new URL("copenhagen-summaries.json", import.meta.url);
const CACHE_HOURS = 12;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const DEAD_NOTE = /suspen|halt|delist|liquidat|stopped|removed/i;

const MAIN = { exchange: "Nasdaq Copenhagen", mic: "XCSE" };
const FIRST_NORTH = { exchange: "First North Denmark", mic: "DSME" };

const FUND_TYPES = {
  INVESTMENT_FUNDS_SHARES: "Investment fund, shares",
  INVESTMENT_FUNDS_BONDS: "Investment fund, bonds",
  INVESTMENT_FUNDS_BALANCED: "Investment fund, balanced",
  INVESTMENT_FUNDS_HEDGE_ASSOCIATIONS: "Investment fund, hedge",
  CAPITAL_ASSOCIATIONS_SHARES: "Capital association, shares",
  CAPITAL_ASSOCIATIONS_BONDS: "Capital association, bonds",
  CAPITAL_ASSOCIATIONS_BALANCED: "Capital association, balanced",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

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

async function screener(path, params, { allowEmpty = false } = {}) {
  const found = [];
  let page = 1;
  let pages = 1;
  while (page <= pages) {
    const query = new URLSearchParams({ ...params, size: "500", page: String(page) });
    const body = await getJson(`${API}/screener/${path}?${query}`);
    if (body?.status?.rCode !== 200) throw new Error(`${path} ${JSON.stringify(params)} answered ${body?.status?.rCode || "nothing"}`);
    const rows = body.data?.instrumentListing?.rows ?? (allowEmpty && body.data ? [] : undefined);
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

export async function copenhagenBook({ funds = true, firstNorth = false } = {}) {
  const lines = [];
  const add = (rows, book, type, assetClass, tag) => {
    for (const raw of rows) lines.push({ raw, book, type, assetClass, tag, id: clean(raw.orderbookId), symbol: clean(raw.symbol).toUpperCase() });
  };

  const main = await screener("shares", { category: "MAIN_MARKET", market: "CPH", tableonly: "true" });
  if (main.length < 100) throw new Error(`only ${main.length} Copenhagen main market shares`);
  add(main, MAIN, "STOCK", "SHARES", "");
  const etfs = await screener("etp", { category: "ETF", market: "CPH", tableonly: "true" });
  add(etfs, MAIN, "ETF", "ETF", "");
  if (firstNorth) {
    const fn = await screener("shares", { category: "FIRST_NORTH", market: "CPH", tableonly: "true" });
    if (fn.length < 15) throw new Error(`only ${fn.length} First North Denmark shares`);
    add(fn, FIRST_NORTH, "STOCK", "SHARES", "");
  }
  if (funds) {
    const aif = await screener("etp", { category: "AIF", market: "CPH", tableonly: "true" });
    add(aif, MAIN, "FUND", "AIF", "AIF");
    const all = await screener("funds", { tableonly: "true" });
    if (all.length < 300) throw new Error(`only ${all.length} Copenhagen investment funds`);
    const category = new Map();
    for (const [key, label] of Object.entries(FUND_TYPES)) {
      for (const row of await screener("funds", { tableonly: "true", fundType: key }, { allowEmpty: true })) category.set(clean(row.orderbookId), label);
    }
    for (const row of all) lines.push({ raw: row, book: MAIN, type: "FUND", assetClass: "FUNDS", tag: category.get(clean(row.orderbookId)) || "Investment fund", id: clean(row.orderbookId), symbol: clean(row.symbol).toUpperCase() });
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
    if (sum.venue && sum.venue !== "XCSE" && sum.venue !== line.book.mic) throw new Error(`${line.symbol} executes on ${sum.venue}`);
    if (DEAD_NOTE.test(sum.note || "")) {
      suspended.push({ ticker: line.symbol, isin, note: sum.note });
      continue;
    }
    if (!clean(line.raw.lastSalePrice) || clean(line.raw.lastSalePrice) === "-") {
      leftOut.push(`${line.symbol} (no last price)`);
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
    if (line.tag) parts.push(line.tag);
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

  const order = { STOCK: 0, ETF: 1, FUND: 2 };
  listed.sort((a, b) => a.mic.localeCompare(b.mic) || order[a.type] - order[b.type] || a.ticker.localeCompare(b.ticker));
  for (const ticker of ["NOVO B", "MAERSK B", "XACTC25"]) {
    if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
  }
  return { listed, suspended, leftOut };
}

export async function writeCopenhagenCatalogue(here, file, { types = ["STOCK", "ETF", "FUND"], funds = true, firstNorth = false } = {}) {
  const book = await copenhagenBook({ funds: funds && types.includes("FUND"), firstNorth });
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
  console.error(`${kept.length} Copenhagen lines ${JSON.stringify(counts)}`);
  console.error(`${book.suspended.length} suspended left out${book.suspended.length ? `: ${book.suspended.map((line) => `${line.ticker} (${line.note})`).join(", ")}` : ""}`);
  if (book.leftOut.length) console.error(`left out: ${book.leftOut.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const book = await copenhagenBook({ funds: !process.argv.includes("--no-funds"), firstNorth: process.argv.includes("--first-north") });
  report(book, book.listed);
}
