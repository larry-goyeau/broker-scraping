// What comdirect prints as the shares and ETFs it offers, with no login.
// The share book is the Aktien Finder with "keine Auswahl" (about 26,000).
// The ETF book is the ETF Finder left on "Alle ETFs" (about 4,000). A share
// comdirect quotes only on its home exchange can be outside that finder:
// Some names the search opens are absent from that finder. Apple
// (US0378331005), Siemens and BASF are among them. They are taken from
// the public top-100 lists and the index member pages.
//
// A finder row is one instrument. The places are the Börse list on its
// page, one line per place. "London Stock Exchange European Trade
// Reporting" is a report, not a book, and stays out. Frankfurt is stored
// as Börse Frankfurt so it stays the floor and is not read as Xetra.
//
//   https://www.comdirect.de/inf/aktien/finder.html
//   https://www.comdirect.de/inf/etfs/finder.html
//   https://www.comdirect.de/inf/aktien/selector/trefferliste.html
//   https://www.comdirect.de/inf/etfs/selector/trefferliste.html
//
//   node brokers/comdirect/comdirect_scraping.mjs
//   node brokers/comdirect/comdirect_scraping.mjs --limit=20
//   node brokers/comdirect/comdirect_scraping.mjs --fresh
//   node brokers/comdirect/comdirect_scraping.mjs --extras-only

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const ORIGIN = "https://www.comdirect.de";
const OUTPUT = new URL("comdirect-parsed.json", import.meta.url);
const CACHE = new URL("comdirect-instruments.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const CONCURRENCY = 2;

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;
const FRESH = process.argv.includes("--fresh");
const EXTRAS = process.argv.includes("--extras-only");

// Label comdirect prints, then the place name this registry already resolves,
// then the currency when the label does not name one.
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

// Places named on the foreign-order page, plus the German books and the
// live-trading partners. A fiche with none of these and no order button is
// a quote, not a sale.
const SOLD = new Set([
  "Xetra",
  "Börse Frankfurt",
  "Börse Stuttgart",
  "gettex",
  "Munich",
  "Börse Hamburg",
  "Börse Hannover",
  "Börse Düsseldorf",
  "Quotrix",
  "Tradegate",
  "LS Exchange",
  "Lang & Schwarz International",
  "LT Societe Generale",
  "London Stock Exchange",
  "SIX Swiss Exchange",
  "Nasdaq",
  "New York Stock Exchange",
  "NYSE American",
  "NYSE Arca",
  "OTC Markets",
  "FINRA OTC Bulletin Board",
  "Euronext Milan",
  "Australian Securities Exchange",
  "Wiener Börse",
  "TSX Venture",
  "Toronto Stock Exchange",
  "Euronext Paris",
  "Euronext Amsterdam",
  "First North Stockholm",
  "Nasdaq Stockholm",
  "Euronext Athens",
  "Euronext Oslo",
  "Euronext Growth Oslo",
  "BME Continuous Market",
]);

let cookie = "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decode(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#38;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function productType(name, fallback) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name)) return "ETF";
  return fallback;
}

function absorb(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (!list.length) return;
  const jar = new Map(cookie.split("; ").filter(Boolean).map((part) => [part.split("=")[0], part]));
  for (const item of list) jar.set(item.split("=")[0], item.split(";")[0]);
  cookie = [...jar.values()].join("; ");
}

async function request(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const headers = {
        "User-Agent": UA,
        Accept: "text/html",
        "Accept-Language": "de-DE,de;q=0.9",
        ...(options.headers || {}),
      };
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(url, { ...options, headers, redirect: "follow", signal: AbortSignal.timeout(40_000) });
      absorb(response);
      if (response.status === 401 && attempt === 0) continue;
      if (response.status === 404 || response.status === 410) return "";
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
      if (response.status === 429) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (response.status < 500) break;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

function formFields(html) {
  const form = html.match(/<form\b[^>]*action="[^"]*trefferliste[^"]*"[\s\S]*?<\/form>/i);
  const chunk = form ? form[0] : "";
  const action = chunk.match(/action="([^"]+)"/);
  const fields = new Map();
  if (!chunk) return { action: "", fields };
  for (const tag of chunk.match(/<input\b[^>]*>/g) || []) {
    const name = tag.match(/name="([^"]+)"/);
    if (!name) continue;
    const type = (tag.match(/type="([^"]+)"/) || [])[1] || "text";
    if ((type === "radio" || type === "checkbox") && !/\schecked(?:="checked")?/i.test(tag)) continue;
    const value = (tag.match(/value="([^"]*)"/) || [])[1] || "";
    fields.set(name[1], decode(value));
  }
  return { action: action ? action[1] : "", fields };
}

function parseList(html) {
  const rows = [];
  const seen = new Set();
  for (const part of html.split(/<tr[\s>]/)) {
    const link = part.match(/href="(\/inf\/(?:aktien|etfs)\/(?:[a-z0-9-]*?)([A-Z0-9]{12}))"/i);
    const isin = isinOf(link && link[2]);
    if (!isin) continue;
    const name = decode(
      (part.match(/href="\/inf\/(?:aktien|etfs)\/[A-Z0-9]{12}"[^>]*title="([^"]*)"/i) ||
        part.match(/title="([^"]*)"[^>]*href="\/inf\/(?:aktien|etfs)\/[A-Z0-9]{12}"/i) ||
        [])[1]
    );
    const wkn = ((part.match(/value="(?:[^"|]*\|){2}([^"|]*)"/) || [])[1] || "").trim().toUpperCase();
    if (seen.has(isin)) continue;
    seen.add(isin);
    const shown = decode((part.match(/data-label="Börse"[\s\S]*?title="([^"]*)"/) || [])[1]);
    rows.push({ isin, name, wkn: wkn === "--" ? "" : wkn, shown, path: `/inf/${link[1].includes("/etfs/") ? "etfs" : "aktien"}/${isin}` });
  }
  return rows;
}

async function listKind(path, preselection, fallback) {
  const html = await request(`${ORIGIN}${path}`);
  const { action, fields } = formFields(html);
  if (!action) throw new Error(`no form on ${path}`);
  fields.set("PRESELECTION", preselection);
  if (fields.has("ID_COUNTRY")) fields.set("ID_COUNTRY", "ALL");
  if (fields.has("ID_NOTATION_INDEX")) fields.set("ID_NOTATION_INDEX", "ALL");
  const found = [];
  const seen = new Set();
  for (let offset = 0; offset < 2000; offset += 1) {
    const page = await request(`${ORIGIN}${action}${offset ? `?OFFSET=${offset}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${ORIGIN}${path}` },
      body: new URLSearchParams(fields),
    });
    const rows = parseList(page).filter((row) => !seen.has(row.isin));
    if (!rows.length) break;
    for (const row of rows) {
      seen.add(row.isin);
      found.push({ ...row, type: fallback });
      if (LIMIT > 0 && found.length >= LIMIT) return found;
    }
    if (offset > 0 && offset % 50 === 0) console.error(`  ${path} page ${offset}, ${found.length}`);
  }
  return found;
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

function venuesOf(html, shown) {
  const block = html.match(/id="marketSelect"[\s\S]*?<\/select>/);
  const labels = block ? [...block[0].matchAll(/\blabel="([^"]*)"/g)].map((match) => decode(match[1])).filter(Boolean) : [];
  if (labels.length) return labels.map(placeOf).filter(Boolean);
  const schema = html.match(/Börse:\s*([^",]+),\s*Kurs:\s*[0-9.,]+\s+([A-Z]{3})/);
  if (schema) {
    const place = placeOf(schema[1]);
    if (!place) return [];
    return [{ exchange: place.exchange, currency: schema[2] }];
  }
  const place = shown ? placeOf(shown) : null;
  return place ? [place] : [];
}

function identityOf(html, instrument) {
  const wkn = ((html.match(/WKN:\s*([A-Z0-9]{6})/) || [])[1] || instrument.wkn || "").toUpperCase();
  const heading = decode((html.match(/<h1[^>]*>\s*([^<]+)/) || [])[1] || "").replace(/\s+Aktie$/, "");
  return { wkn: wkn === "--" ? "" : wkn, name: instrument.name || heading };
}

function linesOf(instrument, html) {
  const rows = [];
  const seen = new Set();
  const identity = identityOf(html, instrument);
  for (const venue of venuesOf(html, instrument.shown)) {
    if (!venue.exchange || !venue.currency) continue;
    const key = `${venue.exchange}|${venue.currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const type = instrument.type === "ETF" ? productType(identity.name, "ETF") : "STOCK";
    rows.push({
      ticker: identity.wkn,
      name: identity.name,
      exchange: venue.exchange,
      currency: venue.currency,
      type,
      isin: instrument.isin,
    });
  }
  const order = html.includes('aria-label="Anmelden und Handeln"');
  if (!order && !rows.some((row) => SOLD.has(row.exchange))) return [];
  return rows;
}

function isinsIn(html) {
  const found = new Map();
  for (const match of html.matchAll(/\/inf\/(aktien|etfs)\/[a-z0-9-]*([A-Z]{2}[A-Z0-9]{9}\d)/gi)) {
    const isin = isinOf(match[2]);
    if (!isin || found.has(isin)) continue;
    const kind = match[1].toLowerCase();
    found.set(isin, {
      isin,
      name: "",
      wkn: "",
      shown: "",
      path: `/inf/${kind}/${isin}`,
      type: kind === "etfs" ? "ETF" : "STOCK",
    });
  }
  return [...found.values()];
}

async function listPublished() {
  const top = await request(`${ORIGIN}/inf/aktien/top-100.html`);
  const hub = await request(`${ORIGIN}/inf/maerkte/indizes.html`);
  const paths = new Set();
  for (const match of top.matchAll(/href="(\/inf\/aktien\/top-100\/[^"]+)"/g)) paths.add(match[1]);
  for (const match of hub.matchAll(/href="(\/inf\/indizes\/werte\/[^"]+)"/g)) paths.add(match[1].split("?")[0]);
  const byIsin = new Map();
  for (const path of paths) {
    const html = await request(`${ORIGIN}${path}`);
    for (const row of isinsIn(html)) if (!byIsin.has(row.isin)) byIsin.set(row.isin, row);
  }
  return [...byIsin.values()];
}

async function mapPool(items, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => run()));
  return out;
}

const prior = !FRESH && !LIMIT && fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, "utf8")) : [];
const results = Array.isArray(prior) ? prior : [];
const done = new Set(results.map((row) => row.isin).filter(Boolean));

let shares = [];
let etfs = [];
if (!EXTRAS) {
  if (!FRESH && !LIMIT && fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    shares = cached.shares;
    etfs = cached.etfs;
  } else {
    shares = await listKind("/inf/aktien/finder.html", "KEINE_AUSWAHL", "STOCK");
    etfs = await listKind("/inf/etfs/finder.html", "", "ETF");
    if (!LIMIT) fs.writeFileSync(CACHE, JSON.stringify({ shares, etfs }));
  }
  console.error(`${shares.length} shares, ${etfs.length} ETFs in the finders`);
}

const byIsin = new Map();
for (const row of shares) byIsin.set(row.isin, row);
for (const row of etfs) {
  const priorRow = byIsin.get(row.isin);
  byIsin.set(row.isin, { ...row, wkn: row.wkn || priorRow?.wkn || "", name: row.name || priorRow?.name || "" });
}
const published = await listPublished();
let added = 0;
for (const row of published) {
  if (byIsin.has(row.isin) || done.has(row.isin)) continue;
  byIsin.set(row.isin, row);
  added += 1;
}
console.error(`${published.length} names on the public lists, ${added} not in the file yet`);

let todo = [...byIsin.values()].filter((row) => !done.has(row.isin));
if (LIMIT > 0) todo = todo.slice(0, LIMIT);

let missingFiche = 0;
for (let start = 0; start < todo.length; start += 100) {
  const batch = todo.slice(start, start + 100);
  const pages = await mapPool(batch, (instrument) => request(`${ORIGIN}${instrument.path}`));
  for (let i = 0; i < batch.length; i += 1) {
    const rows = linesOf(batch[i], pages[i] || "");
    if (!rows.length) missingFiche += 1;
    results.push(...rows);
  }
  if (!LIMIT) fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(results)), null, 2));
  console.error(`${Math.min(start + batch.length, todo.length)}/${todo.length} instruments, ${results.length} lines`);
}

const kept = stampRows(withoutObligations(results));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

if (!LIMIT && !EXTRAS) {
  const shareIsins = new Set(shares.map((row) => row.isin));
  const etfIsins = new Set(etfs.map((row) => row.isin));
  if (shareIsins.size < 20000) throw new Error(`only ${shareIsins.size} shares`);
  if (etfIsins.size < 3000) throw new Error(`only ${etfIsins.size} ETFs`);
  const adidas = kept.filter((row) => row.isin === "DE000A1EWWW0").map((row) => row.exchange);
  for (const place of ["Xetra", "Börse Frankfurt", "Börse Stuttgart", "Tradegate"]) {
    if (!adidas.includes(place)) throw new Error(`Adidas is missing ${place}`);
  }
}
if (!LIMIT) {
  const apple = kept.filter((row) => row.isin === "US0378331005");
  if (!apple.some((row) => row.exchange === "Nasdaq" && row.currency === "USD")) {
    throw new Error("Apple had no Nasdaq line");
  }
}

if (!LIMIT && fs.existsSync(CACHE)) fs.unlinkSync(CACHE);

const byPlace = new Map();
for (const row of kept) byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);
console.error(
  `${kept.length} lines, ${new Set(kept.map((row) => row.isin)).size} instruments` +
    (missingFiche ? `, ${missingFiche} without a fiche` : "") +
    ` (${[...byPlace].map(([place, count]) => `${count} ${place}`).join(", ")})`
);
