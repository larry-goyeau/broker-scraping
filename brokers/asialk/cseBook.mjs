// The Colombo Stock Exchange book, shared by the Sri Lankan brokers whose
// only place is the CSE (Asia Securities, Bartleet Religare, John Keells
// Stock Brokers, NDB Securities, Capital TRUST). Their clients order
// through the exchange's ATS, so the book is every share the exchange
// lets trade today. Each broker's scraper applies the exceptions its own
// pages name, if any.
//
// Read from the exchange's own public API, the one its website calls:
//   https://www.cse.lk/api/allSecurityCode            every listed code
//   https://www.cse.lk/api/listedEntitiesByTradingStatus?tradingStatus=TS
//     (also DS and TH)  trading suspended, dealing suspended, trading halt,
//     the lists on https://www.cse.lk/listed-entities/trading-status
//   https://www.cse.lk/api/deListedEntities           delisted companies
//   https://www.cse.lk/api/companyInfoSummery         (POST symbol=<code>)
//     one record per line: ISIN, issue date, all-time high and volumes
//
// Kept: voting (.N), non-voting (.X) and preference (.P) shares, which
// are equity. Left out: lines on the trading-suspended, dealing-suspended
// or trading-halt lists, delisted codes, codes the list marks inactive,
// lines that never traded (no last traded price, closing price, all-time
// high or volume in the last 12 months in their record), rights (.R), warrants (.W), debentures (.D),
// bare issuer codes with no share class (debt-only issuers such as MIFL)
// and closed-end fund units (.U), which are not ETFs; `funds: true` keeps
// the units as FUND rows. Colombo lists no ETF, ETN or ETC today; a line
// named "ETF" or "exchange traded fund" would be typed ETF. Every line
// trades in rupees. The ISIN is the exchange's own, from the line's record.
//
// The per-line records (about 300 calls, one every 0.3 s) are kept in
// cse-cache.json next to this file; a record is fetched again only when
// it is new or its line has not traded yet. The whole book is kept there
// for 12 hours, so the five scrapers run back to back read Colombo once.
//
//   import { cseBook } from "../asialk/cseBook.mjs";
//   const rows = await cseBook();            // shares only
//   const rows = await cseBook({ funds: true }); // plus closed-end units

import fs from "node:fs";

const API = "https://www.cse.lk/api/";
const PAGE = "https://www.cse.lk/listed-entities/trading-status";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const CACHE = new URL("cse-cache.json", import.meta.url);
const CACHE_HOURS = 12;
export const EXCHANGE = "CSE";
export const MIC = "XCOL";

// .N voting, .X non-voting, .P preference. .R right, .D debenture,
// .U closed-end fund unit, .W warrant.
const SHARE = new Set(["N", "X", "P"]);
const OTHER = { R: "right", W: "warrant", D: "debenture", U: "closed-end fund unit" };
const HALTS = { TS: "trading suspended", DS: "dealing suspended", TH: "trading halt" };

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path, { body } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(API + path, {
        method: body ? "POST" : "GET",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: PAGE,
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: body ? new URLSearchParams(body).toString() : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return await response.json();
      last = `${path} answered ${response.status}`;
    } catch (error) {
      last = `${path}: ${error.message || error}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(`Colombo: ${last}`);
}

function readCache() {
  try {
    const kept = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    return { bookAt: kept.bookAt || null, book: kept.book || null, info: kept.info || {} };
  } catch {
    return { bookAt: null, book: null, info: {} };
  }
}

function classOf(symbol) {
  const match = symbol.match(/^[A-Z0-9&]+\.([A-Z])\d{4}$/);
  return match ? match[1] : "";
}

function traded(record) {
  return ["allHiPrice", "lastTradedPrice", "closingPrice", "p12ShareVolume", "ytdShareVolume"].some((key) => Number(record[key]) > 0);
}

async function lineRecord(symbol) {
  const body = await call("companyInfoSummery", { body: { symbol } });
  const info = body?.reqSymbolInfo;
  if (!info || clean(info.symbol).toUpperCase() !== symbol) throw new Error(`Colombo returned no record for ${symbol}`);
  return {
    isin: clean(info.isin).toUpperCase(),
    issueDate: clean(info.issueDate),
    allHiPrice: info.allHiPrice ?? null,
    lastTradedPrice: info.lastTradedPrice ?? null,
    closingPrice: info.closingPrice ?? null,
    ytdShareVolume: info.ytdShareVolume ?? null,
    p12ShareVolume: info.p12ShareVolume ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

async function readBook() {
  const cache = readCache();
  const list = await call("allSecurityCode");
  if (!Array.isArray(list) || list.length < 250) throw new Error(`Colombo published ${list?.length || 0} codes`);
  await pause(400);
  const halted = new Map();
  for (const [status, reason] of Object.entries(HALTS)) {
    const body = await call(`listedEntitiesByTradingStatus?tradingStatus=${status}`);
    if (!Array.isArray(body?.content)) throw new Error(`Colombo's ${reason} list is unreadable`);
    for (const line of body.content) halted.set(clean(line.symbol).toUpperCase(), reason);
    await pause(400);
  }
  const delistedBody = await call("deListedEntities");
  if (!Array.isArray(delistedBody?.content)) throw new Error("Colombo's delisted list is unreadable");
  const delisted = new Set(delistedBody.content.map((line) => clean(line.symbol).toUpperCase()));

  const lines = [];
  const left = {};
  const drop = (reason) => {
    left[reason] = (left[reason] || 0) + 1;
  };
  const seen = new Set();
  for (const line of list) {
    const ticker = clean(line.symbol).toUpperCase();
    const name = clean(line.name);
    if (!ticker || !name) throw new Error(`an unreadable Colombo line: ${JSON.stringify(line)}`);
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    const share = classOf(ticker);
    if (line.active != null && Number(line.active) !== 1) drop("inactive");
    else if (!share) drop("issuer code with no share class");
    else if (OTHER[share] && share !== "U") drop(OTHER[share]);
    else if (!SHARE.has(share) && share !== "U") throw new Error(`unknown Colombo class .${share} on ${ticker}`);
    else if (delisted.has(ticker)) drop("delisted");
    else if (halted.has(ticker)) drop(halted.get(ticker));
    else lines.push({ ticker, name, share });
  }

  // One record per line, from the cache when its line has traded before.
  const info = cache.info;
  let fetched = 0;
  for (const line of lines) {
    const known = info[line.ticker];
    if (known && known.isin && traded(known)) continue;
    info[line.ticker] = await lineRecord(line.ticker);
    fetched += 1;
    await pause(300);
  }

  const shares = [];
  const units = [];
  for (const line of lines) {
    const record = info[line.ticker];
    if (!traded(record)) {
      drop("never traded");
      continue;
    }
    if (!/^LK[A-Z0-9]{10}$/.test(record.isin)) throw new Error(`${line.ticker} has ISIN "${record.isin}"`);
    const type = line.share === "U" ? "FUND" : /\bETF\b|exchange traded fund/i.test(line.name) ? "ETF" : "STOCK";
    const kind = { N: "voting", X: "non-voting", P: "preference", U: "closed-end fund unit" }[line.share];
    const row = {
      query: record.isin,
      ticker: line.ticker,
      name: line.name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "LKR",
      type,
      isin: record.isin,
      raw: [line.ticker, line.name, EXCHANGE, "LKR", type, kind].join(" "),
    };
    (type === "FUND" ? units : shares).push(row);
  }
  if (units.length) left["closed-end fund unit"] = (left["closed-end fund unit"] || 0) + units.length;
  const isins = new Set();
  for (const row of [...shares, ...units]) {
    if (isins.has(row.isin)) throw new Error(`ISIN ${row.isin} on two Colombo lines`);
    isins.add(row.isin);
  }
  shares.sort((a, b) => a.ticker.localeCompare(b.ticker));
  units.sort((a, b) => a.ticker.localeCompare(b.ticker));
  if (shares.length < 250) throw new Error(`only ${shares.length} Colombo shares are open to trade`);
  for (const ticker of ["JKH.N0000", "COMB.N0000", "COMB.X0000"]) {
    if (!shares.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Colombo book`);
  }
  const bookAt = new Date().toISOString();
  const book = { shares, units, left, halted: Object.fromEntries(halted) };
  fs.writeFileSync(CACHE, JSON.stringify({ bookAt, book, info }, null, 1));
  return { ...book, bookAt, fetched, fromCache: false };
}

// Every Colombo share open to trade, sorted by ticker. `funds: true` adds
// the closed-end fund units as FUND rows. Rows are fresh objects; the
// caller stamps them (stampRows, withoutObligations) and writes its file.
export async function cseBook({ funds = false, quiet = false } = {}) {
  const cache = readCache();
  let book;
  if (cache.book && cache.bookAt && Date.now() - Date.parse(cache.bookAt) < CACHE_HOURS * 3600_000) {
    book = { ...cache.book, bookAt: cache.bookAt, fetched: 0, fromCache: true };
  } else {
    book = await readBook();
  }
  const rows = [...book.shares, ...(funds ? book.units : [])].map((row) => ({ ...row }));
  if (!quiet) {
    const byClass = {};
    for (const row of rows) {
      const kind = { N: "voting", X: "non-voting", P: "preference", U: "fund unit" }[classOf(row.ticker)];
      byClass[kind] = (byClass[kind] || 0) + 1;
    }
    const left = { ...book.left };
    if (funds) delete left["closed-end fund unit"];
    console.error(
      `Colombo book: ${rows.length} lines (${Object.entries(byClass).map(([kind, n]) => `${n} ${kind}`).join(", ")})` +
        `${book.fromCache ? ` from cse-cache.json (${book.bookAt})` : `, ${book.fetched} line records fetched`}; ` +
        `left out ${Object.entries(left).map(([reason, n]) => `${n} ${reason}`).join(", ")}`,
    );
  }
  return rows;
}

// The lines the exchange lists as suspended or halted, { ticker: reason },
// for a scraper that wants to print them.
export async function cseHalted() {
  const cache = readCache();
  if (!cache.book) await cseBook({ quiet: true });
  return { ...readCache().book.halted };
}
