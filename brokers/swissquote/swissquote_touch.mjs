// The signed-in platform streams bid and ask for one listing. The catalogue
// never stored them. This reads that touch for every Swissquote line that
// still has no book, and writes it into the shared spread file. A venue that
// is closed is left for a later session. The page already open on
// trade.swissquote.ch is used as it stands: nothing here changes the screen.
//
//   node brokers/swissquote/swissquote_touch.mjs
//   node brokers/swissquote/swissquote_touch.mjs --limit=20

import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveVenue, sessionState } from "../../spreads/venues.mjs";

const CATALOGUE = new URL("swissquote-parsed.json", import.meta.url);
const PROGRESS = new URL("swissquote-touch-progress.json", import.meta.url);
const TOUCHES = new URL("swissquote-touches.jsonl", import.meta.url);
const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
const PAGE = "https://trade.swissquote.ch/eding_trading-platform/#portfoliooverview";
const EQ = new Set(["STOCK", "ETF", "ETN", "ETC", "ETP"]);
const SEARCH = 12;
const QUOTE = 40;

const EXCHANGES = {
  "NASDAQ NATIONAL MARKET": "NASDAQ",
  "NASDAQ CAPITAL MARKET": "NASDAQ",
  "NASDAQ GLOBAL MARKET": "NASDAQ",
  "NASDAQ GLOBAL SELECT": "NASDAQ",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  "NYSE ARCA": "AMEX",
  "NYSE AMERICAN": "AMEX",
  "NYSE MKT": "AMEX",
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  OTC: "OTC",
  "OTC MARKETS": "OTC",
  SIX: "SIX",
  "SIX SWISS EXCHANGE": "SIX",
  XETRA: "XETR",
  FRANKFURT: "FWB",
  LSE: "LSE",
  "LONDON STOCK EXCHANGE": "LSE",
  MILAN: "MIL",
  "BORSA ITALIANA": "MIL",
  PARIS: "XPAR",
  "EURONEXT PARIS": "XPAR",
  AMSTERDAM: "XAMS",
  "EURONEXT AMSTERDAM": "XAMS",
  BRUSSELS: "XBRU",
  "EURONEXT BRUSSELS": "XBRU",
  LISBON: "XLIS",
  "EURONEXT LISBON": "XLIS",
  TRADEGATE: "TRADEGATE",
  "TOKYO SE": "TSE",
  TOKYO: "TSE",
  "HONG KONG": "HKEX",
  HKEX: "HKEX",
  ASX: "ASX",
  TSX: "TSX",
  TORONTO: "TSX",
  "TSX VENTURE": "TSXV",
  COPENHAGEN: "XCSE",
  STOCKHOLM: "XSTO",
  HELSINKI: "XHEL",
  OSLO: "OSL",
  MADRID: "BME",
  VIENNA: "VIE",
  WARSAW: "GPW",
  PRAGUE: "PSECZ",
  MUNCHEN: "MUN",
  MUNICH: "MUN",
  DUSSELDORF: "DUS",
  HAMBURG: "HAM",
  STUTTGART: "SWB",
  BERLIN: "BER",
  HANNOVER: "HAN",
  GETTEX: "GETTEX",
  SINGAPORE: "SGX",
  "SINGAPORE STOCK EXCHANGE": "SGX",
  SGX: "SGX",
  "AUSTRALIAN STOCK EXCHANGE": "ASX",
  "MEXICO SE": "BMV",
  "MEXICO STOCK EXCHANGE": "BMV",
  LUXEMBOURG: "LUX",
  "LUXEMBOURG STOCK EXCHANGE": "LUX",
  JOHANNESBURG: "JSE",
  "JOHANNESBURG STOCK EXCHANGE": "JSE",
};

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!text) return "";
  const first = text.split(",")[0].trim();
  const after = first.includes(":") ? first.split(":").pop() : first;
  return (after || "").replace(/[\s/^]+/g, ".").trim();
}

function bpFrom(bid, ask) {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
}

function dayKey(when, tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

function hasLeaf(spreads, isin, mic, currency) {
  const book = spreads[isin]?.[mic];
  if (!book) return false;
  if (book[currency]?.bp > 0 || book[currency]?.perShare) return true;
  if (currency === "GBP" || currency === "GBX") {
    const other = currency === "GBP" ? "GBX" : "GBP";
    if (book[other]?.bp > 0 || book[other]?.perShare) return true;
  }
  return false;
}

function openNow(venue) {
  return sessionState(venue).open === true;
}

function minutesLeft(venue) {
  if (!venue?.hours) return 24 * 60;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: venue.hours.tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const close = Number(venue.hours.close.slice(0, 2)) * 60 + Number(venue.hours.close.slice(3, 5));
  return close - minutes;
}

function sameBook(quoted, wanted) {
  if (!quoted || !wanted) return false;
  if (quoted === wanted) return true;
  return (quoted === "GBP" && wanted === "GBX") || (quoted === "GBX" && wanted === "GBP");
}

function micOf(exchange, currency, isin) {
  const code = EXCHANGES[String(exchange || "").toUpperCase()] || exchange;
  return resolveVenue({ exchange: code, currency, isin }).venue?.mic || "";
}

function fresh(venue, message) {
  if (!openNow(venue)) return false;
  if (!String(message?.marketStatus || "").startsWith("MARKET_OPEN")) return false;
  const bid = message.data?.bidPrice;
  const ask = message.data?.askPrice;
  if (bid?.status !== "AVAILABLE" || ask?.status !== "AVAILABLE") return false;
  if (!venue?.hours?.tz) return false;
  const today = dayKey(new Date(), venue.hours.tz);
  const times = [bid.timestamp, ask.timestamp].map((value) => new Date(value));
  if (times.some((when) => Number.isNaN(when.getTime()))) return false;
  return times.every((when) => dayKey(when, venue.hours.tz) === today && sessionState(venue, when).open === true);
}

function loadWork(spreads, progress) {
  const rows = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const byIsin = new Map();
  let closed = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !EQ.has(String(row.type || "").toUpperCase())) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    const venue = resolveVenue(row).venue;
    const ticker = normalizeTicker(row.ticker);
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency || !venue?.source || !ticker) continue;
    const lineKey = `${isin}|${venue.mic}|${currency}`;
    if (progress.lines[lineKey]) continue;
    if (hasLeaf(spreads, isin, venue.mic, currency)) continue;
    if (!openNow(venue)) {
      closed += 1;
      continue;
    }
    const group = byIsin.get(isin) || byIsin.set(isin, { isin, lines: [] }).get(isin);
    if (!group.lines.some((line) => line.mic === venue.mic && line.currency === currency && line.ticker === ticker)) {
      group.lines.push({ mic: venue.mic, currency, ticker, venue, lineKey });
    }
  }
  const jobs = [...byIsin.values()];
  jobs.sort((a, b) => Math.min(...a.lines.map((line) => minutesLeft(line.venue))) - Math.min(...b.lines.map((line) => minutesLeft(line.venue))));
  return { jobs, closed };
}

function readSpread() {
  return JSON.parse(fs.readFileSync(SPREAD, "utf8"));
}

function writeSpread(file) {
  file.generatedAt = new Date().toISOString();
  const tmp = `${SPREAD.pathname}.sq-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, SPREAD.pathname);
}

function applyLeaves(file, leaves) {
  let added = 0;
  for (const leaf of leaves) {
    const book = ((file.spreads[leaf.isin] ||= {})[leaf.mic] ||= {});
    if (book[leaf.currency]?.bp > 0 || book[leaf.currency]?.perShare) continue;
    book[leaf.currency] = { bp: leaf.bp, url: leaf.url };
    added += 1;
  }
  return added;
}

let pending = [];
let stored = 0;

function remember(leaf) {
  pending.push(leaf);
  fs.appendFileSync(TOUCHES, `${JSON.stringify(leaf)}\n`);
  stored += 1;
}

function flush() {
  if (!pending.length) return;
  const file = readSpread();
  if (applyLeaves(file, pending)) writeSpread(file);
  pending = [];
}

function mergeLog() {
  if (!fs.existsSync(TOUCHES)) return 0;
  const leaves = fs.readFileSync(TOUCHES, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const file = readSpread();
  const added = applyLeaves(file, leaves);
  if (added) writeSpread(file);
  return added;
}

const progress = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, "utf8")) : { lines: {} };
if (!progress.lines) progress.lines = {};
const recovered = mergeLog();
if (recovered) console.error(`${recovered} carnets repris du journal`);
const { jobs, closed } = loadWork(readSpread().spreads, progress);
const todo = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;
const london = todo.reduce((n, job) => n + job.lines.filter((line) => line.mic === "XLON").length, 0);
console.error(`${todo.length} fiches à lire, ${london} lignes de Londres, ${closed} lignes de marché fermé laissées`);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 300_000,
});
const page = (await browser.pages()).find((candidate) => candidate.url().includes("trade.swissquote.ch"));
if (!page) {
  await browser.disconnect();
  throw new Error("La page Swissquote n'est pas ouverte.");
}

async function search(term) {
  const answer = await page.evaluate(async (query) => {
    const response = await fetch("/eding_securities-search-plugin/api/search/allGrouped", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ count: 50, searchTerm: query, suggestTab: "false" }),
    });
    if (response.status === 401 || response.status === 403) return { status: response.status };
    const json = await response.json();
    const rows = [];
    for (const item of json.securities || []) {
      rows.push(item);
      for (const child of item.children || []) rows.push(child);
    }
    return {
      status: response.status,
      rows: rows.map((row) => ({
        symbol: row.symbol,
        market: row.market,
        isin: row.stockKey?.isin,
        exchangeId: row.stockKey?.exchangeId,
        currency: row.stockKey?.currency,
      })),
    };
  }, term);
  if (answer.status === 401 || answer.status === 403) throw new Error("Swissquote demande de se reconnecter.");
  return answer.rows || [];
}

function pick(line, rows) {
  return rows.find((row) => {
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (isin !== line.lineKey.slice(0, 12) && isin !== line.isin) return false;
    if (normalizeTicker(row.symbol) !== line.ticker) return false;
    if (!sameBook(currency, line.currency)) return false;
    return micOf(row.market, line.currency, isin) === line.mic;
  });
}

async function keysFor(job) {
  const open = job.lines.filter((line) => openNow(line.venue));
  if (!open.length) return { chosen: [], missed: [] };
  let rows = await search(job.isin);
  const chosen = [];
  const missed = [];
  for (const line of open) {
    let hit = pick({ ...line, isin: job.isin }, rows);
    if (!hit) {
      const byTicker = await search(line.ticker);
      hit = pick({ ...line, isin: job.isin }, byTicker);
    }
    if (!hit?.exchangeId) {
      missed.push(line);
      continue;
    }
    chosen.push({
      line,
      stockKey: { isin: job.isin, exchangeId: hit.exchangeId, currency: String(hit.currency || line.currency).toUpperCase() },
    });
  }
  return { chosen, missed };
}

async function quote(batch) {
  if (!batch.length) return new Map();
  const messages = await page.evaluate(async (keys) => {
    const mod = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("flux muet")), 8000);
      window.require(["/eding_datastreaming-trading-plugin/resources/js/app.min.js?pluginVersion=3.9.2"], (loaded) => {
        clearTimeout(timer);
        resolve(loaded);
      });
    });
    const stream = mod.QuoteStreaming.getInstance();
    const got = [];
    const id = `touch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await stream.subscribe({ subscriberId: id, stockKey: keys }, (message) => got.push(message));
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      stream.unsubscribe({ subscriberId: id, stockKey: keys });
    } catch {
      // The snapshot is already in hand.
    }
    return got.map((message) => ({
      isin: message.stockKey?.isin,
      exchangeId: message.stockKey?.exchangeId,
      currency: message.stockKey?.currency,
      marketStatus: message.marketStatus,
      bid: message.data?.bidPrice || null,
      ask: message.data?.askPrice || null,
    }));
  }, batch.map((item) => item.stockKey));
  const byKey = new Map();
  for (const message of messages) {
    byKey.set(`${message.isin}|${message.exchangeId}|${message.currency}`, message);
  }
  return byKey;
}

let finished = 0;
const started = Date.now();
try {
  for (let offset = 0; offset < todo.length; offset += SEARCH) {
    const slice = todo.slice(offset, offset + SEARCH);
    let resolved;
    try {
      resolved = await Promise.all(slice.map((job) => keysFor(job)));
    } catch (error) {
      console.error(`lot sauté (${String(error.message || error).slice(0, 80)})`);
      continue;
    }
    const chosen = resolved.flatMap((item) => item.chosen);
    const quotes = new Map();
    try {
      for (let i = 0; i < chosen.length; i += QUOTE) {
        const part = await quote(chosen.slice(i, i + QUOTE));
        for (const [key, message] of part) quotes.set(key, message);
      }
    } catch (error) {
      console.error(`lot sauté (${String(error.message || error).slice(0, 80)})`);
      continue;
    }
    for (let index = 0; index < slice.length; index += 1) {
      const job = slice[index];
      for (const line of resolved[index].missed) progress.lines[line.lineKey] = { at: new Date().toISOString(), stored: 0 };
      for (const item of resolved[index].chosen) {
        if (!openNow(item.line.venue)) continue;
        const message = quotes.get(`${job.isin}|${item.stockKey.exchangeId}|${item.stockKey.currency}`);
        const bid = Number(message?.bid?.amount);
        const ask = Number(message?.ask?.amount);
        const bp = bpFrom(bid, ask);
        if (!message || bp == null || !fresh(item.line.venue, { marketStatus: message.marketStatus, data: { bidPrice: message.bid, askPrice: message.ask } })) {
          progress.lines[item.line.lineKey] = { at: new Date().toISOString(), stored: 0 };
          continue;
        }
        remember({
          isin: job.isin,
          mic: item.line.mic,
          currency: item.line.currency,
          bp,
          url: PAGE,
        });
        progress.lines[item.line.lineKey] = { at: new Date().toISOString(), stored: 1, bp };
      }
      finished += 1;
    }
    fs.writeFileSync(PROGRESS, JSON.stringify(progress));
    if (finished % 80 < SEARCH || finished === todo.length) flush();
    const minutes = (Date.now() - started) / 60000;
    const rate = finished / Math.max(minutes, 0.01);
    const left = (todo.length - finished) / rate;
    console.error(`${finished}/${todo.length} fiches, ${stored} carnets, ${left.toFixed(0)} min restantes`);
  }
} finally {
  flush();
  await browser.disconnect();
}

let guard = 0;
while (guard < 4) {
  const added = mergeLog();
  const file = readSpread();
  const probe = fs.existsSync(TOUCHES)
    ? fs.readFileSync(TOUCHES, "utf8").split("\n").filter(Boolean).slice(-1).map((line) => JSON.parse(line))[0]
    : null;
  const kept = probe && file.spreads[probe.isin]?.[probe.mic]?.[probe.currency]?.bp > 0;
  if (!probe || kept) {
    if (guard > 0 || added) console.error(kept ? "le dernier carnet est en place" : "rien à confirmer");
    break;
  }
  guard += 1;
  console.error("le fichier partagé a été réécrit, nouvel essai");
  await sleep(45_000);
}
console.error(`${stored} carnets écrits`);
