// What Hapi (hapi.trade, United States) sells in US shares and exchange-
// traded funds, with no login. Hapi's public stock directory is a paginated
// list filled by Hapi's own GraphQL API; the same API answers, for one
// ticker, the place it is listed on and its kind (the page each ticker gets).
//
//   https://hapi.trade/en/stocks                      (directory, 20 a page)
//   https://hapi.trade/en/stock/<TICKER>              (ticker page)
//   https://api.hapi.trade/graphql   query appConfig            (session key)
//                                    query stockAssets          (directory)
//                                    query tickerInformation    (one ticker)
//
// The API wants headers timestamp, platform_os WEB, platform_app_version and
// a signature: HMAC-SHA256, keyed by the session_key header appConfig
// returns, of timestamp + the query without white space + WEB + version.
// This is what the site's own script does. The API answers about 40 calls a
// minute and then "Rate Limit" until the minute is over, so calls are spaced
// (and at most 4 run at once), and a rate-limited call waits and retries.
//
// Directory: every record is name, symbol and an "isAvailable" flag. Only
// available records are kept; the rest are counted and left out. Asking a
// directory page for more than 20 records is allowed and costs far fewer
// calls (100 a page here). The server drops from each page the records it
// cannot price, so a page comes back short, and a page holding a record it
// cannot read at all fails whole ("Cannot return null"): such a page is read
// again in pages of 20, 5 and 1, so only that record is lost. On 2026-10-19
// the stated total was 9,375: 8,548 records came back (8,542 symbols), 3
// were unreadable and 824 were dropped by the server. Every record that came
// back said isAvailable true (8,542 available, 0 not); the dropped ones may
// be the unavailable ones, but the API does not say. That run kept 8,522
// rows: 3,678 NASDAQ, 2,145 NYSE, 1,781 NYSE Arca, 672 Cboe BZX, 238 NYSE
// American, 8 Texas Stock Exchange; 5,300 STOCK, 3,192 ETF, 30 ETN.
//
// Place and kind: tickerInformation gives each available ticker an exchange
// (NASDAQ, NYSE, NYSEARCA, NYSEMKT, BATS, TXSE) and a category (Domestic
// Common Stock, ADR..., ETF, ETN, CEF, ETD...). A US title is one row, at the
// exchange the record names, in dollars (US venues are one NBBO market).
// Category ETF is ETF, ETN is ETN; ETD (exchange-traded debt, the $25 "baby
// bonds") is debt and left out with the other obligations; everything else
// (common, ADR, Canadian, closed-end fund, preferred, royalty-trust UNIT) is
// STOCK. A ticker the API has no information for, or places on no exchange
// read here, is counted and left out.
// About 8,500 tickers at under 40 calls a minute is some four hours, so the
// answers are kept in a cache outside the repo (hapi-info-cache.json in the
// system temp folder, or the file HAPI_CACHE names); a rerun asks only for
// tickers it has not seen (--refresh asks for all again).
//
// ISIN: Hapi prints none (only a FIGI, kept in raw). stampRows fills it
// from the shared stock and ETF lists (listIsins.mjs: assets/stocks.csv and
// assets/etfs.csv) by ticker at the row's exchange, or at the one American
// place the lists file it on. Several ISINs leave the row without one, with
// the candidates in `matches`.
//
// broker-list.json gives Hapi New York Stock Exchange and Nasdaq ("No penny
// stocks"). The run reports how many kept rows fall on other US exchanges.
//
//   node brokers/hapi/hapi_scraping.mjs
//   node brokers/hapi/hapi_scraping.mjs --refresh

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://api.hapi.trade/graphql";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PLATFORM = "WEB";
const VERSION = "20.0.0";
const PER_PAGE = 100;
const WORKERS = 4;
const SPACING = 1600; // ms between call starts: under 40 a minute
const CACHE = process.env.HAPI_CACHE || path.join(os.tmpdir(), "hapi-info-cache.json");
const PARSED = new URL("hapi-parsed.json", import.meta.url);
const REFRESH = process.argv.includes("--refresh");

// Hapi exchange code -> [exchange, MIC], the names the other US scrapers use.
const VENUES = {
  NASDAQ: ["NASDAQ", "XNAS"],
  NYSE: ["NYSE", "XNYS"],
  NYSEARCA: ["NYSE Arca", "ARCX"],
  ARCA: ["NYSE Arca", "ARCX"],
  AMEX: ["NYSE American", "XASE"],
  NYSEAMERICAN: ["NYSE American", "XASE"],
  NYSEMKT: ["NYSE American", "XASE"],
  BATS: ["Cboe BZX", "BATS"],
  CBOE: ["Cboe BZX", "BATS"],
  TXSE: ["Texas Stock Exchange", "TXSE"],
};

const DIRECTORY = `query stockAssets($input: AssetsInput!) {
  stockAssets(input: $input) { data { name symbol isAvailable } total page lastPage }
}`;
const INFORMATION = `query tickerInformation($input: TickerInput!) {
  tickerInformation(input: $input) { symbol figi exchange category name }
}`;
const CONFIG = "query appConfig { appConfig { webLastUpdateMessageEn } }";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headers(extra = {}) {
  return {
    "User-Agent": UA,
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://hapi.trade",
    Referer: "https://hapi.trade/",
    timestamp: String(Date.now()),
    "x-forwarded-for": "0.0.0.0",
    platform_os: PLATFORM,
    platform_app_version: VERSION,
    ...extra,
  };
}

let sessionKey = "";
async function newSession() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ query: CONFIG }),
        signal: AbortSignal.timeout(60_000),
      });
      const key = response.headers.get("session_key");
      if (key) return (sessionKey = key);
    } catch {}
    await sleep(2000 * (attempt + 1));
  }
  throw new Error("Hapi gave no session key");
}

// Calls start at least SPACING apart, whatever the number of workers.
let nextStart = 0;
async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextStart);
  nextStart = at + SPACING;
  if (at > now) await sleep(at - now);
}

// One signed GraphQL call. A "Rate Limit" answer waits out the minute; a
// ticker the API does not know comes back as { missing }.
async function call(query, variables) {
  let last = "";
  let limited = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await slot();
    try {
      const head = headers();
      head.signature = crypto
        .createHmac("sha256", sessionKey)
        .update(`${head.timestamp}${query.replace(/\s/g, "")}${PLATFORM}${VERSION}`)
        .digest("hex");
      const response = await fetch(API, {
        method: "POST",
        headers: head,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(180_000),
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}
      if (json && !json.errors && json.data) return json.data;
      const message = json?.errors?.[0]?.message || `${response.status} ${text.slice(0, 120)}`;
      if (/TICKER_ERROR|not a valid ticker/i.test(message)) return { missing: message };
      if (/Cannot return null for non-nullable/i.test(message) && attempt >= 1) return { broken: message };
      last = message;
      if (/rate limit/i.test(message)) {
        nextStart = Math.max(nextStart, Date.now() + 61_000);
        limited += 1;
        if (limited > 30) throw new Error("Hapi kept answering Rate Limit");
        attempt -= 1; // waiting out the minute is not a failure
        continue;
      }
      if (/signature|session|unauthori/i.test(message)) await newSession();
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function pool(items, work) {
  const out = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (index < items.length) {
        const at = index++;
        out[at] = await work(items[at], at);
      }
    })
  );
  return out;
}

// Records [start, start + size) as one page of `size`. The server drops,
// from the page it returns, records it cannot price, and a page holding a
// record it cannot read at all fails whole ("Cannot return null"). A failed
// page is read again in smaller pages, down to single records, so only the
// unreadable records themselves are lost.
const SPLITS = [PER_PAGE, 20, 5, 1];
const lost = { unreadable: 0, calls: 0 };
async function directoryRange(start, size) {
  lost.calls += 1;
  const data = await call(DIRECTORY, { input: { page: start / size + 1, perPage: size } });
  if (data.stockAssets) return { ...data.stockAssets, data: data.stockAssets.data || [] };
  if (!data.broken) throw new Error(`directory range ${start}+${size} came back empty`);
  const smaller = SPLITS[SPLITS.indexOf(size) + 1];
  if (!smaller) {
    lost.unreadable += 1;
    return { data: [] };
  }
  const parts = [];
  for (let at = start; at < start + size; at += smaller) parts.push((await directoryRange(at, smaller)).data);
  return { data: parts.flat() };
}

async function directory() {
  const first = await directoryRange(0, PER_PAGE);
  if (!first.total) throw new Error("the first directory page failed");
  const starts = Array.from({ length: Math.ceil(first.total / PER_PAGE) - 1 }, (_, at) => (at + 1) * PER_PAGE);
  const rest = await pool(starts, async (start) => (await directoryRange(start, PER_PAGE)).data);
  const records = [first.data, ...rest].flat();
  const bySymbol = new Map();
  for (const record of records) {
    const symbol = String(record.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const seen = bySymbol.get(symbol);
    // A symbol printed twice is available if either line says so.
    if (!seen || (!seen.isAvailable && record.isAvailable)) bySymbol.set(symbol, { ...record, symbol });
  }
  const dropped = first.total - records.length - lost.unreadable;
  console.error(
    `directory: stated total ${first.total}; ${records.length} records returned (${bySymbol.size} symbols) in ${lost.calls} calls; ` +
      `${lost.unreadable} unreadable, ${dropped} dropped by the server`
  );
  if (bySymbol.size < first.total * 0.6) throw new Error(`directory gave ${bySymbol.size} symbols of ${first.total}`);
  return { records: [...bySymbol.values()], total: first.total, unreadable: lost.unreadable, dropped };
}

function readCache() {
  if (REFRESH || !fs.existsSync(CACHE)) return {};
  return JSON.parse(fs.readFileSync(CACHE, "utf8"));
}

async function information(symbols) {
  const cache = readCache();
  const wanted = symbols.filter((symbol) => !cache[symbol]);
  console.error(`ticker information: ${symbols.length - wanted.length} cached, ${wanted.length} to ask (about ${Math.ceil((wanted.length * SPACING) / 60_000)} min)`);
  let done = 0;
  await pool(wanted, async (symbol) => {
    const data = await call(INFORMATION, { input: { ticker: symbol } });
    cache[symbol] = data.missing ? { missing: data.missing } : data.tickerInformation || { missing: "no answer" };
    done += 1;
    if (done % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      console.error(`  ${done}/${wanted.length}`);
    }
  });
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return cache;
}

function typeOf(category) {
  const text = String(category || "").toUpperCase();
  if (/^ETD$/.test(text)) return "BOND"; // exchange-traded debt: baby bonds
  if (/\bETN\b/.test(text)) return "ETN";
  if (/\b(ETF|ETV|ETMF)\b/.test(text)) return "ETF";
  return "STOCK";
}

await newSession();
const { records, total, unreadable, dropped } = await directory();
const available = records.filter((record) => record.isAvailable === true);
const unavailable = records.length - available.length;
console.error(`available ${available.length}, not available ${unavailable}`);
if (available.length < 5000) throw new Error(`only ${available.length} available titles`);

const info = await information(available.map((record) => record.symbol));

const rows = [];
const left = { noInformation: [], otherExchange: new Map() };
const categories = new Map();
for (const record of available) {
  const facts = info[record.symbol] || {};
  if (facts.missing || !facts.exchange) {
    left.noInformation.push(record.symbol);
    continue;
  }
  const code = String(facts.exchange).toUpperCase().replace(/[\s_-]/g, "");
  const venue = VENUES[code];
  if (!venue) {
    left.otherExchange.set(code, [...(left.otherExchange.get(code) || []), record.symbol]);
    continue;
  }
  const [exchange, mic] = venue;
  const type = typeOf(facts.category);
  categories.set(`${facts.category} -> ${type}`, (categories.get(`${facts.category} -> ${type}`) || 0) + 1);
  const name = String(record.name || facts.name || record.symbol).replace(/\s+/g, " ").trim();
  rows.push({
    query: record.symbol,
    ticker: record.symbol,
    name,
    exchange,
    mic,
    currency: "USD",
    type,
    raw: [record.symbol, name, facts.exchange, facts.category, facts.figi].filter(Boolean).join(" | "),
  });
}

rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
for (const [ticker, test] of [
  ["AAPL", (row) => row.mic === "XNAS" && row.type === "STOCK"],
  ["SPY", (row) => row.mic === "ARCX" && row.type === "ETF"],
]) {
  const row = rows.find((candidate) => candidate.ticker === ticker);
  if (!row || !test(row)) throw new Error(`${ticker} is missing or misplaced`);
}

const unresolved = rows.filter((row) => {
  const { venue } = resolveVenue(row);
  return !venue || venue.mic !== row.mic;
});
if (unresolved.length) throw new Error(`venues that do not resolve: ${[...new Set(unresolved.map((row) => `${row.exchange}/${row.mic}`))].join(", ")}`);

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(PARSED, JSON.stringify(kept, null, 2));

const count = (key) => {
  const out = new Map();
  for (const row of kept) out.set(row[key], (out.get(row[key]) || 0) + 1);
  return [...out].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${n} ${name}`).join(", ");
};
console.error(`categories: ${[...categories].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${n} ${name}`).join("; ")}`);
console.error(`directory: stated ${total}, ${unreadable} unreadable, ${dropped} dropped by the server, ${records.length} symbols read: ${available.length} available, ${unavailable} not available`);
console.error(`left out: ${left.noInformation.length} with no ticker information (${left.noInformation.slice(0, 20).join(" ")})`);
for (const [code, symbols] of left.otherExchange) console.error(`left out: ${symbols.length} on ${code} (${symbols.slice(0, 20).join(" ")})`);
console.error(`${kept.length} rows (${count("exchange")}); ${count("type")}; ${kept.filter((row) => row.isin).length} with an ISIN, ${kept.filter((row) => row.matches).length} with several`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} obligations left out`);
