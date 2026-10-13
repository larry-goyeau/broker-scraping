// What justTRADE sells in shares and listed funds, with no login.
// The desktop search is the book: a share on Quotrix, LS Exchange or
// Tradegate, and an ETP from a named partner on one of those three.
// French, Italian, Spanish and Greek shares are in that search and are
// not sold, and neither is the ADR of the same company. An ETP the
// partner lists do not name is not sold. Certificates, warrants,
// wikifolios and mutual funds stay out. Swiss shares that these three
// venues list stay; the off-exchange Société Générale book is not this
// search.
//
//   https://www.justtrade.com/produktsuche
//   https://www.justtrade.com/aktienhandel
//   https://www.justtrade.com/etfhandel
//   https://www.justtrade.com/faq
//   https://www.tradegate.de/indizes.php?art=aktien
//   https://www.ls-x.de/de/aktien-filter
//   https://www.ls-x.de/de/etf-filter
//   https://www.quotrix.de/kursblatt/
//
//   node brokers/justtrade/justtrade_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const OUTPUT = new URL("justtrade-parsed.json", import.meta.url);
const TRADEGATE = "https://www.tradegate.de/indizes.php";
const LS = "https://www.ls-x.de";
const QUOTRIX_INDEX = "https://www.quotrix.de/kursblatt/";
const PARTNER_PAGES = [
  "https://www.justtrade.com/etfhandel",
  "https://www.justtrade.com/handelspartner/nxtassets",
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const STOCK_CFI = new Set(["ES", "EP", "ED", "EM"]);
const BLOCKED_COUNTRY = new Set(["FR", "IT", "ES", "GR"]);
const ISIN = /^[A-Z]{2}[A-Z0-9]{10}$/;
const LISTED = /\b(?:ETFs?|ETCs?|ETNs?|ETPs?)\b/i;
const ADR_WORD = /\b(?:ADRs?|GDRs?|ADS)\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&(auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/g, (_, name) => ({
      auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
    }[name]))
    .replace(/\s+/g, " ")
    .trim();
}

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return ISIN.test(text) ? text : "";
}

function wknOfIsin(isin) {
  return String(isin).startsWith("DE000") ? String(isin).slice(5, 11) : "";
}

// LS Exchange writes the WKN as the ticker. One code is one ISIN there.
// The live search is not required when the shared lists already have it.
function loadListWkn() {
  const isinToWkn = new Map();
  const wknToIsin = new Map();
  const places = new Set(["LS", "LSX", "LSIN"]);
  for (const file of ["../../assets/etfs.csv", "../../assets/stocks.csv"]) {
    const csvPath = new URL(file, import.meta.url);
    if (!fs.existsSync(csvPath)) continue;
    for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const columns = line.split(",");
      const place = String(columns[1] || "").trim().toUpperCase();
      if (!places.has(place)) continue;
      const wkn = String(columns[0] || "").trim().toUpperCase().split(":").pop();
      const isin = toIsin(columns[2]);
      if (!wkn || !isin) continue;
      if (!isinToWkn.has(isin)) isinToWkn.set(isin, wkn);
      const prev = wknToIsin.get(wkn);
      if (prev && prev !== isin) wknToIsin.set(wkn, "");
      else wknToIsin.set(wkn, isin);
    }
  }
  for (const [wkn, isin] of wknToIsin) if (!isin) wknToIsin.delete(wkn);
  return { isinToWkn, wknToIsin };
}

function nameKey(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(?:ADRS?|GDRS?|ADS|SPONS(?:ORED)?|UNSP|REGS|144A)\b/g, " ")
    .replace(/\b(?:INHABER|NAMENS|NAMEN|REGISTERED|REG|SHARES|SHARE|SHS|AKTIE|AKTIEN|ACTIONS|ACTION|VORZUGS?\w*|STAMM\w*|INC|CORP|LTD|PLC|AG|SE|SA|SPA|NV|AB|ASA|CO|KGAA|SCA|GROUP|GRP|O\.?N\.?)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lsCookieHeader() {
  const file = new URL("ls-cookies.json", import.meta.url);
  if (!fs.existsSync(file)) return "";
  try {
    const cookies = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(cookies)) return "";
    return cookies
      .filter((cookie) => cookie?.name && cookie?.value)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  } catch {
    return "";
  }
}

async function bodyOf(url, ms = 90_000) {
  let last;
  const cookie = String(url).startsWith(LS) ? lsCookieHeader() : "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/json,application/pdf,*/*",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        signal: AbortSignal.timeout(ms),
      });
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${url} answered ${response.status}`);
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      last = error;
      if (attempt === 3) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw last;
}

async function textOf(url) {
  return (await bodyOf(url)).toString("utf8");
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

function pdfLines(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "justtrade-"));
  const file = path.join(dir, "sheet.pdf");
  fs.writeFileSync(file, bytes);
  let python;
  try {
    python = spawnSync(
      "python3",
      ["-c", `
import json, sys
import fitz
doc = fitz.open(sys.argv[1])
lines = []
for page in doc:
    for line in page.get_text("text").splitlines():
        text = line.strip()
        if text:
            lines.append(text)
json.dump(lines, sys.stdout)
`, file],
      { maxBuffer: 128 * 1024 * 1024, timeout: 120_000 }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (python.status !== 0) {
    const detail = python.stderr?.toString() || "";
    throw new Error(
      detail.includes("No module named 'fitz'")
        ? "PyMuPDF is missing: pip install pymupdf"
        : `Could not read the PDF${detail ? `: ${detail.trim().slice(0, 400)}` : ""}`
    );
  }
  return JSON.parse(python.stdout.toString("utf8"));
}

function productType(line, named) {
  const token = line.toUpperCase();
  const alone = token.match(/^(ETF|ETC|ETN|ETP)S?$/);
  if (alone) return alone[1].replace(/S$/, "");
  // iShares and Xtrackers print the type on the distribution line: "Thesaurierend (Acc) ETF".
  const trailing = line.match(/\b(ETF|ETC|ETN|ETP)s?$/i);
  if (named && trailing && /\b(acc|dist|thesaur|aussch)/i.test(line)) return trailing[1].toUpperCase();
  return "";
}

// The partner sheets are one product per block: ISIN, name, then ETF / ETC / ETP / ETN.
// The name itself often ends in ETP. The type is the later line that is only that word,
// or the distribution line that ends with it.
function productsFromPdf(bytes) {
  const lines = pdfLines(bytes).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const products = [];
  for (let i = 0; i < lines.length; i++) {
    const isin = toIsin(lines[i]);
    if (!isin) continue;
    const nameParts = [];
    let type = "";
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      if (toIsin(lines[j])) break;
      const found = productType(lines[j], nameParts.length > 0);
      if (found) {
        type = found;
        break;
      }
      if (/^(ISIN|NAME|TYP|ANBIETER|SPARPLAN|ERTRAGS)/i.test(lines[j])) continue;
      if (/^(-|x)$/i.test(lines[j])) continue;
      nameParts.push(lines[j]);
    }
    const name = nameParts.join(" ").replace(/\s+/g, " ").trim();
    if (!type || !name) continue;
    products.push({ isin, name, type });
  }
  return products;
}

async function partnerBook() {
  const hrefs = new Set();
  for (const page of PARTNER_PAGES) {
    const html = await textOf(page);
    for (const href of html.match(/href="([^"]+\.pdf)"/g) || []) {
      const path = href.slice(6, -1);
      if (!/ETF-Listen\//.test(path)) continue;
      hrefs.add(new URL(path, page).href);
    }
  }
  if (hrefs.size < 10) throw new Error(`justTRADE published ${hrefs.size} partner lists`);
  const books = await pool([...hrefs], 4, async (url) => {
    console.error(`partner pdf ${url.split("/").pop()}`);
    return productsFromPdf(await bodyOf(url));
  });
  const byIsin = new Map();
  for (const product of books.flat()) {
    const prev = byIsin.get(product.isin);
    if (!prev || product.name.length > prev.name.length) byIsin.set(product.isin, product);
  }
  console.error(`partner lists: ${byIsin.size} products from ${hrefs.size} files`);
  return byIsin;
}

function quotrixInstruments(bytes) {
  const lines = pdfLines(bytes).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const byIsin = new Map();
  for (let i = 0; i < lines.length; i++) {
    const isin = toIsin(lines[i]);
    if (!isin || byIsin.has(isin)) continue;
    let name = "";
    let cfi = "";
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      if (!name && !/^[A-Z]{6}$/.test(lines[j]) && !/^\d{2}\.\d{2}\.\d{4}/.test(lines[j])) name = lines[j];
      if (/^[A-Z]{6}$/.test(lines[j])) {
        cfi = lines[j];
        break;
      }
    }
    if (!name || !cfi) continue;
    byIsin.set(isin, { isin, name, cfi });
  }
  return byIsin;
}

async function latestQuotrix() {
  const html = await textOf(QUOTRIX_INDEX);
  const days = [...html.matchAll(/Kursblatt-Quotrix-(\d{4}\.\d{2}\.\d{2})\.pdf/g)].map((match) => match[1]);
  const day = days.sort().at(-1);
  if (!day) throw new Error("Quotrix published no price sheet");
  const url = `https://www.quotrix.de/dokument-download/quotrix/kursblatt/Kursblatt-Quotrix-${day}.pdf`;
  console.error(`Quotrix price sheet ${day}`);
  return quotrixInstruments(await bodyOf(url, 180_000));
}

function tradegateRows(html) {
  const rows = [];
  const pattern = /href="orderbuch\.php\?isin=([A-Z0-9]{12})"[^>]*>([^<]*)</g;
  for (const match of html.matchAll(pattern)) {
    const isin = toIsin(match[1]);
    const name = decode(match[2]);
    if (isin && name) rows.push({ isin, name });
  }
  return rows;
}

async function tradegate(art) {
  const pages = await pool(LETTERS, 6, async (letter) => {
    const html = await textOf(`${TRADEGATE}?art=${art}&buchstabe=${letter}`);
    return tradegateRows(html);
  });
  const byIsin = new Map();
  for (const row of pages.flat()) {
    if (!byIsin.has(row.isin)) byIsin.set(row.isin, row);
  }
  console.error(`Tradegate ${art}: ${byIsin.size}`);
  return byIsin;
}

function lsRows(html) {
  const rows = [];
  const pattern = /<td><div>([A-Z0-9]{5,6})<\/div><\/td>\s*<td[^>]*>\s*<div><a href="([^"]*)">([^<]*)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const wkn = match[1].toUpperCase();
    const href = decode(match[2]);
    const name = decode(match[3]);
    const isin = toIsin((href.match(/[A-Z]{2}[A-Z0-9]{10}/i) || [])[0]);
    if (name) rows.push({ wkn, name, isin });
  }
  return rows;
}

function lastLsPage(html) {
  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1]));
  return pages.length ? Math.max(...pages) : 1;
}

function lsFromLists(kind) {
  const file = kind === "etf" ? "../../assets/etfs.csv" : "../../assets/stocks.csv";
  const csvPath = new URL(file, import.meta.url);
  const byWkn = new Map();
  if (!fs.existsSync(csvPath)) return byWkn;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const place = String(columns[1] || "").trim().toUpperCase();
    if (place !== "LS" && place !== "LSX") continue;
    const wkn = String(columns[0] || "").trim().toUpperCase().split(":").pop();
    const name = columns.slice(3).join(",").trim();
    if (!wkn || !name || byWkn.has(wkn)) continue;
    byWkn.set(wkn, { wkn, name });
  }
  return byWkn;
}

function lsFromCache(kind) {
  const file = new URL("ls-filter-cache.json", import.meta.url);
  if (!fs.existsSync(file)) return new Map();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return new Map();
  }
  const rows = data?.[kind];
  if (!Array.isArray(rows)) return new Map();
  const byWkn = new Map();
  for (const row of rows) {
    const wkn = String(row?.wkn || "").trim().toUpperCase();
    const name = String(row?.name || "").trim();
    if (!wkn || !name || byWkn.has(wkn)) continue;
    byWkn.set(wkn, { wkn, name, isin: toIsin(row?.isin) });
  }
  return byWkn;
}

function withCachedIsins(kind, rows) {
  const cached = lsFromCache(kind);
  if (!cached.size) return rows;
  for (const row of rows.values()) {
    if (row.isin) continue;
    const prev = cached.get(row.wkn);
    if (prev?.isin) row.isin = prev.isin;
  }
  return rows;
}

async function lsKind(kind) {
  try {
    return withCachedIsins(kind, await lsKindLive(kind));
  } catch (error) {
    const cached = lsFromCache(kind);
    if (cached.size) {
      console.error(`LS ${kind}: site unavailable (${error.message}), ${cached.size} from the saved pages`);
      return cached;
    }
    const rows = lsFromLists(kind);
    console.error(`LS ${kind}: site unavailable (${error.message}), ${rows.size} from the shared lists`);
    return rows;
  }
}

async function lsKindLive(kind) {
  const letters = await pool(LETTERS, 4, async (letter) => {
    const firstUrl = `${LS}/de/${kind}-filter?letter=${encodeURIComponent(letter)}&page=1`;
    const first = await textOf(firstUrl);
    const rows = lsRows(first);
    const last = lastLsPage(first);
    if (last <= 1) return rows;
    const rest = await pool(
      Array.from({ length: last - 1 }, (_, index) => index + 2),
      4,
      async (page) => lsRows(await textOf(`${LS}/de/${kind}-filter?letter=${encodeURIComponent(letter)}&page=${page}`))
    );
    return rows.concat(rest.flat());
  });
  const byWkn = new Map();
  for (const row of letters.flat()) {
    if (!byWkn.has(row.wkn)) byWkn.set(row.wkn, row);
  }
  console.error(`LS ${kind}: ${byWkn.size}`);
  return byWkn;
}

function resolvedHit(query) {
  const file = new URL("ls-resolved.json", import.meta.url);
  if (!fs.existsSync(file)) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const hit = data?.[String(query || "").trim().toUpperCase()];
  const isin = toIsin(hit?.isin);
  const wkn = String(hit?.wkn || "").trim().toUpperCase();
  if (!isin || !wkn) return null;
  return { isin, wkn, name: String(hit.name || "") };
}

async function lookupInstrument(query) {
  const cached = resolvedHit(query);
  if (cached) return cached;
  const url = `${LS}/_rpc/json/.lstc/instrument/search/main?q=${encodeURIComponent(query)}`;
  const cookie = lsCookieHeader();
  let data;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    data = JSON.parse(await response.text());
  } catch {
    return null;
  }
  if (!Array.isArray(data) || !data.length) return null;
  const hit = data.find((row) => row.wkn === query || row.isin === query) || data[0];
  const isin = toIsin(hit.isin);
  const wkn = String(hit.wkn || "").trim().toUpperCase();
  if (!isin) return null;
  return { isin, wkn, name: decode(hit.displayname || "") };
}

const resolved = new Map();

async function resolveQuery(query) {
  if (resolved.has(query)) return resolved.get(query);
  const found = await lookupInstrument(query);
  resolved.set(query, found);
  return found;
}

function addVenue(book, isin, exchange) {
  const row = book.get(isin);
  if (!row) return;
  if (!row.venues) row.venues = new Set();
  row.venues.add(exchange);
}

function stockCandidate(stocks, isin, name, exchange, adr = false) {
  if (!isin || !name) return;
  const prev = stocks.get(isin);
  if (!prev) {
    stocks.set(isin, { isin, name, venues: new Set([exchange]), adr });
    return;
  }
  prev.venues.add(exchange);
  if (name.length > prev.name.length) prev.name = name;
  if (adr) prev.adr = true;
}

function keysMatch(left, right) {
  if (!left || !right) return false;
  if (left === right) return left.length >= 5;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 8 && (longer === shorter || longer.startsWith(`${shorter} `));
}

function unsoldShare(isin, name, adr, blocked) {
  if (BLOCKED_COUNTRY.has(isin.slice(0, 2))) return true;
  const key = nameKey(name);
  const sameCompany = blocked.some((other) => keysMatch(key, other));
  if (!sameCompany) return false;
  return adr || isin.startsWith("US") || ADR_WORD.test(name);
}

const partners = await partnerBook();
const [quotrix, tgShares, tgProducts, lsShares, lsProducts] = await Promise.all([
  latestQuotrix(),
  tradegate("aktien"),
  tradegate("etp"),
  lsKind("aktien"),
  lsKind("etf"),
]);

const stocks = new Map();
for (const row of quotrix.values()) {
  if (partners.has(row.isin)) {
    addVenue(partners, row.isin, "Quotrix");
    continue;
  }
  if (!STOCK_CFI.has(row.cfi.slice(0, 2))) continue;
  stockCandidate(stocks, row.isin, row.name, "Quotrix", row.cfi.startsWith("ED") || ADR_WORD.test(row.name));
}
for (const row of tgShares.values()) {
  if (partners.has(row.isin) || LISTED.test(row.name)) {
    if (partners.has(row.isin)) addVenue(partners, row.isin, "Tradegate");
    continue;
  }
  stockCandidate(stocks, row.isin, row.name, "Tradegate", ADR_WORD.test(row.name));
}
for (const row of tgProducts.values()) {
  if (partners.has(row.isin)) addVenue(partners, row.isin, "Tradegate");
}

const lists = loadListWkn();
const lsQueries = [...lsShares.keys(), ...lsProducts.keys()];
let fromLists = 0;
const unresolved = [];
for (const wkn of lsQueries) {
  const listed = lsShares.get(wkn) || lsProducts.get(wkn);
  const isin = toIsin(listed?.isin) || lists.wknToIsin.get(wkn);
  if (!isin) {
    unresolved.push(wkn);
    continue;
  }
  const found = { isin, wkn, name: "" };
  resolved.set(wkn, found);
  resolved.set(isin, found);
  fromLists += 1;
}
console.error(`resolving ${unresolved.length} LS codes, ${fromLists} already in the lists`);
let looked = 0;
await pool(unresolved, 12, async (wkn) => {
  const found = await resolveQuery(wkn);
  looked += 1;
  if (looked % 500 === 0) console.error(`LS lookup ${looked} of ${unresolved.length}`);
  if (!found) return;
  resolved.set(found.isin, found);
});

for (const row of lsShares.values()) {
  const found = resolved.get(row.wkn);
  const isin = found?.isin;
  if (!isin) continue;
  if (partners.has(isin) || LISTED.test(row.name)) {
    if (partners.has(isin)) addVenue(partners, isin, "LS Exchange");
    continue;
  }
  stockCandidate(stocks, isin, found.name || row.name, "LS Exchange", ADR_WORD.test(row.name) || ADR_WORD.test(found.name));
}
for (const row of lsProducts.values()) {
  const found = resolved.get(row.wkn);
  if (found && partners.has(found.isin)) addVenue(partners, found.isin, "LS Exchange");
}
for (const product of partners.values()) {
  const wkn = wknOfIsin(product.isin);
  if (wkn && (lsProducts.has(wkn) || lsShares.has(wkn))) addVenue(partners, product.isin, "LS Exchange");
}

const blocked = [...stocks.values()]
  .filter((row) => BLOCKED_COUNTRY.has(row.isin.slice(0, 2)))
  .map((row) => nameKey(row.name));
let droppedShares = 0;
let droppedAdr = 0;
for (const [isin, row] of stocks) {
  if (!unsoldShare(isin, row.name, row.adr, blocked)) continue;
  if (BLOCKED_COUNTRY.has(isin.slice(0, 2))) droppedShares += 1;
  else droppedAdr += 1;
  stocks.delete(isin);
}

const wknByIsin = new Map();
for (const hit of resolved.values()) {
  if (hit?.isin && hit.wkn) wknByIsin.set(hit.isin, hit.wkn);
}
const missingWkn = [...stocks.keys()].filter((isin) => !wknOfIsin(isin) && !wknByIsin.has(isin) && !lists.isinToWkn.has(isin));
fs.writeFileSync(new URL("missing-wkn.json", import.meta.url), JSON.stringify(missingWkn));
console.error(`WKN lookup for ${missingWkn.length} shares`);
await pool(missingWkn, 12, async (isin) => {
  const found = await resolveQuery(isin);
  if (found?.wkn) wknByIsin.set(isin, found.wkn);
});

function tickerFor(isin) {
  return wknOfIsin(isin) || wknByIsin.get(isin) || lists.isinToWkn.get(isin) || "";
}

const results = [];
const seen = new Set();
function pushRow(isin, name, exchange, type) {
  const ticker = tickerFor(isin);
  if (!ticker) return;
  const id = `${isin}:${exchange}:${type}`;
  if (seen.has(id)) return;
  seen.add(id);
  results.push({
    query: isin,
    ticker,
    name,
    exchange,
    currency: "EUR",
    type,
    raw: [ticker, name, exchange, "EUR", isin].join(" "),
    isin,
  });
}

for (const row of stocks.values()) {
  for (const exchange of row.venues) pushRow(row.isin, row.name, exchange, "STOCK");
}
let unplaced = 0;
for (const product of partners.values()) {
  if (!product.venues?.size) {
    unplaced += 1;
    continue;
  }
  for (const exchange of product.venues) pushRow(product.isin, product.name, exchange, product.type);
}

if (droppedShares < 50) throw new Error(`only ${droppedShares} French, Italian, Spanish or Greek shares were on the venues`);
const apple = results.find((row) => row.isin === "US0378331005");
if (!apple) throw new Error("Apple was not on Quotrix, LS Exchange or Tradegate");
if (results.some((row) => row.isin === "FR0000120271")) throw new Error("TotalEnergies was kept");
const shares = results.filter((row) => row.type === "STOCK");
const funds = results.filter((row) => row.type !== "STOCK");

results.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker) || left.exchange.localeCompare(right.exchange));

fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(results)), null, 2));
if (shares.length < 8000) throw new Error(`only ${shares.length} share listings`);
if (new Set(funds.map((row) => row.isin)).size < 1400) throw new Error(`only ${funds.length} listed funds`);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    `, left out ${droppedShares} FR/IT/ES/GR shares, ${droppedAdr} ADRs` +
    (unplaced ? `, ${unplaced} partner products not on the three venues` : "")
);
