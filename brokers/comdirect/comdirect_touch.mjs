// The public fiche prints Geld and Brief for the venue selected in the menu.
// The catalogue never stored them. This reads that touch for every comdirect
// line that still has no book, and writes it into the shared spread file.
//
//   node brokers/comdirect/comdirect_touch.mjs
//   node brokers/comdirect/comdirect_touch.mjs --limit=20

import fs from "node:fs";
import { resolveVenue } from "../../spreads/venues.mjs";

const ORIGIN = "https://www.comdirect.de";
const CATALOGUE = new URL("comdirect-parsed.json", import.meta.url);
const PROGRESS = new URL("comdirect-touch-progress.json", import.meta.url);
const TOUCHES = new URL("comdirect-touches.jsonl", import.meta.url);
const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const EQ = new Set(["STOCK", "ETF", "ETN", "ETC", "ETP"]);
const CONCURRENCY = 4;
const FLUSH_EVERY = 40;

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;

// Same labels as comdirect_scraping.mjs. A paren currency wins over the default.
const PLACE = {
  Xetra: ["Xetra", "EUR"],
  Frankfurt: ["Börse Frankfurt", "EUR"],
  Stuttgart: ["Börse Stuttgart", "EUR"],
  gettex: ["gettex", "EUR"],
  München: ["Munich", "EUR"],
  Hamburg: ["Börse Hamburg", "EUR"],
  Hannover: ["Börse Hannover", "EUR"],
  Düsseldorf: ["Börse Düsseldorf", "EUR"],
  Quotrix: ["Quotrix", "EUR"],
  Tradegate: ["Tradegate", "EUR"],
  "LS Exchange": ["LS Exchange", "EUR"],
  "LT Lang & Schwarz": ["Lang & Schwarz International", "EUR"],
  Nasdaq: ["Nasdaq", "USD"],
  NYSE: ["New York Stock Exchange", "USD"],
  "NYSE American": ["NYSE American", "USD"],
  AMEX: ["NYSE Arca", "USD"],
  "Cboe BZX": ["Cboe BZX", "USD"],
  "FINRA other OTC Issues": ["OTC Markets", "USD"],
  "TSX Venture Exchange": ["TSX Venture", "CAD"],
  "Toronto Stock Exchange": ["Toronto Stock Exchange", "CAD"],
  "SIX SWISS": ["SIX Swiss Exchange", "CHF"],
  "London Stock Exchange": ["London Stock Exchange", "GBP"],
  "Wiener Börse": ["Wiener Börse", "EUR"],
  EuroTLX: ["EuroTLX", "EUR"],
  "Nasdaq Stockholm": ["Nasdaq Stockholm", "SEK"],
  "First North Stockholm": ["First North Stockholm", "SEK"],
  "Nasdaq Copenhagen": ["Nasdaq Copenhagen", "DKK"],
  "Nasdaq Helsinki": ["Nasdaq Helsinki", "EUR"],
  "Euronext Paris": ["Euronext Paris", "EUR"],
  "Euronext Amsterdam": ["Euronext Amsterdam", "EUR"],
  "Euronext Brussels": ["Euronext Brussels", "EUR"],
  "Euronext Lisbon": ["Euronext Lisbon", "EUR"],
  "Euronext Milan": ["Euronext Milan", "EUR"],
  "Euronext Athens": ["Euronext Athens", "EUR"],
  "Oslo Børs": ["Oslo Børs", "NOK"],
  "Tokyo Stock Exchange": ["Tokyo", "JPY"],
  "Australian Securities Exchange": ["Australian Securities Exchange", "AUD"],
  Sydney: ["Australian Securities Exchange", "AUD"],
};

let cookie = "";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#38;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function euroNum(value) {
  const n = Number(String(value).replace(/\./g, "").replace(",", "."));
  return n > 0 ? n : null;
}

function bpFrom(bid, ask) {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
}

function absorb(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (!list.length) return;
  const jar = new Map(cookie.split("; ").filter(Boolean).map((part) => [part.split("=")[0], part]));
  for (const item of list) jar.set(item.split("=")[0], item.split(";")[0]);
  cookie = [...jar.values()].join("; ");
}

async function request(url) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const headers = { "User-Agent": UA, Accept: "text/html", "Accept-Language": "de-DE,de;q=0.9" };
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(40_000) });
      absorb(response);
      if (response.status === 401 && attempt === 0) continue;
      if (response.status === 404 || response.status === 410) return { html: "", url: response.url };
      if (response.ok) return { html: await response.text(), url: response.url };
      last = `${response.status}`;
      if (response.status === 429) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (response.status < 500) break;
    } catch (error) {
      last = String(error.message || error).slice(0, 80);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last || "échec");
}

function placeOf(label) {
  const text = decode(label);
  if (/trade reporting/i.test(text)) return null;
  const paren = text.match(/\(([A-Z]{3})\)\s*$/);
  const base = text.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
  const known = PLACE[base] || PLACE[text];
  if (known) return { exchange: known[0], currency: paren ? paren[1] : known[1] };
  return { exchange: base, currency: paren ? paren[1] : "" };
}

function optionsOf(html) {
  const block = html.match(/id="marketSelect"[\s\S]*?<\/select>/);
  if (!block) return [];
  return [...block[0].matchAll(/<option value="(\d+)"([^>]*)>/g)].map((match) => {
    const label = decode((match[2].match(/label="([^"]*)"/) || [])[1] || "");
    const place = placeOf(label);
    return place ? { id: match[1], ...place, selected: /selected/.test(match[2]) } : null;
  }).filter(Boolean);
}

function touchOf(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const match = text.match(
    /Geld(?:\s+Realtime\s+Kurs)?\s+([0-9][0-9.]*,\d+)\s+Brief(?:\s+Realtime\s+Kurs)?\s+([0-9][0-9.]*,\d+)/,
  );
  if (!match) return null;
  const bid = euroNum(match[1]);
  const ask = euroNum(match[2]);
  const bp = bpFrom(bid, ask);
  return bp == null ? null : { bid, ask, bp };
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

function loadWork() {
  const spreads = JSON.parse(fs.readFileSync(SPREAD, "utf8")).spreads;
  const progress = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, "utf8")) : { isins: {} };
  const rows = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const list = Array.isArray(rows) ? rows : [];
  const byIsin = new Map();
  for (const row of list) {
    if (!row || !EQ.has(String(row.type || "").toUpperCase())) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    const venue = resolveVenue(row).venue;
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency || !venue?.source) continue;
    if (progress.isins[isin]) continue;
    if (hasLeaf(spreads, isin, venue.mic, currency)) continue;
    const key = `${venue.mic}|${currency}`;
    const group = byIsin.get(isin) || byIsin.set(isin, { isin, type: row.type, lines: new Map() }).get(isin);
    if (row.type !== "STOCK") group.type = row.type;
    if (!group.lines.has(key)) {
      group.lines.set(key, { mic: venue.mic, currency, exchange: row.exchange });
    }
  }
  return { jobs: [...byIsin.values()], done: Object.keys(progress.isins).length };
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

function flush() {
  if (!pending.length) return;
  const file = JSON.parse(fs.readFileSync(SPREAD, "utf8"));
  for (const leaf of pending) {
    const book = ((file.spreads[leaf.isin] ||= {})[leaf.mic] ||= {});
    if (book[leaf.currency]?.bp > 0 || book[leaf.currency]?.perShare) continue;
    book[leaf.currency] = { bp: leaf.bp, url: leaf.url };
  }
  file.generatedAt = new Date().toISOString();
  fs.writeFileSync(SPREAD, JSON.stringify(file, null, 2));
  pending = [];
}

function markDone(progress, isin, result) {
  progress.isins[isin] = { at: new Date().toISOString(), ...result };
  fs.writeFileSync(PROGRESS, JSON.stringify(progress));
}

async function fiche(isin, type) {
  const kind = type === "STOCK" ? "aktien" : "etfs";
  const first = await request(`${ORIGIN}/inf/${kind}/${isin}`);
  if (first.html.includes("marketSelect")) return first;
  const other = kind === "aktien" ? "etfs" : "aktien";
  const alt = await request(`${ORIGIN}/inf/${other}/${isin}`);
  return alt.html.includes("marketSelect") ? alt : first;
}

async function one(job) {
  const page = await fiche(job.isin, job.type);
  const options = optionsOf(page.html);
  if (!options.length) return { stored: 0, missed: job.lines.size, note: "pas de menu" };
  const selected = options.find((option) => option.selected) || options[0];
  const first = touchOf(page.html);
  const stem = page.url.split("?")[0];
  let wrote = 0;
  let missed = 0;
  const wanted = [...job.lines.values()];
  const tasks = [];
  for (const line of wanted) {
    const option = options.find((item) => item.exchange === line.exchange && item.currency === line.currency);
    if (!option) {
      missed += 1;
      continue;
    }
    tasks.push(async () => {
      const html = option.id === selected.id ? page.html : (await request(`${stem}?ID_NOTATION=${option.id}`)).html;
      const touch = option.id === selected.id ? first : touchOf(html);
      if (!touch) {
        missed += 1;
        return;
      }
      remember({
        isin: job.isin,
        mic: line.mic,
        currency: line.currency,
        bp: touch.bp,
        url: `${stem}?ID_NOTATION=${option.id}`,
      });
      wrote += 1;
    });
  }
  // The notation pages are independent. Two at a time keeps the fiche's own host comfortable.
  let cursor = 0;
  async function run() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, () => run()));
  return { stored: wrote, missed };
}

const progress = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, "utf8")) : { isins: {} };
const { jobs, done } = loadWork();
const todo = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;
console.error(`${todo.length} fiches à lire, ${done} déjà vues`);

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
      result = { stored: 0, missed: job.lines.size, note: String(error.message || error).slice(0, 80) };
    }
    await exclusive(() => {
      markDone(progress, job.isin, result);
      finished += 1;
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
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, () => worker()));
flush();
console.error(`terminé : ${stored} carnets sur ${todo.length} fiches`);
