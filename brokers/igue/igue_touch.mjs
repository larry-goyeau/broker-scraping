// The signed-in fiche prints bid and ask for the Tradegate line. The catalogue
// never stored them. This reads that touch for every IG Europe line that still
// has no book, and writes it into the shared spread file. A venue that is
// closed is left for a later session: the quote would be the previous board.
//
//   node brokers/igue/igue_touch.mjs
//   node brokers/igue/igue_touch.mjs --limit=20

import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveVenue, sessionState } from "../../spreads/venues.mjs";

const API = "https://api.ig.com/eu-investments-api-gateway";
const CATALOGUE = new URL("igue-parsed.json", import.meta.url);
const PROGRESS = new URL("igue-touch-progress.json", import.meta.url);
const TOUCHES = new URL("igue-touches.jsonl", import.meta.url);
const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
const EQ = new Set(["STOCK", "ETF", "ETN", "ETC", "ETP"]);

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
  return book[currency]?.bp > 0 || book[currency]?.perShare > 0;
}

function openNow(venue) {
  return sessionState(venue).open === true;
}

function freshQuote(venue, price) {
  if (!openNow(venue)) return false;
  const when = new Date(Number(price?.receivedAt));
  if (Number.isNaN(when.getTime()) || !venue?.hours?.tz) return false;
  if (dayKey(when, venue.hours.tz) !== dayKey(new Date(), venue.hours.tz)) return false;
  return sessionState(venue, when).open === true;
}

function loadWork(spreads, progress) {
  const rows = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const jobs = [];
  let closed = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !EQ.has(String(row.type || "").toUpperCase())) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    const venue = resolveVenue(row).venue;
    const ticker = String(row.ticker || "").trim();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency || !venue?.source || !ticker) continue;
    const lineKey = `${isin}|${venue.mic}|${currency}`;
    if (progress.lines[lineKey]?.stored) continue;
    if (hasLeaf(spreads, isin, venue.mic, currency)) continue;
    if (!openNow(venue)) {
      closed += 1;
      continue;
    }
    jobs.push({ isin, ticker, currency, mic: venue.mic, venue, lineKey });
  }
  return { jobs, closed };
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const page = (await browser.pages()).find((candidate) => candidate.url().includes("deal.ig.com"));
if (!page) {
  await browser.disconnect();
  throw new Error("La page IG n'est pas ouverte.");
}

async function readSession() {
  const cookies = await page.cookies("https://api.ig.com", "https://deal.ig.com");
  const value = (name) => cookies.find((cookie) => cookie.name === name)?.value || "";
  return {
    token: value("X-SECURITY-TOKEN"),
    account: value("preferredAccountId") || value("eu_web_session").split("|")[0],
  };
}

let session = await readSession();
if (!session.token) {
  await browser.disconnect();
  throw new Error("Pas de session IG. Ouvrir deal.ig.com et relancer.");
}

function headers() {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-security-token": session.token,
    ...(session.account ? { "ig-account-id": session.account } : {}),
    "x-ig-device_locale": "en-GB",
    "x-device-user-agent": "vendor=IG Group | applicationType=ig | platform=WTP",
    origin: "https://deal.ig.com",
    referer: "https://deal.ig.com/",
  };
}

async function api(path, body) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        method: body ? "POST" : "GET",
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(400 * attempt);
      continue;
    }
    if (response.status === 404) return null;
    if (response.ok) return response.json();
    if (response.status === 401 || response.status === 403) {
      session = await readSession();
      if (!session.token) throw new Error("IG a fermé la session. Rouvrir deal.ig.com et relancer.");
      await sleep(500);
      continue;
    }
    if (attempt === 4) throw new Error(`IG a répondu ${response.status}`);
    await sleep(400 * attempt);
  }
  return null;
}

async function instrumentId(isin) {
  const found = await api("/instruments/search", { query: isin, pageNumber: 0, pageSize: 20 });
  const hits = found?.instruments || [];
  for (const hit of hits) {
    if (String(hit.isin || "").toUpperCase() === isin && hit.id) return hit.id;
  }
  for (const hit of hits) {
    if (!hit?.id) continue;
    const detail = await api(`/instruments/${hit.id}/details`);
    if (String(detail?.isin || "").toUpperCase() === isin) return hit.id;
  }
  return "";
}

let pending = [];
let stored = 0;

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
  const tmp = `${SPREAD.pathname}.igue-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, SPREAD.pathname);
}

function flush() {
  if (!pending.length) return 0;
  const file = readSpread();
  const added = applyLeaves(file, pending);
  if (added) writeSpread(file);
  pending = [];
  return added;
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
console.error(`${todo.length} fiches à lire, ${closed} lignes de marché fermé laissées`);

try {
  for (const job of todo) {
    if (!openNow(job.venue)) continue;
    let id = "";
    let price = null;
    try {
      id = await instrumentId(job.isin);
      price = id ? await api(`/prices/${id}`) : null;
    } catch (error) {
      progress.lines[job.lineKey] = { at: new Date().toISOString(), stored: 0, note: String(error.message || error).slice(0, 80) };
      console.error(`${job.ticker} sauté (${String(error.message || error).slice(0, 80)})`);
      continue;
    }
    const quoted = String(price?.currency || "").toUpperCase();
    const bp = bpFrom(Number(price?.bid), Number(price?.ask));
    if (!id || quoted !== job.currency || bp == null || !freshQuote(job.venue, price)) {
      progress.lines[job.lineKey] = { at: new Date().toISOString(), stored: 0 };
      console.error(`${job.ticker} ${job.isin} sans touche du jour`);
      continue;
    }
    const url = `https://deal.ig.com/eu/web-platform/instrument/${id}`;
    remember({ isin: job.isin, mic: job.mic, currency: job.currency, bp, url });
    progress.lines[job.lineKey] = { at: new Date().toISOString(), stored: 1, bp };
    console.error(`${job.ticker} ${job.isin} ${bp} bp`);
  }
} finally {
  fs.writeFileSync(PROGRESS, JSON.stringify(progress));
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
