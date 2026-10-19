// The public fiche returns bid and ask for one venue at a time. The catalogue
// never stored them. This reads that touch for every ING line that still has
// no book, and writes it into the shared spread file. A venue that is closed
// is left for a later session: the quote on the fiche would be the previous
// board.
//
//   node brokers/ing/ing_touch.mjs
//   node brokers/ing/ing_touch.mjs --limit=20

import fs from "node:fs";
import { resolveVenue, sessionState } from "../../spreads/venues.mjs";

const API = "https://component-api.wertpapiere.ing.de/api/v1";
const CATALOGUE = new URL("ing-parsed.json", import.meta.url);
const PROGRESS = new URL("ing-touch-progress.json", import.meta.url);
const TOUCHES = new URL("ing-touches.jsonl", import.meta.url);
const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const EQ = new Set(["STOCK", "ETF", "ETN", "ETC", "ETP"]);
const CONCURRENCY = 6;
const FLUSH_EVERY = 40;

// Same labels as ing_scraping.mjs. The code is what the fiche asks for.
const PLACE = {
  TGT: "Direkthandel",
  FRA: "FRA",
  STU: "Stuttgart",
  ETR: "Xetra",
  DBEF: "Xetra",
  MUC: "Munich",
  HAM: "Hamburg",
  HAJ: "Hannover",
  DUS: "Düsseldorf",
  UTC: "Nasdaq",
  USC: "NYSE",
  NAR: "NYSE",
  TOR: "TOR",
  CVE: "TSXV",
  CNQ: "CNSX",
};

const CODES = {
  Direkthandel: ["TGT"],
  Xetra: ["ETR", "DBEF"],
  FRA: ["FRA"],
  Stuttgart: ["STU"],
  Munich: ["MUC"],
  Hamburg: ["HAM"],
  Hannover: ["HAJ"],
  Düsseldorf: ["DUS"],
  Nasdaq: ["UTC"],
  NYSE: ["USC", "NAR"],
  TOR: ["TOR"],
  TSXV: ["CVE"],
  CNSX: ["CNQ"],
};

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function freshQuote(venue, header) {
  if (!openNow(venue)) return false;
  const when = new Date(header?.priceChangeDate || "");
  if (Number.isNaN(when.getTime()) || !venue?.hours?.tz) return false;
  if (dayKey(when, venue.hours.tz) !== dayKey(new Date(), venue.hours.tz)) return false;
  return sessionState(venue, when).open === true;
}

function sameBook(quoted, wanted) {
  if (!quoted || !wanted) return false;
  if (quoted === wanted) return true;
  return (quoted === "GBP" && wanted === "GBX") || (quoted === "GBX" && wanted === "GBP");
}

function loadWork(spreads, progress) {
  const rows = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const list = Array.isArray(rows) ? rows : [];
  const byIsin = new Map();
  let closed = 0;
  let uncoded = 0;
  for (const row of list) {
    if (!row || !EQ.has(String(row.type || "").toUpperCase())) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    const resolved = resolveVenue(row);
    const venue = resolved.venue;
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency || !venue?.source) continue;
    const lineKey = `${isin}|${venue.mic}|${currency}`;
    // A line already written stays put. A miss is tried again while the
    // venue is open: the previous fiche may have been the prior session.
    if (progress.lines[lineKey]?.stored) continue;
    if (hasLeaf(spreads, isin, venue.mic, currency)) continue;
    const codes = CODES[row.exchange];
    if (!codes) {
      uncoded += 1;
      continue;
    }
    if (!openNow(venue)) {
      closed += 1;
      continue;
    }
    const group = byIsin.get(isin) || byIsin.set(isin, { isin, lines: [] }).get(isin);
    if (!group.lines.some((line) => line.mic === venue.mic && line.currency === currency)) {
      group.lines.push({ mic: venue.mic, currency, exchange: row.exchange, codes, venue, lineKey });
    }
  }
  const jobs = [...byIsin.values()];
  jobs.sort((a, b) => Number(b.lines.some((line) => line.mic === "XETR")) - Number(a.lines.some((line) => line.mic === "XETR")));
  return { jobs, closed, uncoded };
}

let pending = [];
let stored = 0;
let chain = Promise.resolve();
function exclusive(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function remember(leaf) {
  pending.push(leaf);
  fs.appendFileSync(TOUCHES, `${JSON.stringify(leaf)}\n`);
  stored += 1;
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

function readSpread() {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return JSON.parse(fs.readFileSync(SPREAD, "utf8"));
    } catch (error) {
      last = error.message || String(error);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
  }
  throw new Error(last);
}

function writeSpread(file) {
  file.generatedAt = new Date().toISOString();
  const tmp = `${SPREAD.pathname}.ing-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, SPREAD.pathname);
}

function flush() {
  if (!pending.length) return 0;
  // Another pass may hold spread.json. The journal is enough until it
  // finishes; the next run copies the journal in.
  if (process.env.ING_LOG_ONLY) {
    pending = [];
    return 0;
  }
  const file = readSpread();
  const added = applyLeaves(file, pending);
  if (added) writeSpread(file);
  pending = [];
  return added;
}

function mergeLog() {
  if (process.env.ING_LOG_ONLY) return 0;
  if (!fs.existsSync(TOUCHES)) return 0;
  const leaves = fs
    .readFileSync(TOUCHES, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const file = readSpread();
  const added = applyLeaves(file, leaves);
  if (added) writeSpread(file);
  return added;
}

function markDone(progress, lineKey, result) {
  progress.lines[lineKey] = { at: new Date().toISOString(), ...result };
}

async function header(isin, code) {
  const url = `${API}/instrument-header?isinOrSearchTerm=${encodeURIComponent(isin)}&isKnownIsin=true&includeAvailableExchanges=true&exchangeCode=${encodeURIComponent(code)}`;
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) return null;
      if (response.ok) return { body: await response.json(), url };
      last = `${response.status}`;
      if (response.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (response.status < 500) return null;
    } catch (error) {
      last = String(error.message || error).slice(0, 80);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last || "échec");
}

async function one(job) {
  let wrote = 0;
  let missed = 0;
  let skipped = 0;
  for (const line of job.lines) {
    if (!openNow(line.venue)) {
      skipped += 1;
      continue;
    }
    let touch = null;
    let url = "";
    for (const code of line.codes) {
      const page = await header(job.isin, code);
      if (!page?.body) continue;
      const body = page.body;
      if (String(body.exchangeCode || "").toUpperCase() !== code) continue;
      const quoted = String(body.currencySign || "").toUpperCase();
      if (!sameBook(quoted, line.currency)) continue;
      if (!freshQuote(line.venue, body)) continue;
      const bp = bpFrom(Number(body.bid), Number(body.ask));
      if (bp == null) continue;
      touch = bp;
      url = page.url;
      break;
    }
    if (touch == null) {
      missed += 1;
      markDone(progress, line.lineKey, { stored: 0 });
      continue;
    }
    remember({ isin: job.isin, mic: line.mic, currency: line.currency, bp: touch, url });
    markDone(progress, line.lineKey, { stored: 1, bp: touch });
    wrote += 1;
  }
  return { stored: wrote, missed, skipped };
}

const progress = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, "utf8")) : { lines: {} };
if (!progress.lines) progress.lines = {};
const recovered = mergeLog();
if (recovered) console.error(`${recovered} carnets repris du journal`);
const spreads = readSpread().spreads;
const { jobs, closed, uncoded } = loadWork(spreads, progress);
const todo = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;
console.error(`${todo.length} fiches à lire, ${closed} lignes de marché fermé laissées, ${uncoded} sans code`);

let cursor = 0;
let finished = 0;
const started = Date.now();
async function worker() {
  while (cursor < todo.length) {
    const job = todo[cursor];
    cursor += 1;
    let result;
    try {
      result = await one(job);
    } catch (error) {
      result = { stored: 0, missed: job.lines.length, skipped: 0, note: String(error.message || error).slice(0, 80) };
    }
    await exclusive(() => {
      finished += 1;
      fs.writeFileSync(PROGRESS, JSON.stringify(progress));
      if (finished % FLUSH_EVERY === 0 || finished === todo.length) flush();
    });
    if (finished % 25 === 0 || finished === todo.length) {
      const minutes = (Date.now() - started) / 60000;
      const rate = finished / Math.max(minutes, 0.01);
      const left = (todo.length - finished) / rate;
      console.error(
        `${finished}/${todo.length} fiches, ${stored} carnets, ${left.toFixed(0)} min restantes` +
          (result.note ? ` (${result.note})` : ""),
      );
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, () => worker()));
flush();

let guard = 0;
while (guard < 4) {
  const added = mergeLog();
  const file = readSpread();
  const probe = fs.existsSync(TOUCHES)
    ? fs.readFileSync(TOUCHES, "utf8").split("\n").filter(Boolean).slice(-1).map((line) => JSON.parse(line))[0]
    : null;
  const kept = probe && (file.spreads[probe.isin]?.[probe.mic]?.[probe.currency]?.bp > 0);
  if (!probe || kept) {
    if (guard > 0 || added) console.error(kept ? "le dernier carnet est en place" : "rien à confirmer");
    break;
  }
  guard += 1;
  console.error("le fichier partagé a été réécrit, nouvel essai");
  await sleep(45_000);
}
console.error(`${stored} carnets écrits`);
