// The whole Tradegate place, as Tradegate BSX lists it: every share, ETF,
// ETN and ETC on its two price lists, minus suspended and delisting lines.
// Shared by the brokers whose only place is Tradegate (tradegate.direct, the
// Sparkassen S-Neo depots, Mintos...): each scraper calls tradegateBook() and
// then applies the exceptions its own pages name.
//
// Sources (Tradegate BSX moved from tradegate.de to tradegatebsx.com; the old
// host answers 301)
//   Price lists, one page per initial (0-9, A-Z):
//     https://www.tradegatebsx.com/indizes.php?art=aktien&buchstabe=A   shares
//     https://www.tradegatebsx.com/indizes.php?art=etp&buchstabe=A      ETPs
//   The other lists of the site (index.php?art=zertifikate, anleihen,
//   fonds) are certificates, bonds and open-ended funds: left out.
//   Each line has bid and ask; a line with "./." for both has no quote. Its
//   order book (refresh.php?isin=, the JSON the order-book page polls) then
//   carries "state", which the page prints as "vom Handel ausgesetzt"
//   (suspended): e.g. Arcosa Inc. and Bougainville Copper on 24 October 2026.
//   The order-book page https://www.tradegatebsx.com/orderbuch.php?isin=<ISIN>
//   gives the WKN, the short code ("Kürzel"), the trading currency and, for an
//   ETP, Tradegate's own kind: "ETF (transparent)", "ETC (transparent)",
//   "ETN (transparent)", "ETF (intransparent)".
//
//   Deutsche Börse's tradable-instrument lists for Xetra and Börse Frankfurt
//   give the short code (Mnemonic, shared by every German venue), the WKN and
//   the instrument type of most lines:
//     https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra
//     https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra/boersefrankfurt
//   A line neither list knows (about 1,400 ETPs, mostly US-domiciled ETFs and
//   Swiss, French and Jersey products, and some 70 shares) takes its code and
//   kind from its Tradegate order-book page; those answers are kept in
//   tradegateBook-details.json next to this file, so a later run reads only
//   the new lines.
//
// What is left out
//   - Suspended lines: no quote on the price list and a "state" on the order
//     book (59 lines on 24 October 2026, all with state "I").
//   - Delisting lines: an ISIN that a Deutsche Börse list marks
//     "PendingDeletion" while neither list has it "Active" (as targobankde
//     does). A line on neither list stays.
//   - Certificates, warrants, bonds and open-ended funds (other Tradegate
//     lists, not read).
//
// Type: the Deutsche Börse type when it lists the ISIN (CS = STOCK, ETF, ETN,
// ETC). Otherwise STOCK on the share list and Tradegate's own kind on the
// ETP list. Three ETP-list lines are CS in Deutsche Börse's lists and stay
// STOCK (Aberdeen India Fund, Japan Smaller Capitalization Fund, Sprott
// Physical Silver Trust). Preferred shares (Strategy Inc. Strife/Stretch)
// stay STOCK.
//
// Row: { query, ticker, name, exchange: "Tradegate", mic: "XGAT",
//        currency: "EUR", type, isin, wkn, raw, list }
//   ticker / query: the Deutsche Börse Mnemonic, else Tradegate's Kürzel,
//   else the ISIN. name: the full name from assets/stocks.csv or
//   assets/etfs.csv for that ISIN, else Tradegate's name. Every Tradegate
//   line trades in euro ("Kurse in EUR" on every page). list: "aktien" or
//   "etp", the Tradegate list the line is on (drop it before writing if the
//   scraper does not want it).
//
// A whole result is kept for the day in tradegateBook-cache.json, so the six
// scrapers of the place read Tradegate once a day.
//
// Usage
//   import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
//   const rows = await tradegateBook();                 // { fresh, log }
//   tradegateBook.stats                                 // counts of the run
//
//   node brokers/tradegatedirect/tradegateBook.mjs            counts
//   node brokers/tradegatedirect/tradegateBook.mjs --fresh    ignore the day cache

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DAY_CACHE = path.join(HERE, "tradegateBook-cache.json");
const DETAILS = path.join(HERE, "tradegateBook-details.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const TG = "https://www.tradegatebsx.com";
const DB = "https://www.cashmarket.deutsche-boerse.com";
const DB_LISTS = [
  { mic: "XETR", page: `${DB}/cash-en/trading/Tradable-Instruments-Xetra`, file: /href="([^"]*t7-xetr-[A-Za-z-]*allTradableInstruments\.csv)"/ },
  { mic: "XFRA", page: `${DB}/cash-en/trading/Tradable-Instruments-Xetra/boersefrankfurt`, file: /href="([^"]*t7-xfra-[A-Za-z-]*allTradableInstruments\.csv)"/ },
];
const LISTS = { aktien: 5000, etp: 3500 }; // list -> fewest lines expected
const INITIALS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DB_TYPES = { CS: "STOCK", ETF: "ETF", ETN: "ETN", ETC: "ETC" };
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const PAUSE = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const berlinDay = (date = new Date()) => date.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

const MARKS = { acute: "\u0301", grave: "\u0300", circ: "\u0302", uml: "\u0308", tilde: "\u0303", cedil: "\u0327", ring: "\u030A", caron: "\u030C" };
const ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", szlig: "ß", oslash: "ø", Oslash: "Ø", aelig: "æ", AElig: "Æ", oelig: "œ", OElig: "Œ", eth: "ð", thorn: "þ", euro: "€", ndash: "–", mdash: "—", reg: "®", trade: "™" };
function decode(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&([A-Za-z])(acute|grave|circ|uml|tilde|cedil|ring|caron);/g, (_, letter, mark) => (letter + MARKS[mark]).normalize("NFC"))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

async function get(url, { timeout = 30000, tries = 3, check = null, json = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = json ? await res.json() : await res.text();
      // Tradegate sometimes answers 200 with an empty body; ask again.
      if (check && !check(body)) throw new Error("incomplete page");
      return body;
    } catch (error) {
      if (attempt >= tries) throw new Error(`${url}: ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

async function pool(items, size, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i], i);
      await sleep(PAUSE);
    }
  }));
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// ---- Tradegate price lists -----------------------------------------------------

function listLines(html) {
  const body = html.split('id="kursliste_abc"')[1]?.split("</tbody>")[0] || "";
  const out = [];
  for (const tr of body.split("<tr").slice(1)) {
    const link = tr.match(/href="orderbuch\.php\?isin=([A-Z0-9]{12})"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || !ISIN.test(link[1])) continue;
    const cell = (id) => decode((tr.match(new RegExp(`id="${id}_\\d+"[^>]*>([^<]*)<`)) || [])[1]);
    const bid = cell("bid");
    const ask = cell("ask");
    out.push({ isin: link[1], name: decode(link[2]), quoted: /\d/.test(bid) || /\d/.test(ask) });
  }
  return out;
}

async function priceList(art, log) {
  const pages = await pool(INITIALS, 2, (initial) =>
    get(`${TG}/indizes.php?art=${art}&buchstabe=${initial}`, { check: (html) => html.includes('id="kursliste_abc"') }).then(listLines)
  );
  const byIsin = new Map();
  for (const line of pages.flat()) if (!byIsin.has(line.isin)) byIsin.set(line.isin, { ...line, list: art });
  log(`  Tradegate ${art}: ${byIsin.size} lines`);
  if (byIsin.size < LISTS[art]) throw new Error(`Tradegate ${art}: only ${byIsin.size} lines`);
  return byIsin;
}

// ---- Tradegate order book ------------------------------------------------------

async function suspended(isin) {
  const book = await get(`${TG}/refresh.php?isin=${isin}`, { json: true });
  return Boolean(book?.state);
}

function bookDetails(html) {
  const cells = [...(html.match(/<th[^>]*>WKN<\/th>[\s\S]*?<\/tr>\s*<tr>([\s\S]*?)<\/tr>/)?.[1] || "").matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => decode(m[1]));
  const [rawWkn = "", rawCode = "", , currency = ""] = cells;
  // A line with no code or WKN reads "./." there.
  const wkn = /^[A-Z0-9]{6}$/.test(rawWkn) ? rawWkn : "";
  const code = /^[A-Z0-9]{2,6}$/.test(rawCode) ? rawCode : "";
  const kind = html.match(/id="handelssystemsegment">[^<]*<br \/><\/span>\s*(ETF|ETC|ETN)\b/)?.[1] || "";
  const state = /<span id="state" style="(?!display:none)[^"]*">/.test(html);
  return { wkn, code, currency, kind, suspended: state };
}

// ---- Deutsche Börse lists --------------------------------------------------------

function csvCells(line) {
  return [...line.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim()).slice(0, -1);
}

// ISIN -> { mnemonic, wkn, type, active, pending }
async function deutscheBorse(wanted, log) {
  const out = new Map();
  for (const list of DB_LISTS) {
    const page = await get(list.page);
    const link = page.match(list.file)?.[1];
    if (!link) throw new Error(`${list.page} no longer links its allTradableInstruments.csv`);
    const lines = (await get(new URL(link, list.page).href, { timeout: 180000 })).split(/\r?\n/);
    const at = lines.findIndex((line) => line.startsWith("Product Status;"));
    if (at < 0) throw new Error(`${list.mic}: header row not found`);
    const header = csvCells(lines[at]);
    const col = Object.fromEntries(["Instrument Status", "ISIN", "WKN", "Mnemonic", "Instrument Type"].map((name) => [name, header.indexOf(name)]));
    if (Object.values(col).some((i) => i < 0)) throw new Error(`${list.mic}: a column is missing`);
    let n = 0;
    for (const line of lines.slice(at + 1)) {
      const c = csvCells(line);
      const isin = c[col.ISIN];
      if (!wanted.has(isin)) continue;
      n++;
      const status = c[col["Instrument Status"]];
      const prev = out.get(isin) || { mnemonic: "", wkn: "", type: "", active: false, pending: false };
      if (!prev.mnemonic && c[col.Mnemonic]) prev.mnemonic = c[col.Mnemonic];
      if (!prev.wkn && c[col.WKN]) prev.wkn = c[col.WKN].replace(/^000/, "");
      if (!prev.type && DB_TYPES[c[col["Instrument Type"]]]) prev.type = DB_TYPES[c[col["Instrument Type"]]];
      if (status === "Active") prev.active = true;
      if (status === "PendingDeletion") prev.pending = true;
      out.set(isin, prev);
    }
    log(`  Deutsche Börse ${list.mic}: ${n} Tradegate ISINs`);
    if (n < 2000) throw new Error(`${list.mic}: only ${n} Tradegate ISINs`);
    await sleep(1000);
  }
  return out;
}

// ---- names -------------------------------------------------------------------------

function assetNames() {
  const names = new Map();
  for (const file of ["assets/etfs.csv", "assets/stocks.csv"]) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const line of text.split(/\r?\n/).slice(1)) {
      const cells = [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, -1);
      const [, , isin, name] = cells;
      if (ISIN.test(isin || "") && name && !names.has(isin)) names.set(isin, name.trim());
    }
  }
  return names;
}

// ---- entry point -----------------------------------------------------------------

export async function tradegateBook({ fresh = false, log = () => {} } = {}) {
  const today = berlinDay();
  const cached = !fresh ? readJson(DAY_CACHE) : null;
  if (cached?.day === today && Array.isArray(cached.rows)) {
    tradegateBook.stats = cached.stats;
    return cached.rows;
  }

  const lines = new Map();
  for (const art of Object.keys(LISTS)) {
    for (const [isin, line] of await priceList(art, log)) if (!lines.has(isin)) lines.set(isin, line);
  }

  const stats = { listed: lines.size, suspended: 0, delisting: 0, kept: 0, byType: {}, byList: {}, bookPages: 0 };

  // Suspended: no quote on the list, a state on the order book.
  const unquoted = [...lines.values()].filter((line) => !line.quoted);
  log(`  checking ${unquoted.length} lines with no quote`);
  const states = await pool(unquoted, 2, (line) => suspended(line.isin));
  unquoted.forEach((line, i) => {
    if (states[i]) {
      lines.delete(line.isin);
      stats.suspended++;
    }
  });

  const db = await deutscheBorse(new Set(lines.keys()), log);
  for (const [isin, d] of db) {
    if (d.pending && !d.active && lines.has(isin)) {
      lines.delete(isin);
      stats.delisting++;
    }
  }

  // Order-book details for the lines Deutsche Börse does not code or type.
  const details = readJson(DETAILS) || {};
  const need = [...lines.values()].filter((line) => {
    const d = db.get(line.isin);
    return !details[line.isin] && (!d?.mnemonic || (line.list === "etp" && !d?.type));
  });
  if (need.length) log(`  reading ${need.length} Tradegate order books`);
  let done = 0;
  await pool(need, 2, async (line) => {
    const html = await get(`${TG}/orderbuch.php?isin=${line.isin}`, { check: (h) => h.includes(line.isin) });
    details[line.isin] = { ...bookDetails(html), at: today };
    stats.bookPages++;
    if (++done % 200 === 0) {
      log(`  order books ${done} of ${need.length}`);
      writeJson(DETAILS, details);
    }
  });
  if (need.length) writeJson(DETAILS, details);

  const names = assetNames();
  const rows = [];
  for (const line of lines.values()) {
    const d = db.get(line.isin);
    const book = details[line.isin];
    if (book?.suspended && book.at === today) { stats.suspended++; continue; }
    let type = d?.type || "";
    if (!type) type = line.list === "aktien" ? "STOCK" : book?.kind || (names.has(line.isin) ? "ETF" : "");
    if (!type) throw new Error(`Tradegate ${line.isin} ${line.name}: no type`);
    const ticker = d?.mnemonic || book?.code || line.isin;
    const wkn = d?.wkn || book?.wkn || "";
    rows.push({
      query: ticker,
      ticker,
      name: names.get(line.isin) || line.name,
      exchange: "Tradegate",
      mic: "XGAT",
      currency: "EUR",
      type,
      isin: line.isin,
      wkn,
      raw: `${line.name} ${line.isin}${wkn ? ` ${wkn}` : ""} ${ticker} | Tradegate EUR`,
      list: line.list,
    });
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    stats.byList[line.list] = (stats.byList[line.list] || 0) + 1;
  }
  stats.kept = rows.length;
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.isin.localeCompare(b.isin));
  writeJson(DAY_CACHE, { day: today, stats, rows });
  tradegateBook.stats = stats;
  return rows;
}

// ---- CLI -------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await tradegateBook({ fresh: process.argv.includes("--fresh"), log: (m) => console.error(m) });
  console.log(JSON.stringify({ rows: rows.length, stats: tradegateBook.stats }, null, 2));
}
