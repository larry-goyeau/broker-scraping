// What ING Deutschland sells in shares and exchange-traded funds, with no
// login. Two public searches are the book. The share search is the Aktien
// tab, the ETF search the ETF tab. Funds, bonds, certificates and leveraged
// products are other tabs and stay out.
//
// A search row is one instrument. The places it can actually be bought on
// are on its fiche, and they differ: Adidas lists eight German places and
// no American one, Apple adds Nasdaq, a Toronto name adds the TSX. One row
// per place, so each line can carry that place's book. Direkthandel is
// ING's own quote, code TGT, not Tradegate and not gettex. `ing_touch.mjs`
// reads that bid and ask.
//
// The codes below are the ones the fiche prints. An unmapped code keeps
// the name ING printed, rather than being dropped. Frankfurt is stored as
// FRA so it stays the floor and is not read as Xetra. München is stored
// as Munich, the name this registry already uses for that book.
//
//   https://wertpapiere.ing.de/investieren/wertpapiersuche
//   https://wertpapiere.ing.de/investieren/wertpapiersuche/etfs
//   https://component-api.wertpapiere.ing.de/api/v1/instrument-search/share/search
//   https://component-api.wertpapiere.ing.de/api/v1/instrument-header?isinOrSearchTerm=DE000A1EWWW0&isKnownIsin=true&includeAvailableExchanges=true
//
//   node brokers/ing/ing_scraping.mjs
//   node brokers/ing/ing_scraping.mjs --limit=20
//   node brokers/ing/ing_scraping.mjs --fresh

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const API = "https://component-api.wertpapiere.ing.de/api/v1";
const OUTPUT = new URL("ing-parsed.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const CONCURRENCY = 8;

// Fiche code to the place name the venue registry already resolves.
// Direkthandel is left as ING writes it.
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

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;
const FRESH = process.argv.includes("--fresh");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) return null;
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
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

function placeOf(code, name) {
  const key = String(code || "").trim().toUpperCase();
  if (PLACE[key]) return PLACE[key];
  return String(name || "").replace(/\s+/g, " ").trim();
}

async function search(kind, stopAt = 0) {
  const found = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const body = await getJson(`${API}/instrument-search/${kind}/search?pageNumber=${page}&pageSize=100`);
    if (!body) throw new Error(`no ${kind} page ${page}`);
    totalPages = Number(body.totalPages) || page;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) break;
    found.push(...items);
    if (stopAt > 0 && found.length >= stopAt) break;
    page += 1;
  }
  return found;
}

async function fiche(isin) {
  return getJson(
    `${API}/instrument-header?isinOrSearchTerm=${encodeURIComponent(isin)}&isKnownIsin=true&includeAvailableExchanges=true`
  );
}

function linesOf(instrument, header) {
  const exchanges = Array.isArray(header?.exchanges) ? header.exchanges : [];
  const rows = [];
  const seen = new Set();
  for (const venue of exchanges) {
    const exchange = placeOf(venue.exchangeCode, venue.exchangeName);
    const currency = String(venue.currencySymbol || "").trim().toUpperCase();
    if (!exchange || !currency) continue;
    const key = `${exchange}|${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      ticker: instrument.wkn,
      name: instrument.name,
      exchange,
      currency,
      type: instrument.type,
      isin: instrument.isin,
    });
  }
  return rows;
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

const prior = !FRESH && fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, "utf8")) : [];
const done = new Set((Array.isArray(prior) ? prior : []).map((row) => row.isin).filter(Boolean));
const results = Array.isArray(prior) ? prior : [];

const shares = await search("share", LIMIT);
const etfs = await search("etf", LIMIT);
const byIsin = new Map();
for (const row of shares) {
  const isin = isinOf(row.isin);
  if (!isin) continue;
  byIsin.set(isin, {
    isin,
    name: String(row.name || "").replace(/\s+/g, " ").trim(),
    wkn: String(row.wkn || "").trim().toUpperCase(),
    type: "STOCK",
  });
}
for (const row of etfs) {
  const isin = isinOf(row.isin);
  if (!isin) continue;
  const name = String(row.name || "").replace(/\s+/g, " ").trim();
  byIsin.set(isin, {
    isin,
    name,
    wkn: String(row.wkn || "").trim().toUpperCase(),
    type: productType(name, "ETF"),
  });
}

let todo = [...byIsin.values()].filter((row) => !done.has(row.isin));
if (LIMIT > 0) todo = todo.slice(0, LIMIT);

let missingFiche = 0;
for (let start = 0; start < todo.length; start += 200) {
  const batch = todo.slice(start, start + 200);
  const fiches = await mapPool(batch, (instrument) => fiche(instrument.isin));
  for (let i = 0; i < batch.length; i += 1) {
    const rows = fiches[i] ? linesOf(batch[i], fiches[i]) : [];
    if (!rows.length) missingFiche += 1;
    results.push(...rows);
  }
  fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(results)), null, 2));
  console.error(`${Math.min(start + batch.length, todo.length)}/${todo.length} instruments, ${results.length} lines`);
}

const kept = stampRows(withoutObligations(results));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

if (!LIMIT) {
  const shareIsins = new Set(shares.map((row) => isinOf(row.isin)).filter(Boolean));
  const etfIsins = new Set(etfs.map((row) => isinOf(row.isin)).filter(Boolean));
  if (shareIsins.size < 15000) throw new Error(`only ${shareIsins.size} shares`);
  if (etfIsins.size < 2000) throw new Error(`only ${etfIsins.size} ETFs`);
  const adidas = kept.filter((row) => row.isin === "DE000A1EWWW0").map((row) => row.exchange);
  for (const place of ["Direkthandel", "FRA", "Stuttgart", "Xetra", "Munich", "Hamburg", "Hannover", "Düsseldorf"]) {
    if (!adidas.includes(place)) throw new Error(`Adidas is missing ${place}`);
  }
  const apple = kept.filter((row) => row.isin === "US0378331005");
  if (!apple.some((row) => row.exchange === "Nasdaq" && row.currency === "USD")) {
    throw new Error("Apple had no Nasdaq line");
  }
}

const byPlace = new Map();
for (const row of kept) byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);
console.error(
  `${kept.length} lines, ${new Set(kept.map((row) => row.isin)).size} instruments` +
    (missingFiche ? `, ${missingFiche} without a fiche` : "") +
    ` (${[...byPlace].map(([place, count]) => `${count} ${place}`).join(", ")})`
);
