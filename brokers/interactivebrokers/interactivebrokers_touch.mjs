// The signed-in portal streams a bid and an ask for one listing. The catalogue
// never stored them. This reads that touch for every Interactive Brokers line
// that still has no book, and writes it into the shared spread file. A venue
// that is closed is left for a later session. The portal page already open,
// on interactivebrokers.ie or interactivebrokers.co.uk, is used as it stands:
// nothing here changes the screen.
//
//   node brokers/interactivebrokers/interactivebrokers_touch.mjs
//   node brokers/interactivebrokers/interactivebrokers_touch.mjs --limit=20

import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveVenue, sessionState } from "../../spreads/venues.mjs";

const CATALOGUE = new URL("interactivebrokers-parsed.json", import.meta.url);
const PROGRESS = new URL("interactivebrokers-touch-progress.json", import.meta.url);
const TOUCHES = new URL("interactivebrokers-touches.jsonl", import.meta.url);
const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
let pageUrl = "https://www.interactivebrokers.ie/portal/";
const EQ = new Set(["STOCK", "ETF", "ETN", "ETC", "ETP"]);
const SEARCH = 4;
const QUOTE = 30;

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;
const bookArg = process.argv.find((arg) => arg.startsWith("--book="));
const BOOK = bookArg ? bookArg.split("=")[1].toLowerCase() : "";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bpFrom(bid, ask) {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
}

function priceOf(value) {
  const text = String(value ?? "").replace(/,/g, "").replace(/^[A-Za-z]+/, "");
  const n = Number(text);
  return n > 0 ? n : null;
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
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const close = Number(venue.hours.close.slice(0, 2)) * 60 + Number(venue.hours.close.slice(3, 5));
  return close - minutes;
}

function fresh(venue, updated, availability) {
  if (!openNow(venue)) return false;
  if (/z|frozen|closed/i.test(String(availability || ""))) return false;
  const when = new Date(Number(updated));
  if (!venue?.hours?.tz || Number.isNaN(when.getTime())) return false;
  if (dayKey(when, venue.hours.tz) !== dayKey(new Date(), venue.hours.tz)) return false;
  return sessionState(venue, when).open === true;
}

function loadWork(spreads, progress) {
  const rows = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const byIsin = new Map();
  let closed = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !EQ.has(String(row.type || "").toUpperCase())) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    const exchange = String(row.exchange || "").toUpperCase();
    const venue = resolveVenue(row).venue;
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency || !exchange || !venue?.source) continue;
    if (/\.EXPERT\b/.test(exchange)) continue;
    const lineKey = `${isin}|${venue.mic}|${currency}`;
    if (progress.lines[lineKey]) continue;
    if (hasLeaf(spreads, isin, venue.mic, currency)) continue;
    if (!openNow(venue)) {
      closed += 1;
      continue;
    }
    const group = byIsin.get(isin) || byIsin.set(isin, { isin, lines: [] }).get(isin);
    if (!group.lines.some((line) => line.mic === venue.mic && line.currency === currency)) {
      group.lines.push({ mic: venue.mic, currency, exchange, venue, lineKey });
    }
  }
  const jobs = [...byIsin.values()];
  jobs.sort(
    (a, b) =>
      Math.min(...a.lines.map((line) => minutesLeft(line.venue))) -
      Math.min(...b.lines.map((line) => minutesLeft(line.venue)))
  );
  return { jobs, closed };
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
  const tmp = `${SPREAD.pathname}.ib-tmp`;
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
const { jobs, closed } = BOOK === "b3" ? { jobs: [], closed: 0 } : loadWork(readSpread().spreads, progress);
const todo = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;
if (BOOK !== "b3") console.error(`${todo.length} fiches à lire, ${closed} lignes de marché fermé laissées`);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 300_000,
});
const target = (await browser.targets()).find((candidate) =>
  /interactivebrokers\.(ie|co\.uk)\/portal/i.test(candidate.url())
);
const page = target ? await target.page() : null;
if (!page) {
  await browser.disconnect();
  throw new Error("La page Interactive Brokers n'est pas ouverte.");
}
pageUrl = page.url().split(/[?#]/)[0];

async function call(path, options = {}) {
  return page.evaluate(
    async (target, opts) => {
      const response = await fetch(`/portal.proxy/v1/portal/${target}`, {
        method: opts.method || "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: opts.body || undefined,
        signal: AbortSignal.timeout(12000),
      });
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, error: text.slice(0, 160) };
      }
    },
    path,
    options
  );
}

const auth = await call("iserver/auth/status");
if (auth.json?.authenticated !== true || auth.json?.connected !== true) {
  await browser.disconnect();
  throw new Error("Le portail n'est pas relié au système de cotation.");
}

async function search(isin) {
  const answer = await call("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol: isin, pattern: true, referrer: "" }),
  });
  if (answer.status === 401 || answer.status === 403) throw new Error("Le portail demande de se reconnecter.");
  return (Array.isArray(answer.json) ? answer.json : [])
    .filter((hit) => hit?.conid && !/\.EXPERT\b/i.test(hit.description || ""))
    .map((hit) => ({
      conid: String(hit.conid),
      exchange: String(hit.description || "").toUpperCase(),
    }));
}

async function quote(conids) {
  if (!conids.length) return new Map();
  const path = `iserver/marketdata/snapshot?conids=${conids.join(",")}&fields=31,84,86,85,88,6509`;
  let rows = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const answer = await call(path);
    rows = Array.isArray(answer.json) ? answer.json : [];
    const ready = rows.filter((row) => priceOf(row["84"]) && priceOf(row["86"])).length;
    if (ready === conids.length) break;
    await sleep(400);
  }
  const byConid = new Map();
  for (const row of rows) byConid.set(String(row.conid), row);
  return byConid;
}

async function contractCurrency(conid) {
  const info = await call(`iserver/contract/${conid}/info`);
  const currency = String(info.json?.currency || "").trim().toUpperCase();
  const exchange = String(info.json?.exchange || "").trim().toUpperCase();
  if (exchange !== "B3" || !/^[A-Z]{3}$/.test(currency)) return "";
  return currency;
}

// São Paulo's cash book. The catalogue only names the real, so each
// contract is asked for its own currency and a second one is kept too.
async function readSaoPaulo() {
  const venue = resolveVenue({ exchange: "B3", currency: "BRL" }).venue;
  if (!venue?.mic) throw new Error("B3 n'a pas de place");
  if (!openNow(venue)) {
    console.error("São Paulo est fermé");
    return;
  }
  const rows = JSON.parse(fs.readFileSync(new URL("../toro/toro-parsed.json", import.meta.url), "utf8"));
  const isins = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const type = String(row?.type || "").toUpperCase();
    const isin = String(row?.isin || "").toUpperCase();
    if (!EQ.has(type) || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || seen.has(isin)) continue;
    seen.add(isin);
    isins.push(isin);
  }
  const list = LIMIT > 0 ? isins.slice(0, LIMIT) : isins;
  const spreads = readSpread().spreads;
  console.error(`${list.length} fiches de São Paulo à lire`);
  let done = 0;
  for (let offset = 0; offset < list.length; offset += SEARCH) {
    const slice = list.slice(offset, offset + SEARCH);
    let found;
    try {
      found = await Promise.all(slice.map(async (isin) => ({ isin, hits: await search(isin) })));
    } catch (error) {
      const message = String(error.message || error);
      console.error(`lot sauté (${message.slice(0, 80)})`);
      if (/reconnecter|navigation/i.test(message)) break;
      continue;
    }
    const chosen = [];
    for (const item of found) {
      item.picked = [];
      const hits = item.hits.filter((hit) => hit.exchange === "B3");
      if (!hits.length) {
        progress.lines[`${item.isin}|${venue.mic}|`] = { at: new Date().toISOString(), stored: 0 };
        continue;
      }
      for (const hit of hits) {
        let currency = "";
        try {
          currency = await contractCurrency(hit.conid);
        } catch (error) {
          console.error(`devise sautée (${String(error.message || error).slice(0, 80)})`);
          continue;
        }
        if (!currency || item.picked.some((row) => row.currency === currency)) continue;
        const lineKey = `${item.isin}|${venue.mic}|${currency}`;
        if (progress.lines[lineKey]?.stored === 1 || hasLeaf(spreads, item.isin, venue.mic, currency)) {
          progress.lines[lineKey] = { at: new Date().toISOString(), stored: 1 };
          continue;
        }
        const picked = { isin: item.isin, conid: hit.conid, currency, lineKey };
        item.picked.push(picked);
        chosen.push(picked);
      }
    }
    const quotes = new Map();
    try {
      for (let i = 0; i < chosen.length; i += QUOTE) {
        const part = await quote(chosen.slice(i, i + QUOTE).map((item) => item.conid));
        for (const [conid, row] of part) quotes.set(conid, row);
      }
    } catch (error) {
      const message = String(error.message || error);
      console.error(`lot sauté (${message.slice(0, 80)})`);
      if (/reconnecter|navigation/i.test(message)) break;
      continue;
    }
    for (const item of found) {
      for (const picked of item.picked) {
        const row = quotes.get(picked.conid);
        const bid = priceOf(row?.["84"]);
        const ask = priceOf(row?.["86"]);
        const bp = bpFrom(bid, ask);
        if (!row || bp == null || !fresh(venue, row._updated, row["6509"])) {
          progress.lines[picked.lineKey] = { at: new Date().toISOString(), stored: 0 };
          continue;
        }
        remember({ isin: picked.isin, mic: venue.mic, currency: picked.currency, bp, url: pageUrl });
        progress.lines[picked.lineKey] = { at: new Date().toISOString(), stored: 1, bp };
      }
      done += 1;
    }
    fs.writeFileSync(PROGRESS, JSON.stringify(progress));
    if (done % 100 < SEARCH || done === list.length) flush();
    const minutes = (Date.now() - started) / 60000;
    const rate = done / Math.max(minutes, 0.01);
    console.error(`${done}/${list.length} fiches, ${stored} carnets, ${((list.length - done) / rate).toFixed(0)} min restantes`);
  }
}

let finished = 0;
const started = Date.now();
try {
  if (BOOK === "b3") {
    await readSaoPaulo();
  } else for (let offset = 0; offset < todo.length; offset += SEARCH) {
    const slice = todo.slice(offset, offset + SEARCH);
    let found;
    try {
      found = await Promise.all(slice.map(async (job) => ({ job, hits: await search(job.isin) })));
    } catch (error) {
      console.error(`lot sauté (${String(error.message || error).slice(0, 80)})`);
      continue;
    }
    const chosen = [];
    for (const item of found) {
      item.missed = [];
      item.picked = [];
      for (const line of item.job.lines) {
        if (!openNow(line.venue)) continue;
        const hit = item.hits.find((row) => row.exchange === line.exchange);
        if (!hit) {
          item.missed.push(line);
          continue;
        }
        const picked = { line, conid: hit.conid };
        item.picked.push(picked);
        chosen.push(picked);
      }
    }
    const quotes = new Map();
    try {
      for (let i = 0; i < chosen.length; i += QUOTE) {
        const part = await quote(chosen.slice(i, i + QUOTE).map((item) => item.conid));
        for (const [conid, row] of part) quotes.set(conid, row);
      }
    } catch (error) {
      console.error(`lot sauté (${String(error.message || error).slice(0, 80)})`);
      continue;
    }
    for (const item of found) {
      for (const line of item.missed) progress.lines[line.lineKey] = { at: new Date().toISOString(), stored: 0 };
      for (const picked of item.picked) {
        const row = quotes.get(picked.conid);
        const bid = priceOf(row?.["84"]);
        const ask = priceOf(row?.["86"]);
        const bp = bpFrom(bid, ask);
        if (!row || bp == null || !fresh(picked.line.venue, row._updated, row["6509"])) {
          progress.lines[picked.line.lineKey] = { at: new Date().toISOString(), stored: 0 };
          continue;
        }
        remember({
          isin: item.job.isin,
          mic: picked.line.mic,
          currency: picked.line.currency,
          bp,
          url: pageUrl,
        });
        progress.lines[picked.line.lineKey] = { at: new Date().toISOString(), stored: 1, bp };
      }
      finished += 1;
    }
    fs.writeFileSync(PROGRESS, JSON.stringify(progress));
    if (finished % 40 < SEARCH || finished === todo.length) flush();
    const minutes = (Date.now() - started) / 60000;
    const rate = finished / Math.max(minutes, 0.01);
    const left = (todo.length - finished) / rate;
    console.error(`${finished}/${todo.length} fiches, ${stored} carnets, ${left.toFixed(0)} min restantes`);
  }
} finally {
  flush();
  await browser.disconnect();
}
console.error(`${stored} carnets écrits`);
