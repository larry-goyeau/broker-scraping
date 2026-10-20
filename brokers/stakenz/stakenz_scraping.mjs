// What Stake sells to New Zealand clients: Wall St only. The NZ site
// offers "U.S. share trading" (ASX fiches answer 404 under /nz/), and its
// pricing covers "any stocks, ETFs or OTC securities". The Wall St universe
// is Stake's group list, read the way brokers/stakeau does it, from several
// lists because none of them is whole:
//
//   - the Wall St sitemap (about 5,900 fiches). It is slow (a minute for
//     700 kB) and resets now and then: it gets a long timeout and retries
//     with backoff, and a failed read no longer ends the run;
//   - the explore table, the API behind /nz/invest/wall-st/stocks (about
//     6,000 names). Its pages shift while they are read: one pass by
//     "bought" saw 5,763 distinct names out of 5,977, so it is read a
//     second time by market cap (together 5,941). PLTR is in neither list;
//   - the how-to-buy and stock-calculator sitemaps (the ~90 most traded
//     names, PLTR among them);
//   - the search box API (productSuggestions: up to 10 names whose ticker
//     starts with the query), asked for each name of MUST below. With
//     --sweep it is also asked every two-character prefix (962 queries,
//     about an hour): this finds names in no list above (ETFs such as
//     GQQQ or HYBX, preferreds, warrants). What it finds lands in the
//     cache, and the cache keeps it in later runs;
//   - every slug of the cache whose fiche was active, so a list that fails
//     or shrinks for a day does not drop titles. A slug no list names any
//     more is read again when its cached line is more than REFRESH_DAYS old.
//
// Each fiche is read under /nz/. A name is kept when its fiche is still an
// active stock, ETF, ETN or ETC. An inactive, delisted, halted or
// close-only fiche stays out. Wall St prints no ISIN: stampRows fills it
// from the shared lists, on the place the fiche names.
//
// Listed tape: a fiche on a US exchange (not OTC) is kept only when the US
// symbol directories of the day, Nasdaq Trader's official lists of every
// listed security, name its ticker; Stake keeps fiches for lines that left
// the tape or never opened (BZH, NTZ, CTBB, ESGRP, OHNO...). A line the
// directories call a warrant or a right ("CLSKW|CleanSpark, Inc. -
// Warrant", "GLED.R|GalaxyEdge Acquisition Corporation Rights to receive
// one-fourth (1/4) of one ordinary share") is not a share and stays out,
// whatever type the fiche prints (HLEO.WS is typed ETF):
//
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   (same files as https://www.nasdaqtrader.com/dynamic/SymDir/)
//
// SATS was EchoStar's ticker until it became ECHO; it is now "Strive, Inc.
// - 15.00% Series A Perpetual SATS Preferred Stock" (nasdaqlisted.txt). The
// shared lists still stamp it with EchoStar's ISIN: an ISIN stamped on two
// tickers stays only on the one whose name agrees with the lists' name.
//
// OTC: only the pink-sheet names one of the sources above reaches are
// here. Stake trades more OTC names on request in the app; those are not
// published.
//
//   https://hellostake.com/sitemap/stocks/wall-st.xml
//   https://hellostake.com/sitemap/how-to-buy/wall-st.xml
//   https://hellostake.com/sitemap/stock-calculator/wall-st.xml
//   https://hellostake.com/api/us/products/explore?max=100&orderBy=bought&page=1
//   https://hellostake.com/api/us/products/productSuggestions/PL
//   https://hellostake.com/nz/invest/wall-st/stocks/spy
//
//   node brokers/stakenz/stakenz_scraping.mjs
//   node brokers/stakenz/stakenz_scraping.mjs --sweep      (adds the prefix sweep)
//   node brokers/stakenz/stakenz_scraping.mjs --limit=20

import { stampRows } from "../../accepted.mjs";
import { isObligation, withoutObligations } from "../../obligation.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ORIGIN = "https://hellostake.com";
const SITEMAP = `${ORIGIN}/sitemap/stocks/wall-st.xml`;
const POPULAR = [`${ORIGIN}/sitemap/how-to-buy/wall-st.xml`, `${ORIGIN}/sitemap/stock-calculator/wall-st.xml`];
const EXPLORE = `${ORIGIN}/api/us/products/explore?max=100`;
const ORDERS = ["bought", "MARKETCAP"];
const SUGGEST = `${ORIGIN}/api/us/products/productSuggestions/`;
const ROOT = "/nz/invest/wall-st/stocks/";
const CACHE = new URL("stakenz-cache.jsonl", import.meta.url);
const OUTPUT = new URL("stakenz-parsed.json", import.meta.url);
const JOBS = 4;
const REFRESH_DAYS = 7;
const TODAY = new Date().toISOString().slice(0, 10);

// Names any run must find, with the type and place their fiche gives.
const MUST = [
  ["AAPL", "STOCK", "Nasdaq"],
  ["MSFT", "STOCK", "Nasdaq"],
  ["NVDA", "STOCK", "Nasdaq"],
  ["PLTR", "STOCK", "Nasdaq"],
  ["TSLA", "STOCK", "Nasdaq"],
  ["AMZN", "STOCK", "Nasdaq"],
  ["GOOGL", "STOCK", "Nasdaq"],
  ["META", "STOCK", "Nasdaq"],
  ["KO", "STOCK", "New York Stock Exchange"],
  ["JPM", "STOCK", "New York Stock Exchange"],
  ["BRK.B", "STOCK", "New York Stock Exchange"],
  ["V", "STOCK", "New York Stock Exchange"],
  ["XOM", "STOCK", "New York Stock Exchange"],
  ["SPY", "ETF", "NYSE Arca"],
  ["VOO", "ETF", "NYSE Arca"],
  ["IVV", "ETF", "NYSE Arca"],
  ["VTI", "ETF", "NYSE Arca"],
  ["IWM", "ETF", "NYSE Arca"],
  ["GLD", "ETF", "NYSE Arca"],
  ["SCHD", "ETF", "NYSE Arca"],
  ["QQQ", "ETF", "Nasdaq"],
  ["TLT", "ETF", "Nasdaq"],
  ["ARKK", "ETF", "Cboe BZX"],
];
// Floors for a whole run: the total, and each place.
const MIN_ROWS = 7000;
const MIN_PLACE = {
  Nasdaq: 3000,
  "New York Stock Exchange": 2000,
  "NYSE Arca": 700,
  "NYSE American": 150,
  "Cboe BZX": 120,
  "OTC Markets": 100,
};

// Codes read off the fiches. PCQ and PSE are NYSE Arca, ASQ NYSE American, BTQ
// Cboe BZX, TXQ NYSE Texas, PNK the pink sheets; NSQ, NMS, NMQ, NAQ, NGQ and NCM are Nasdaq
// tiers. GYQ is the code Stake prints for a NYSE fiche (Reformation).
const PLACE = {
  NSQ: { exchange: "Nasdaq", mic: "XNAS" },
  NMS: { exchange: "Nasdaq", mic: "XNAS" },
  NMQ: { exchange: "Nasdaq", mic: "XNAS" },
  NAQ: { exchange: "Nasdaq", mic: "XNAS" },
  NGQ: { exchange: "Nasdaq", mic: "XNAS" },
  NCM: { exchange: "Nasdaq", mic: "XNAS" },
  NYQ: { exchange: "New York Stock Exchange", mic: "XNYS" },
  NYS: { exchange: "New York Stock Exchange", mic: "XNYS" },
  GYQ: { exchange: "New York Stock Exchange", mic: "XNYS" },
  PCQ: { exchange: "NYSE Arca", mic: "ARCX" },
  // PSE, the old Pacific code, is still printed on a few Arca ETFs (DJIA).
  PSE: { exchange: "NYSE Arca", mic: "ARCX" },
  ASQ: { exchange: "NYSE American", mic: "XASE" },
  BTQ: { exchange: "Cboe BZX", mic: "BATS" },
  PNK: { exchange: "OTC Markets", mic: "OTCM" },
  // NYSE Texas (Dillard's, Energy Transfer, Texas Capital...).
  TXQ: { exchange: "NYSE Texas", mic: "XCHI" },
};

const KEEP = new Set(["ACTIVE", "TRADING", ""]);
const CLOSED = new Set(["INACTIVE", "DELISTED", "SUSPENDED", "HALTED", "CLOSED", "CLOSE_ONLY"]);
const SKIP_TYPE = new Set(["INTEREST_RATE", "MUTUAL_FUND", "ALTERNATIVE_ASSET"]);

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;
const SWEEP = process.argv.includes("--sweep");

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let limitedUntil = 0;

// One GET with retries. A 404 answers "". `timeout` is per attempt;
// `backoff` is the first pause, doubled after each failed attempt.
async function textOf(url, { attempts = 8, timeout = 30_000, backoff = 1000 } = {}) {
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
      last = `${error.message || error} ${url}`;
    }
    await sleep(Math.min(backoff * 2 ** attempt, 60_000));
  }
  throw new Error(last || url);
}

function kindOf(raw, name) {
  const kind = normalize(raw).toUpperCase();
  if (kind === "ETF" || (!kind && /\bETF\b/i.test(name))) return "ETF";
  if (kind === "ETN" || (!kind && /\bETN\b/i.test(name))) return "ETN";
  if (kind === "ETC" || (!kind && /\bETC\b/i.test(name))) return "ETC";
  if (kind === "EQUITY" || kind === "ADR" || kind === "STOCK") return "STOCK";
  return kind;
}

function slugOf(symbol) {
  const slug = normalize(symbol).toLowerCase();
  return slug && !/[^a-z0-9.]/.test(slug) ? slug : "";
}

function slugsOfSitemap(xml, part) {
  const slugs = [];
  const pattern = new RegExp(`<loc>[^<]*/invest/wall-st/${part}/([^<\\/]+)</loc>`, "g");
  for (const match of xml.matchAll(pattern)) slugs.push(match[1].replace(/&amp;/g, "&"));
  return slugs;
}

async function sitemapSlugs() {
  // About a minute for the whole file: give each attempt three.
  const xml = await textOf(SITEMAP, { attempts: 5, timeout: 180_000, backoff: 5000 });
  const slugs = slugsOfSitemap(xml, "stocks");
  if (slugs.length < 5000) throw new Error(`Stake sitemap listed ${slugs.length} fiches`);
  return slugs;
}

async function popularSlugs() {
  const slugs = [];
  for (const url of POPULAR) {
    const xml = await textOf(url, { attempts: 5, timeout: 90_000, backoff: 3000 });
    slugs.push(...slugsOfSitemap(xml, "how-to-buy"), ...slugsOfSitemap(xml, "stock-calculator"));
  }
  if (slugs.length < 50) throw new Error(`Stake popular sitemaps listed ${slugs.length} names`);
  return slugs;
}

async function exploreSlugs(order) {
  const base = `${EXPLORE}&orderBy=${order}`;
  const first = JSON.parse(await textOf(`${base}&page=1`, { timeout: 90_000 }));
  const pages = Number(first.count) || 1;
  const total = Number(first.total) || 0;
  const symbols = (first.results || []).map((row) => row.symbol);
  // Each page takes a few seconds to answer: read them two at a time.
  let next = 2;
  async function reader() {
    while (next <= pages) {
      const page = next;
      next += 1;
      const body = JSON.parse(await textOf(`${base}&page=${page}`, { timeout: 90_000 }));
      for (const row of body.results || []) symbols.push(row.symbol);
      await sleep(250);
    }
  }
  await Promise.all(Array.from({ length: 2 }, () => reader()));
  if (total < 4000 || symbols.length < total * 0.98) throw new Error(`Stake explore table announced ${total}, read ${symbols.length}`);
  return symbols.map(slugOf).filter(Boolean);
}

// The search box: up to 10 names whose ticker starts with the query.
async function suggest(query) {
  const body = await textOf(`${SUGGEST}${encodeURIComponent(query)}`, { attempts: 5, timeout: 60_000 });
  if (!body) return [];
  return (JSON.parse(body).instruments || []).map((row) => row.symbol).filter(Boolean);
}

async function searchSlugs(sweep) {
  const queries = MUST.map(([ticker]) => ticker);
  if (sweep) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const first of alphabet) for (const second of `${alphabet}0123456789.`) queries.push(`${first}${second}`);
  }
  const symbols = [];
  let next = 0;
  let failed = 0;
  async function asker() {
    while (next < queries.length) {
      const query = queries[next];
      next += 1;
      try {
        symbols.push(...(await suggest(query)));
      } catch (error) {
        failed += 1;
        console.error(`search ${query}: ${error.message}`);
      }
      await sleep(250);
    }
  }
  await Promise.all(Array.from({ length: 2 }, () => asker()));
  if (failed > queries.length * 0.1) throw new Error(`Stake search failed on ${failed} of ${queries.length} queries`);
  return symbols.map(slugOf).filter(Boolean);
}

async function buildId() {
  const html = await textOf(`${ORIGIN}${ROOT}spy`, { timeout: 90_000 });
  const id = html.match(/"buildId":"([^"]+)"/)?.[1];
  if (!id) throw new Error("Stake page did not name a build id");
  return id;
}

async function readFiche(slug, id) {
  const body = await textOf(`${ORIGIN}/_next/data/${id}${ROOT}${slug}.json`);
  if (!body) return null;
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`unreadable fiche ${slug}`);
  }
  const instrument = json?.pageProps?.instrument;
  if (!instrument || json?.pageProps?.__N_REDIRECT) return null;
  const name = normalize(instrument.name);
  return {
    slug,
    ticker: normalize(instrument.symbol).toUpperCase(),
    name,
    type: kindOf(instrument.type, name),
    status: normalize(instrument.status).toUpperCase(),
    code: normalize(instrument.exchange).toUpperCase(),
  };
}

// Last line per slug wins. A `missing` line marks a fiche that answered
// 404 or a redirect when it was read again.
const cache = new Map();
if (fs.existsSync(CACHE)) {
  for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) {
    if (!line) continue;
    const saved = JSON.parse(line);
    if (saved.slug && (saved.ticker || saved.missing)) cache.set(saved.slug, saved);
  }
}
const fresh = (slug) => {
  const saved = cache.get(slug);
  return saved && !saved.missing ? saved : null;
};

const slugs = [];
const known = new Set();
const origin = new Map();
const failures = [];
function add(source, list) {
  let count = 0;
  for (const slug of list) {
    if (known.has(slug)) continue;
    known.add(slug);
    slugs.push(slug);
    origin.set(slug, source);
    count += 1;
  }
  console.error(`${source}: ${list.length} names, ${count} new`);
}
async function source(name, read) {
  try {
    add(name, await read());
    return true;
  } catch (error) {
    failures.push(name);
    console.error(`${name} failed: ${error.message}`);
    return false;
  }
}

const sitemapOk = await source("sitemap", sitemapSlugs);
let exploreOk = false;
for (const order of ORDERS) if (await source(`explore ${order}`, () => exploreSlugs(order))) exploreOk = true;
if (!sitemapOk && !exploreOk) throw new Error("Stake sitemap and explore table both failed");
await source("popular", popularSlugs);
await source("search", () => searchSlugs(SWEEP && !LIMIT));
// Every name an earlier run saw active stays in, so one bad day of a list
// does not drop it.
const TRADED = new Set(["STOCK", "ETF", "ETN", "ETC"]);
const cachedActive = [...cache.values()]
  .filter((saved) => !saved.missing && KEEP.has(saved.status) && TRADED.has(saved.type))
  .map((saved) => saved.slug);
add("cache", cachedActive);

const todo = LIMIT > 0 ? slugs.slice(0, LIMIT) : slugs;
const id = await buildId();
// A slug never read is read. A slug only the cache names is read again
// when its line is older than REFRESH_DAYS (a line without a date is).
const stale = (slug) => {
  const at = cache.get(slug)?.at;
  return !at || Date.parse(TODAY) - Date.parse(at) > REFRESH_DAYS * 86_400_000;
};
const reread = new Set(todo.filter((slug) => origin.get(slug) === "cache" && stale(slug)));
console.error(
  `${todo.length} fiches, ${todo.filter((slug) => origin.get(slug) === "cache").length} from the cache alone ` +
    `(${reread.size} read again), ${todo.filter((slug) => !fresh(slug)).length} never read`,
);

let cursor = 0;
let read = 0;
async function worker() {
  while (cursor < todo.length) {
    const slug = todo[cursor];
    cursor += 1;
    if (fresh(slug) && !reread.has(slug)) continue;
    const fiche = await readFiche(slug, id);
    if (!fiche) {
      if (cache.has(slug)) {
        const gone = { slug, missing: true, at: TODAY };
        cache.set(slug, gone);
        fs.appendFileSync(CACHE, `${JSON.stringify(gone)}\n`);
      }
      continue;
    }
    fiche.at = TODAY;
    cache.set(slug, fiche);
    fs.appendFileSync(CACHE, `${JSON.stringify(fiche)}\n`);
    read += 1;
    if (read % 500 === 0) console.error(`${read} fiches read`);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, () => worker()));

const skipped = new Map();
const skip = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);
const unknown = new Map();
const note = (key, ticker) => unknown.set(key, [...(unknown.get(key) || []), ticker]);

const rows = [];
const seen = new Set();
const fromSource = new Map();
for (const slug of todo) {
  const fiche = fresh(slug);
  if (!fiche) {
    skip("no fiche");
    continue;
  }
  if (CLOSED.has(fiche.status) || /FLOAT$/.test(fiche.status)) {
    skip(fiche.status.toLowerCase());
    continue;
  }
  if (!KEEP.has(fiche.status)) {
    note(`status ${fiche.status}`, fiche.ticker);
    continue;
  }
  if (!fiche.ticker || /\s/.test(fiche.ticker)) throw new Error(`unreadable ticker ${slug}`);
  if (!fiche.type || isObligation(fiche.name, fiche.type)) {
    skip("bond");
    continue;
  }
  if (!TRADED.has(fiche.type)) {
    if (SKIP_TYPE.has(fiche.type)) skip(fiche.type.toLowerCase());
    else note(`type ${fiche.type}`, fiche.ticker);
    continue;
  }
  if (!fiche.code) {
    skip("no place");
    continue;
  }
  const place = PLACE[fiche.code];
  if (!place) {
    note(`place ${fiche.code}`, fiche.ticker);
    continue;
  }
  const key = `${fiche.ticker}:${fiche.type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  fromSource.set(origin.get(slug), (fromSource.get(origin.get(slug)) || 0) + 1);
  const name = fiche.name || fiche.ticker;
  rows.push({
    query: fiche.ticker,
    ticker: fiche.ticker,
    name,
    exchange: place.exchange,
    mic: place.mic,
    currency: "USD",
    type: fiche.type,
    isin: "",
    raw: [fiche.ticker, name, fiche.code, fiche.type, fiche.status].filter(Boolean).join(" "),
  });
}

if (unknown.size) {
  const detail = [...unknown].map(([code, tickers]) => `${code} (${tickers.slice(0, 6).join(", ")})`).join("; ");
  throw new Error(`unclassified fiche: ${detail}`);
}

// --- US symbol directories ---
// A listed-tape fiche (not OTC) is kept only when the day's directory of
// listed securities names its ticker; a warrant or a right is not a stock
// and stays out (a SPAC unit, which holds a share, and a depositary share
// whose name speaks of rights, stay). Stake spells the directory's BAC$B
// as BAC.PRB and its GLED.R as GLED.RT; a Nasdaq warrant is CLSKW in both.
const directory = new Map();
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
    const [symbol, name] = cells;
    if ((nasdaq ? cells[3] : cells[6]) === "Y") continue;
    directory.set(symbol, { name: name.trim(), etf: (nasdaq ? cells[6] : cells[4]) === "Y" });
    // The CQS spelling too: ACT writes SKYD.W, CQS (and Stake) SKYD.WS.
    if (!nasdaq && cells[3] && !directory.has(cells[3])) directory.set(cells[3], directory.get(symbol));
  }
}
if (directory.size < 10000) throw new Error(`the US directories hold only ${directory.size} lines`);
function listedAs(ticker) {
  const act = ticker.replace(/\.PR([A-Z]?)$/, "$$$1").replace(/\.RT$/, ".R").replace(/\.WSA$/, ".WS.A");
  const nasdaq = ticker.replace(/\.WS$/, "W").replace(/\.RT$/, "R").replace(/\.U$/, "U").replace(/\./g, "");
  for (const candidate of [ticker, act, nasdaq]) if (directory.has(candidate)) return directory.get(candidate);
  return null;
}
const LEVERAGE = /\b(warrants?|rights?)\b/i;
const dropped = { unlisted: [], warrant: [] };
for (let index = rows.length - 1; index >= 0; index -= 1) {
  const row = rows[index];
  const entry = row.mic === "OTCM" ? null : listedAs(row.ticker);
  if (row.mic !== "OTCM" && !entry) dropped.unlisted.push(`${row.ticker} (${row.name}, ${row.type})`);
  else if (entry && !entry.etf && LEVERAGE.test(entry.name) && !/\bunits?\b|depositary/i.test(entry.name)) dropped.warrant.push(`${row.ticker} (${entry.name.slice(0, 50)})`);
  else continue;
  rows.splice(index, 1);
}

if (dropped.unlisted.length > 0.03 * rows.length) throw new Error(`${dropped.unlisted.length} listed fiches in no directory: spelling changed?`);
rows.sort((left, right) => left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const stamped = stampRows(withoutObligations(rows));

// A ticker the shared lists still give its former holder: SATS was
// EchoStar's (now ECHO) and is today a Strive preferred, which the lists
// stamp with EchoStar's ISIN. An ISIN stamped on two tickers stays only on
// the one whose name agrees with the lists' name for it.
const listNames = new Map();
for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
  const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "")) || [];
  if (!["NYSE", "NASDAQ", "AMEX", "CBOE"].includes(cells[1]) || !cells[2]) continue;
  if (!listNames.has(cells[2])) listNames.set(cells[2], []);
  listNames.get(cells[2]).push(cells[3] || "");
}
const NOISE = new Set("inc corp corporation co company ltd limited plc the and of class common stock shares share ordinary holdings holding group trust series".split(" "));
const words = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 1 && !NOISE.has(word));
const recycled = [];
const byIsin = new Map();
for (const row of stamped) if (row.isin && row.mic !== "OTCM") byIsin.set(row.isin, [...(byIsin.get(row.isin) || []), row]);
for (const [isin, same] of byIsin) {
  if (new Set(same.map((row) => row.ticker)).size < 2) continue;
  const known = new Set((listNames.get(isin) || []).flatMap(words));
  for (const row of same) {
    if (words(row.name).some((word) => known.has(word))) continue;
    recycled.push(`${row.ticker} (${row.name}) lost ${isin}`);
    row.isin = "";
  }
}
for (const row of stamped) if (row.isin) row.query = row.isin;

if (!LIMIT) {
  const missing = MUST.filter(([ticker, type, exchange]) => !stamped.some((row) => row.ticker === ticker && row.type === type && row.exchange === exchange));
  if (missing.length) throw new Error(`well-known names missing: ${missing.map((entry) => entry.join(" ")).join(", ")}`);
  if (stamped.length < MIN_ROWS) throw new Error(`only ${stamped.length} rows (floor ${MIN_ROWS})`);
  for (const [exchange, floor] of Object.entries(MIN_PLACE)) {
    const count = stamped.filter((row) => row.exchange === exchange).length;
    if (count < floor) throw new Error(`only ${count} rows on ${exchange} (floor ${floor})`);
  }
  fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));
}

const counts = new Map();
for (const row of stamped) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${stamped.length} rows, ${stamped.filter((row) => row.isin).length} with ISIN ` +
    `(${[...counts].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    `; first listed by ${[...fromSource].map(([name, count]) => `${name} ${count}`).join(", ")}` +
    (failures.length ? `; failed lists: ${failures.join(", ")}` : "") +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : ""),
);
console.error(`not in the US directories, left out (${dropped.unlisted.length}): ${dropped.unlisted.join("; ")}`);
console.error(`warrants and rights, left out (${dropped.warrant.length}): ${dropped.warrant.join("; ")}`);
console.error(`ISIN of a recycled ticker removed (${recycled.length}): ${recycled.join("; ")}`);
