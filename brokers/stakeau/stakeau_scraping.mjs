// What Stake sells on the ASX and on Wall St. A name is kept when its
// fiche is still a stock or an ETF. The sitemaps list most fiches. The
// explore tables add names the sitemap never linked (ULS, ZILR). The
// Wall St table still leaves many ETFs out, so the sitemap stays. An
// inactive or delisted fiche stays out, and so does an ASX option or a
// deferred line (OPT, DEF). A miss is not cached: a redirect during a
// busy pass was hiding live names. Wall St does not print an ISIN. An
// ASX logo URL sometimes carries one. stampRows fills the rest from the
// shared lists, on the place the fiche names.
//
//   https://hellostake.com/sitemap/stocks/aus.xml
//   https://hellostake.com/sitemap/stocks/wall-st.xml
//   https://hellostake.com/au/invest/wall-st/stocks/spy
//
//   node brokers/stakeau/stakeau_scraping.mjs
//   node brokers/stakeau/stakeau_scraping.mjs --limit=20
//
// A Wall St fiche on a listed exchange (not OTC) is kept only when the US
// symbol directories of the day, Nasdaq Trader's official lists of every
// security listed on a US exchange, name its ticker (a test issue is left
// out); a line they call a warrant or a right is not a stock and stays out
// (a SPAC unit, which holds a share, and a depositary share whose name
// speaks of rights, stay).
// Stake spells the directories' BAC$B as BAC.PRB and GLED.R as GLED.RT.
//
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   (same files as https://www.nasdaqtrader.com/dynamic/SymDir/, whose web
//   copy can answer with a bot check)
//
// The shared lists can stamp a recycled ticker with its former holder's
// ISIN (SATS, EchoStar's until it became ECHO, is now a Strive preferred).
// An ISIN stamped on two American tickers stays only on the one whose name
// shares a word with the lists' name for that ISIN.

import { stampRows } from "../../accepted.mjs";
import { isObligation, withoutObligations } from "../../obligation.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ORIGIN = "https://hellostake.com";
const SITEMAPS = ["stocks/aus.xml", "stocks/wall-st.xml"];
const CACHE = new URL("stake-cache.jsonl", import.meta.url);
const OUTPUT = new URL("stakeau-parsed.json", import.meta.url);
const JOBS = 4;

// Codes read off the fiches. PCQ is Arca, which this repo files as AMEX.
// ASQ is NYSE American (Uranium Energy). BTQ is Cboe (FCTR). PNK is the
// pink sheets. NAQ and NMQ are Nasdaq (Aligos, Symbotic).
const PLACE = {
  ASX: "ASX",
  NSQ: "NASDAQ",
  NMS: "NASDAQ",
  NMQ: "NASDAQ",
  NAQ: "NASDAQ",
  NGQ: "NASDAQ",
  NCM: "NASDAQ",
  NYQ: "NYSE",
  PCQ: "AMEX",
  ASQ: "NYSE American",
  BTQ: "CBOE",
  NYS: "NYSE",
  // Reformation is listed on the NYSE. Stake's code for that fiche is GYQ.
  GYQ: "NYSE",
  PNK: "OTC",
};

const KEEP = new Set(["ACTIVE", "TRADING", ""]);
const CLOSED = new Set([
  "INACTIVE",
  "DELISTED",
  "SUSPENDED",
  "HALTED",
  "CLOSED",
  "CLOSE_ONLY",
  "UPCOMING FLOAT",
  "WITHDRAWN FLOAT",
]);
const SKIP_TYPE = new Set(["INTEREST_RATE", "MUTUAL_FUND", "ALTERNATIVE_ASSET"]);

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let limitedUntil = 0;

// `timeout` is per attempt; `backoff` is the first pause, doubled after
// each failed attempt.
async function textOf(url, { attempts = 8, timeout = 30_000, backoff = 400 } = {}) {
  let last = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pause = limitedUntil - Date.now();
    if (pause > 0) await sleep(pause);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, application/xml, text/html" },
        signal: AbortSignal.timeout(timeout),
      });
      if (response.ok) return await response.text();
      if (response.status === 404) return "";
      last = `${response.status} ${url}`;
      if (response.status === 429) {
        limitedUntil = Date.now() + 4000 * (attempt + 1);
        continue;
      }
      // The explore table answers 400 now and then under load: retry it.
      if (response.status < 500 && response.status !== 400) break;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(Math.min(backoff * 2 ** attempt, 60_000));
  }
  throw new Error(last || url);
}

function pageIsin(instrument) {
  const blob = [instrument.urlImageLight, instrument.urlImageDark].filter(Boolean).join(" ").toUpperCase();
  const found = new Set(blob.match(/[A-Z]{2}[A-Z0-9]{9}\d/g) || []);
  if (found.size !== 1) return "";
  return [...found][0];
}

function kindOf(raw, name) {
  const kind = normalize(raw).toUpperCase();
  if (kind === "ETF" || (!kind && /\bETF\b/i.test(name))) return "ETF";
  if (kind === "ETN" || (!kind && /\bETN\b/i.test(name))) return "ETN";
  if (kind === "ETC" || (!kind && /\bETC\b/i.test(name))) return "ETC";
  if (kind === "EQUITY" || kind === "ADR" || kind === "STOCK") return "STOCK";
  return kind;
}

function leaveOut(name) {
  if (/\bopt\b/i.test(name)) return "option";
  if (/\bdef\b/i.test(name)) return "différé";
  return "";
}

async function fichePaths() {
  const paths = [];
  for (const file of SITEMAPS) {
    // The Wall St sitemap takes about a minute and resets now and then.
    const xml = await textOf(`${ORIGIN}/sitemap/${file}`, { attempts: 5, timeout: 180_000, backoff: 5000 });
    if (!xml) throw new Error(`Stake sitemap missing ${file}`);
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = new URL(decodeXml(match[1]));
      if (/\/stocks\/[^/]+$/.test(url.pathname)) paths.push(url.pathname);
    }
  }
  if (paths.length < 1000) throw new Error(`Stake sitemap listed ${paths.length} fiches`);
  return paths;
}

async function symbolsOf(base) {
  const pageUrl = (page) => `${base}&page=${page}`;
  const first = JSON.parse(await textOf(pageUrl(1)));
  const symbols = (first.results || []).map((row) => row.symbol).filter(Boolean);
  const pages = Number(first.count) || 1;
  if (!symbols.length || pages < 1) throw new Error(`tableau vide ${base}`);
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, index) => index + 2);
  let cursor = 0;
  async function next() {
    while (cursor < rest.length) {
      const page = rest[cursor];
      cursor += 1;
      const body = JSON.parse(await textOf(pageUrl(page)));
      for (const row of body.results || []) if (row.symbol) symbols.push(row.symbol);
    }
  }
  await Promise.all(Array.from({ length: Math.min(JOBS, rest.length) }, () => next()));
  return symbols;
}

function pathFor(book, symbol) {
  const slug = normalize(symbol).toLowerCase();
  if (!slug || /[^a-z0-9.]/.test(slug)) return "";
  const root = book === "ASX" ? "/au/invest/aus/stocks/" : "/au/invest/wall-st/stocks/";
  return `${root}${slug}`;
}

async function buildId() {
  const html = await textOf(`${ORIGIN}/au/invest/wall-st/stocks/spy`);
  const id = html.match(/"buildId":"([^"]+)"/)?.[1];
  if (!id) throw new Error("Stake page did not name a build id");
  return id;
}

async function readFiche(path, id) {
  const body = await textOf(`${ORIGIN}/_next/data/${id}${path}.json`);
  if (!body) return null;
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`unreadable fiche ${path}`);
  }
  const instrument = json?.pageProps?.instrument;
  if (!instrument || json?.pageProps?.__N_REDIRECT) return null;
  const asx = path.includes("/invest/aus/");
  const name = normalize(asx ? instrument.instrumentName : instrument.name);
  const ticker = normalize(asx ? instrument.instrumentSymbol : instrument.symbol).toUpperCase();
  const type = kindOf(asx ? instrument.instrumentType : instrument.type, name);
  const status = normalize(asx ? instrument.tradingStatus : instrument.status).toUpperCase();
  const code = asx ? "ASX" : normalize(instrument.exchange).toUpperCase();
  return { path, ticker, name, type, status, code, isin: asx ? pageIsin(instrument) : "" };
}

const paths = await fichePaths();
const seenPath = new Set(paths);
let added = 0;
for (const [book, base] of [
  ["ASX", `${ORIGIN}/api/asx/instrument/explore?max=100&orderBy=NAME`],
  ["US", `${ORIGIN}/api/us/products/explore?max=40&orderBy=bought`],
]) {
  for (const symbol of await symbolsOf(base)) {
    const path = pathFor(book, symbol);
    if (!path || seenPath.has(path)) continue;
    seenPath.add(path);
    paths.push(path);
    added += 1;
  }
}
const todo = LIMIT > 0 ? paths.slice(0, LIMIT) : paths;
const id = await buildId();
console.error(`${todo.length} fiches, ${added} hors sitemap`);

const cache = new Map();
if (fs.existsSync(CACHE)) {
  for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) {
    if (!line) continue;
    const saved = JSON.parse(line);
    if (!saved.ticker || saved.missing) continue;
    cache.set(saved.path, saved);
  }
}

const seen = new Set();
let cursor = 0;
let read = 0;
async function worker() {
  while (cursor < todo.length) {
    const index = cursor;
    cursor += 1;
    const path = todo[index];
    if ((cache.get(path)?.ticker && !cache.get(path)?.missing) || seen.has(path)) continue;
    seen.add(path);
    const fiche = await readFiche(path, id);
    if (!fiche) continue;
    cache.set(path, fiche);
    fs.appendFileSync(CACHE, `${JSON.stringify(fiche)}\n`);
    read += 1;
    if (read % 400 === 0) console.error(`${read} fiches lues`);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, () => worker()));

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const unknown = new Map();
const results = [];
for (const path of todo) {
  const fiche = cache.get(path);
  if (!fiche || fiche.missing) {
    skip("absente");
    continue;
  }
  const status = fiche.status || "";
  if (CLOSED.has(status)) {
    skip(status.toLowerCase());
    continue;
  }
  if (!KEEP.has(status)) {
    const list = unknown.get(`statut ${status || "(vide)"}`) || [];
    list.push(fiche.ticker);
    unknown.set(`statut ${status || "(vide)"}`, list);
    continue;
  }
  if (!fiche.ticker || /\s/.test(fiche.ticker)) throw new Error(`ticker illisible ${path}`);
  const aside = leaveOut(fiche.name);
  if (aside) {
    skip(aside);
    continue;
  }
  if (!fiche.type || isObligation(fiche.name, fiche.type)) {
    skip("obligation");
    continue;
  }
  if (!["STOCK", "ETF", "ETN", "ETC"].includes(fiche.type)) {
    if (SKIP_TYPE.has(fiche.type)) {
      skip(fiche.type.toLowerCase());
      continue;
    }
    const list = unknown.get(`type ${fiche.type || "(vide)"}`) || [];
    list.push(fiche.ticker);
    unknown.set(`type ${fiche.type || "(vide)"}`, list);
    continue;
  }
  const exchange = PLACE[fiche.code];
  if (!fiche.code) {
    skip("sans place");
    continue;
  }
  if (!exchange) {
    const list = unknown.get(fiche.code || "(vide)") || [];
    list.push(fiche.ticker);
    unknown.set(fiche.code || "(vide)", list);
    continue;
  }
  const name = fiche.name || fiche.ticker;
  results.push({
    query: fiche.isin || fiche.ticker,
    ticker: fiche.ticker,
    name,
    exchange,
    currency: exchange === "ASX" ? "AUD" : "USD",
    type: fiche.type,
    raw: [fiche.ticker, name, fiche.code, fiche.type].filter(Boolean).join(" "),
    isin: fiche.isin || "",
  });
}

if (unknown.size) {
  const detail = [...unknown].map(([code, tickers]) => `${code} (${tickers.slice(0, 6).join(", ")})`).join("; ");
  throw new Error(`fiche non classée : ${detail}`);
}

const seenRow = new Set();
const unique = [];
for (const row of results) {
  const key = `${row.ticker}:${row.exchange}:${row.type}`;
  if (seenRow.has(key)) continue;
  seenRow.add(key);
  unique.push(row);
}
unique.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

// --- US symbol directories ---
const directory = new Map();
const dropped = { unlisted: [], warrant: [] };
const recycled = [];
if (!LIMIT) {
  for (const [file, header] of [
    ["nasdaqlisted.txt", "Symbol|Security Name|Market Category|Test Issue"],
    ["otherlisted.txt", "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF"],
  ]) {
    let body = "";
    try {
      body = execFileSync("curl", ["-s", "--max-time", "120", `ftp://ftp.nasdaqtrader.com/symboldirectory/${file}`], { maxBuffer: 64 << 20 }).toString("utf8");
    } catch {
      body = "";
    }
    if (!body.startsWith(header)) body = await textOf(`https://www.nasdaqtrader.com/dynamic/SymDir/${file}`, { attempts: 4, timeout: 60_000 });
    if (!body.startsWith(header)) throw new Error(`${file}: unexpected header ${body.slice(0, 60)}`);
    for (const line of body.split(/\r?\n/).slice(1)) {
      const cells = line.split("|");
      if (cells.length < 7 || line.startsWith("File Creation Time")) continue;
      const nasdaq = file === "nasdaqlisted.txt";
      if ((nasdaq ? cells[3] : cells[6]) === "Y") continue;
      directory.set(cells[0], { name: cells[1].trim(), etf: (nasdaq ? cells[6] : cells[4]) === "Y" });
      // The CQS spelling too: ACT writes SKYD.W, CQS (and Stake) SKYD.WS.
      if (!nasdaq && cells[3] && !directory.has(cells[3])) directory.set(cells[3], directory.get(cells[0]));
    }
  }
  if (directory.size < 10000) throw new Error(`the US directories hold only ${directory.size} lines`);
  const listedAs = (ticker) => {
    const act = ticker.replace(/\.PR([A-Z]?)$/, "$$$1").replace(/\.RT$/, ".R").replace(/\.WSA$/, ".WS.A");
    const nasdaq = ticker.replace(/\.WS$/, "W").replace(/\.RT$/, "R").replace(/\.U$/, "U").replace(/\./g, "");
    return [ticker, act, nasdaq].map((candidate) => directory.get(candidate)).find(Boolean) || null;
  };
  const listedBooks = new Set(["NASDAQ", "NYSE", "AMEX", "NYSE American", "CBOE"]);
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const row = unique[index];
    if (!listedBooks.has(row.exchange)) continue;
    const entry = listedAs(row.ticker);
    if (!entry) dropped.unlisted.push(`${row.ticker} (${row.name}, ${row.type})`);
    else if (!entry.etf && /\b(warrants?|rights?)\b/i.test(entry.name) && !/\bunits?\b|depositary/i.test(entry.name)) dropped.warrant.push(`${row.ticker} (${entry.name.slice(0, 50)})`);
    else continue;
    unique.splice(index, 1);
  }
  if (dropped.unlisted.length > 300) throw new Error(`${dropped.unlisted.length} listed fiches in no directory: spelling changed?`);
}

const stamped = stampRows(withoutObligations(unique));
if (!LIMIT) {
  const listNames = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "")) || [];
    if (!["NYSE", "NASDAQ", "AMEX", "CBOE"].includes(cells[1]) || !cells[2]) continue;
    if (!listNames.has(cells[2])) listNames.set(cells[2], []);
    listNames.get(cells[2]).push(cells[3] || "");
  }
  const NOISE = new Set("inc corp corporation co company ltd limited plc the and of class common stock shares share ordinary holdings holding group trust series".split(" "));
  const words = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 1 && !NOISE.has(word));
  const byIsin = new Map();
  for (const row of stamped) if (row.isin && !["ASX", "OTC"].includes(row.exchange)) byIsin.set(row.isin, [...(byIsin.get(row.isin) || []), row]);
  for (const [isin, same] of byIsin) {
    if (new Set(same.map((row) => row.ticker)).size < 2) continue;
    const known = new Set((listNames.get(isin) || []).flatMap(words));
    for (const row of same) {
      if (words(row.name).some((word) => known.has(word))) continue;
      recycled.push(`${row.ticker} (${row.name}) lost ${isin}`);
      row.isin = "";
    }
  }
}
for (const row of stamped) {
  if (row.isin) row.query = row.isin;
}

if (!LIMIT) fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const byBook = new Map();
for (const row of stamped) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const withIsin = stamped.filter((row) => row.isin).length;
console.error(
  `${stamped.length} listings, ${withIsin} avec ISIN ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; laissées de côté ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : ""),
);
console.error(`not in the US directories, left out (${dropped.unlisted.length}): ${dropped.unlisted.join("; ")}`);
console.error(`warrants and rights, left out (${dropped.warrant.length}): ${dropped.warrant.join("; ")}`);
console.error(`ISIN of a recycled ticker removed (${recycled.length}): ${recycled.join("; ")}`);
