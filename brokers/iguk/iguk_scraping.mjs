// What IG UK publishes as a share market. The directory is the UK sitemap
// of /uk/shares/markets-shares. Each page names the company and a Reuters
// code (OXIG.L, ADX.N, 5108.T). The quote widget on that page is a spread
// bet; the row keeps the share and the market the Reuters suffix names.
// Options and warrants stay out. A name's "(24 Hours)" is the extended
// session label and is not part of the company.
//
// The Reuters code does not carry an ISIN. One match of that ticker on
// the named market in the shared lists fills it. Several matches stay off
// the row.
//
//   https://www.ig.com/sitemap.xml
//   https://www.ig.com/uk/shares/markets-shares
//
//   node brokers/iguk/iguk_scraping.mjs
//   node brokers/iguk/iguk_scraping.mjs --limit=20

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const INDEX = "https://www.ig.com/sitemap.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

// Reuters equity suffix to the market and the currency that suffix quotes.
const SUFFIX = {
  L: ["LSE", "GBP"],
  N: ["NYSE", "USD"],
  O: ["NASDAQ", "USD"],
  OQ: ["NASDAQ", "USD"],
  A: ["AMEX", "USD"],
  P: ["ARCA", "USD"],
  PK: ["OTC", "USD"],
  AX: ["ASX", "AUD"],
  HK: ["HKEX", "HKD"],
  T: ["XTKS", "JPY"],
  DE: ["XETR", "EUR"],
  F: ["XFRA", "EUR"],
  PA: ["XPAR", "EUR"],
  AS: ["XAMS", "EUR"],
  BR: ["XBRU", "EUR"],
  MI: ["XMIL", "EUR"],
  MC: ["XMAD", "EUR"],
  SW: ["XSWX", "CHF"],
  S: ["XSWX", "CHF"],
  ST: ["XSTO", "SEK"],
  OL: ["XOSL", "NOK"],
  CO: ["XCSE", "DKK"],
  HE: ["XHEL", "EUR"],
  VI: ["XWBO", "EUR"],
  AT: ["XATH", "EUR"],
  SI: ["XSES", "SGD"],
  JO: ["JSE", "ZAR"],
  TO: ["XTSE", "CAD"],
  V: ["XTSX", "CAD"],
  IR: ["XDUB", "EUR"],
  I: ["XDUB", "EUR"],
  LS: ["XLIS", "EUR"],
  WA: ["XWAR", "PLN"],
};

const ASIDE = /\b(options?|warrants?)\b|@\s*[A-Z]{3}\s+EXP\b/i;

// The page names a Reuters suffix, not the quoting currency. The suffix
// currency stays. Another currency is added when this ISIN is already
// quoted on that same venue in that currency.
const DEPOSIT = new Set(["GBP", "USD", "EUR", "AUD"]);
const SUFFIX_CCY = Object.fromEntries(Object.values(SUFFIX).map(([exchange, currency]) => [exchange, currency]));

// A Reuters suffix missing from the table. The labels are the venues that
// suffix can mean. A line is copied onto one of them when this title is
// already filed there. If it is not, the line still takes that venue when
// the suffix names only one, and the currency that venue quotes. `.K`
// names three American venues that all quote dollars, so an unlisted line
// keeps the letters and takes USD. `.ASE` is Aquis; left as ASE it is read
// as the NYSE American.
const SUFFIX_PLACES = {
  J: ["JSE"],
  Z: ["BATS"],
  ASE: ["Aquis"],
  CD: ["CNSX"],
  H: ["Hamburg"],
  VX: ["XSWX"],
  K: ["NYSE", "ARCA", "NYSE American"],
  SG: ["Stuttgart"],
  BE: ["Berlin"],
  SS: ["Shanghai"],
  BK: ["XBKK"],
  BO: ["Bombay"],
  IS: ["Istanbul"],
  KL: ["KLSE"],
  CHA: ["CHIA"],
  CN: ["Colombia"],
  HN: ["HNX"],
  LJ: ["LJSE"],
  HM: ["Hochiminh"],
  NBC: ["XTSE", "XTSX"],
  NLB: ["NEO"],
};

const PLACE_CCY = {
  JSE: "ZAR",
  BATS: "USD",
  Aquis: "GBP",
  CNSX: "CAD",
  Hamburg: "EUR",
  XSWX: "CHF",
  Stuttgart: "EUR",
  Berlin: "EUR",
  Shanghai: "CNY",
  XBKK: "THB",
  Bombay: "INR",
  Istanbul: "TRY",
  KLSE: "MYR",
  CHIA: "AUD",
  Colombia: "COP",
  Hochiminh: "VND",
  NEO: "CAD",
  XTSE: "CAD",
  XTSX: "CAD",
  NYSE: "USD",
  ARCA: "USD",
  "NYSE American": "USD",
};

function placeKey(resolved) {
  return resolved.venue?.mic || resolved.unsourced?.name || "";
}

function cleanCurrency(currency) {
  const ccy = String(currency || "").toUpperCase();
  return ccy === "GBX" ? "GBP" : ccy;
}

export function loadEvidence() {
  const evidence = new Set();
  const places = new Map();
  const books = new Map();
  const listed = new Map();
  const noteDeposit = (mic, isin, currency) => {
    const id = String(isin || "").toUpperCase();
    const ccy = cleanCurrency(currency);
    if (!mic || !id || !DEPOSIT.has(ccy)) return;
    evidence.add(`${mic}|${id}|${ccy}`);
  };
  const notePlace = (row) => {
    const ticker = String(row.ticker || row.query || "").toUpperCase().split(":").pop();
    const isin = String(row.isin || "").toUpperCase();
    const key = placeKey(resolveVenue(row));
    if (!ticker || !isin || !key) return;
    const slot = `${key}|${ticker}`;
    if (!places.has(slot)) places.set(slot, new Map());
    const byIsin = places.get(slot);
    if (!byIsin.has(isin)) byIsin.set(isin, new Map());
    const ccy = cleanCurrency(row.currency);
    if (!ccy) return;
    const counts = byIsin.get(isin);
    counts.set(ccy, (counts.get(ccy) || 0) + 1);
    const isinSlot = `${key}|${isin}`;
    if (!listed.has(isinSlot)) listed.set(isinSlot, new Map());
    const byCurrency = listed.get(isinSlot);
    byCurrency.set(ccy, (byCurrency.get(ccy) || 0) + 1);
  };
  const root = fileUrlDir(new URL("../../brokers", import.meta.url));
  for (const folder of fs.readdirSync(root)) {
    if (folder === "iguk") continue;
    const dir = path.join(root, folder);
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith("-parsed.json")) continue;
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      const list = Array.isArray(data) ? data : data.rows || [];
      for (const row of list) {
        const { venue } = resolveVenue(row);
        noteDeposit(venue?.mic, row.isin, row.currency);
        notePlace(row);
      }
    }
  }
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const table = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8").split(/\r?\n/).slice(1);
    for (const line of table) {
      if (!line) continue;
      const [ticker, exchange, isin] = line.split(",");
      notePlace({ ticker, exchange, isin, currency: "" });
    }
  }
  const book = JSON.parse(fs.readFileSync(new URL("../../spreads/spread.json", import.meta.url), "utf8")).spreads || {};
  for (const [isin, listed] of Object.entries(book)) {
    if (!listed || typeof listed !== "object") continue;
    for (const [mic, currencies] of Object.entries(listed)) {
      if (!currencies || typeof currencies !== "object") continue;
      for (const currency of Object.keys(currencies)) {
        noteDeposit(mic, isin, currency);
        const ccy = cleanCurrency(currency);
        if (!ccy) continue;
        const id = String(isin || "").toUpperCase();
        const slot = `${mic}|${id}`;
        if (!books.has(slot)) books.set(slot, new Set());
        books.get(slot).add(ccy);
      }
    }
  }
  return { evidence, places, books, listed };
}

function currenciesOnTitle(listed, books, place, mic, isin, current) {
  const id = String(isin || "").toUpperCase();
  const have = cleanCurrency(current);
  if (!id) return [];
  const chosen = new Set();
  for (const key of [place, mic]) {
    if (!key) continue;
    const counts = listed.get(`${key}|${id}`);
    if (!counts) continue;
    for (const [ccy, n] of counts) if (ccy && n >= 2) chosen.add(ccy);
  }
  const fromBook = mic ? books.get(`${mic}|${id}`) : null;
  if (fromBook) for (const ccy of fromBook) if (ccy) chosen.add(ccy);
  chosen.delete(have);
  return [...chosen];
}

function primaryCurrency(counts, bookCcys) {
  const entries = [...counts.entries()].filter(([ccy]) => ccy);
  const solid = entries.filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  if (solid.length) return solid[0][0];
  if (entries.length) return entries.sort((a, b) => b[1] - a[1])[0][0];
  const fromBook = [...(bookCcys || [])];
  return fromBook.length === 1 ? fromBook[0] : null;
}

export function assignPlaces(rows, places, books) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const labels = SUFFIX_PLACES[row.exchange];
    const ticker = String(row.ticker || "").toUpperCase();
    if (!labels || ticker.startsWith("0#")) {
      const currency = row.currency || PLACE_CCY[row.exchange] || null;
      out.push(currency === row.currency ? row : { ...row, currency });
      continue;
    }
    const tries = [ticker];
    if (row.exchange === "J" && ticker.endsWith("J") && ticker.length > 2) tries.push(ticker.slice(0, -1));
    const found = [];
    for (const label of labels) {
      const resolved = resolveVenue({ exchange: label, currency: row.currency, isin: row.isin });
      const key = placeKey(resolved);
      if (!key) continue;
      const isins = new Map();
      for (const candidate of tries) {
        const bucket = places.get(`${key}|${candidate}`);
        if (!bucket) continue;
        for (const [isin, counts] of bucket) {
          if (!isins.has(isin)) isins.set(isin, new Map());
          const dest = isins.get(isin);
          for (const [ccy, n] of counts) dest.set(ccy, (dest.get(ccy) || 0) + n);
        }
      }
      if (isins.size !== 1) continue;
      const [isin, counts] = [...isins][0];
      const bookCcys = books.get(`${resolved.venue?.mic || ""}|${isin}`);
      const currency = primaryCurrency(counts, bookCcys) || PLACE_CCY[label] || null;
      found.push({ ...row, exchange: label, currency, isin });
    }
    if (!found.length && labels.length === 1) {
      found.push({ ...row, exchange: labels[0], currency: PLACE_CCY[labels[0]] || null });
    } else if (!found.length) {
      const ccys = [...new Set(labels.map((label) => PLACE_CCY[label]).filter(Boolean))];
      if (ccys.length === 1) found.push({ ...row, currency: ccys[0] });
    }
    const lines = found.length ? found : [row];
    for (const line of lines) {
      const id = `${line.exchange}|${line.ticker}|${line.type}|${line.currency || ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(line);
    }
  }
  return out;
}

function fileUrlDir(url) {
  return fileURLToPath(url);
}

export function expandRows(rows, listed, books) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const suffix = SUFFIX_CCY[row.exchange];
    if (suffix && row.currency !== suffix) continue;
    const resolved = resolveVenue({ exchange: row.exchange, currency: row.currency, isin: row.isin });
    const extras = currenciesOnTitle(listed, books, placeKey(resolved), resolved.venue?.mic, row.isin, row.currency);
    for (const ccy of [row.currency, ...extras]) {
      const key = `${row.exchange}|${row.ticker}|${row.type}|${ccy || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ccy === row.currency ? row : { ...row, currency: ccy });
    }
  }
  return out;
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

const lanes = Math.max(1, numberArg("concurrency", 8));
const walkLimit = numberArg("limit", 0);

function normalize(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s*\(24 Hours\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xml,text/xml,*/*" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
      if (response.status === 404) return "";
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

async function pages() {
  const index = await textOf(INDEX);
  const files = [...index.matchAll(/<loc>([^<]*\/uk\/sitemap-uk-\d+\.xml)<\/loc>/g)].map((match) => match[1]);
  if (files.length < 9) throw new Error(`the UK sitemap index has ${files.length} share files`);
  const urls = [];
  for (const file of files) {
    const xml = await textOf(file);
    for (const match of xml.matchAll(/<loc>([^<]*\/uk\/shares\/markets-shares\/[^<]+)<\/loc>/g)) {
      urls.push(match[1].split("?")[0].replace(/\/+$/, ""));
    }
  }
  return [...new Set(urls)];
}

function parsePage(html) {
  const match = html.match(/<h1 class="ma__title">([^<]+)<\/h1>\s*<span>([^<]+)<\/span>/);
  if (!match) return null;
  const name = normalize(match[1]);
  const reuters = normalize(match[2]).toUpperCase();
  if (!name || !reuters.includes(".")) return null;
  return { name, reuters };
}

function kindOf(name) {
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  if (/\bETF\b/i.test(name)) return "ETF";
  return "STOCK";
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const header = table[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${header.join(",")}`);
    }
    for (const line of table.slice(1)) {
      const cells = line.split(",");
      const code = String(cells[0] || "").trim().toUpperCase().split(":").pop();
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = toIsin(cells[2]);
      if (!code || !isin) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await scrape();

async function scrape() {
const urls = await pages();
if (urls.length < 10000) throw new Error(`the UK share directory has ${urls.length} pages`);
const walk = walkLimit > 0 ? urls.slice(0, walkLimit) : urls;
console.error(`${urls.length} share pages, reading ${walk.length}`);

const isins = loadIsinIndex();
const results = [];
const seen = new Set();
const unknown = new Map();
let aside = 0;
let unread = 0;

await mapLimit(walk, lanes, async (url, index) => {
  const html = await textOf(url);
  const parsed = html ? parsePage(html) : null;
  if (!parsed) {
    unread += 1;
    return;
  }
  if (ASIDE.test(parsed.name) || parsed.reuters.includes("^")) {
    aside += 1;
    return;
  }
  const dot = parsed.reuters.lastIndexOf(".");
  const ticker = parsed.reuters.slice(0, dot);
  const suffix = parsed.reuters.slice(dot + 1);
  const mapped = SUFFIX[suffix];
  if (!mapped) unknown.set(suffix, (unknown.get(suffix) || 0) + 1);
  const exchange = mapped ? mapped[0] : suffix;
  const currency = mapped ? mapped[1] : null;
  const type = kindOf(parsed.name);
  const key = `${exchange}|${ticker}|${type}|${currency || ""}`;
  if (seen.has(key)) return;
  seen.add(key);
  const groups = new Map();
  const ids = isins.get(ticker)?.get(exchange);
  if (ids?.size) groups.set(exchange, ids);
  const row = {
    query: ticker,
    ticker,
    name: parsed.name,
    exchange,
    currency,
    type,
    raw: [ticker, parsed.name, exchange, parsed.reuters].join(" "),
    isin: "",
  };
  const only = stampIsinMatches(row, groups, ticker);
  if (only) row.isin = only;
  results.push(row);
  if ((index + 1) % 200 === 0) console.error(`  ${index + 1}/${walk.length}, ${results.length} listings`);
});

const loaded = loadEvidence();
const placed = assignPlaces(results, loaded.places, loaded.books);
const expanded = expandRows(placed, loaded.listed, loaded.books);
expanded.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type) || String(left.currency || "").localeCompare(String(right.currency || "")));
const kept = stampRows(withoutObligations(expanded));
fs.writeFileSync(new URL("iguk-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
const withIsin = kept.filter((row) => row.isin).length;
const books = new Map();
for (const row of kept) books.set(row.exchange, (books.get(row.exchange) || 0) + 1);
console.error(
  `${kept.length} listings (${withIsin} with an ISIN). Left out: ${aside} options or warrants, ${unread} pages without a Reuters code. ` +
    [...books].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${count} ${name}`).join(", ") +
    (unknown.size ? `. Unmapped suffixes: ${[...unknown].map(([suffix, count]) => `${suffix} ${count}`).join(", ")}.` : ".")
);
}
