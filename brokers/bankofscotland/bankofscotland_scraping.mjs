// What Bank of Scotland sells in shares and exchange-traded funds, with no login.
// Bank of Scotland Share Dealing is the Halifax Share Dealing Limited
// platform of brokers/lloyds and brokers/halifax, on its own host. On
// 2026-10-20 the share centre announced 4,281 lines (UK, US and Europe
// tabs) and the ETF centre 1,552. Funds, bonds and gilts are other centres
// and are not here. Investment trusts sit in the share list. ETFs only
// show on LSE, Euronext Paris and Xetra, which matches the broker-list
// "Stocks only, no ETFs" on the other places.
//
// The visible line "Trading on" can be a dead name: 1&1 Drillisch prints
// Neuer Markt while the order form says XETRA. The row stores the form's
// market code, mapped to the venue name and MIC below. AIM shares carry the
// LSE code and stay under the London Stock Exchange.
//
// Some ETF pages have no market code at all: a line opened lately (ARK
// Innovation, Vanguard FTSE Global All Cap Acc GBP...) or the second
// currency card of a fund (HAN Goshawk Acc CHF beside Acc GBP). Every ETF of
// the centre is a UCITS line listed in London, so such a card is filed on
// the LSE: the London Stock Exchange's own API gives the line (ticker and
// currency) of the ISIN, in the currency the card's name ends with when
// there is one, else the sterling line. A card whose line is already filed
// (a CHF card when London has no CHF line) adds nothing.
//
// The ETF cards print no ticker: their link carries the site's own fund
// code (GPI6), kept as the ticker of a line whose page has a market code.
// A trailing "(DE)" or "(Acc)" in an ETF name is part of the name.
//
//   https://www.investments.bankofscotland.co.uk/share-centre/
//   https://www.investments.bankofscotland.co.uk/etf-centre/
//
//   node brokers/bankofscotland/bankofscotland_scraping.mjs
//   node brokers/bankofscotland/bankofscotland_scraping.mjs --limit=5
//   node brokers/bankofscotland/bankofscotland_scraping.mjs --fresh
//
// `--limit` reads a sample and does not write the catalogue.
//
// The share centre is not purged of companies that have left the market
// (Ansys, Walgreens, Electronic Arts, Hologic...). An American line is kept
// only when the US symbol directories of the day, Nasdaq Trader's official
// lists of every security listed on a US exchange, name its ticker (a test
// issue is left out):
//
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   (same files as https://www.nasdaqtrader.com/dynamic/SymDir/, whose web
//   copy can answer with a bot check)
//
// A ticker that left the directories while its company is still listed
// under another (BK -> BNY, SQ -> XYZ) is found through the page's ISIN:
// one directory ticker that ../../assets/stocks.csv files with that ISIN on
// an American exchange. The row takes that ticker and the directory's
// listing exchange. A ticker the directories now give to another company
// (no ISIN of the page on it in stocks.csv, no word of the name in common)
// counts as gone.
//
// One instrument on one market is one line. The site can show two cards
// for it: the ETF centre's "1C GBP" and "1C EUR" cards of Xtrackers MSCI
// World Value both order the LSE GBX line, and the share centre still has
// "Daimler AG" (DAI) beside "Mercedes-Benz Group" (MBG), both ISIN
// DE0007100000 on Xetra. The card kept is the one whose ticker is the
// market's own symbol for the ISIN (Xetra: Deutsche Börse's list of
// tradable instruments, where DE0007100000 is MBG; America: the
// directories), then the one whose name ends in the line's currency:
//
//   https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra
//
// A full read is about 5,800 detail pages (~1.5 h). What a page gave (ISIN,
// market code, currency) is kept in bankofscotland-lookedup.json, keyed by
// the page, so a new run reads the lists again (a few minutes) and only the
// pages it does not know yet. A page it does not hold is also known when the
// previous catalogue has one row under the card's name and ticker. A page
// with no market code is never kept, it is read again. `--fresh` ignores both
// and reads every page.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";

const ORIGIN = "https://www.investments.bankofscotland.co.uk";
const OUTPUT = new URL("bankofscotland-parsed.json", import.meta.url);
const CACHE = new URL("bankofscotland-lookedup.json", import.meta.url);
const LSE_API = "https://api.londonstockexchange.com/api/gw/lse";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const REGIONS = ["UK", "US", "EUROPE"];
const PAGE = 100;

function arg(name) {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
}

const limit = Number(arg("limit")) > 0 ? Number(arg("limit")) : 0;
const lanes = Math.max(1, Number(arg("concurrency")) || 6);
const fresh = process.argv.includes("--fresh");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (value) =>
  String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const announcedOf = (html) => {
  const hit = html.match(/Show\s+([\d,]+)\s+results/);
  const count = hit ? Number(hit[1].replace(/,/g, "")) : 0;
  return Number.isInteger(count) && count > 0 ? count : 0;
};

// The share centre sends a header block large enough that undici refuses it.
function request(url, { method = "GET", body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: {
          "User-Agent": UA,
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } : {}),
        },
        maxHeaderSize: 256 * 1024,
        timeout: 40_000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`timeout ${url}`)));
    if (body) req.write(body);
    req.end();
  });
}

async function post(url, body) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await request(url, { method: "POST", body });
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${response.status} ${url}`);
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`${response.status} ${url}`);
      return response.text;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw last;
}

async function get(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await request(url);
      if (response.status === 404) return "";
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${response.status} ${url}`);
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`${response.status} ${url}`);
      return response.text;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw last;
}

function named(text) {
  const clean = decode(text);
  const parts = clean.match(/^(.*)\s+\(([^)]+)\)$/);
  return {
    name: parts ? parts[1].trim() : clean,
    ticker: (parts ? parts[2] : "").toUpperCase(),
  };
}

function shareRows(html) {
  const rows = [];
  const patterns = [
    [/href="(\/share-centre\/details\/\?csid=(\d+))"[^>]*>\s*([^<]+?)\s*<\/a>/gi, 2, 3],
    [/href="(\/investment-trust-centre\/details\/([A-Z0-9]{12}\/[^"]+))"[^>]*>\s*([^<]+?)\s*<\/a>/gi, 2, 3],
  ];
  for (const [pattern, idGroup, nameGroup] of patterns) {
    for (const match of html.matchAll(pattern)) {
      rows.push({ kind: "share", id: match[idGroup], path: match[1], label: decode(match[nameGroup]), ...named(match[nameGroup]) });
    }
  }
  // A few preference shares are listed with an empty link. The detail page is still the csid.
  const blank = /<tr\s+data-csid="(\d+)"(?:(?!<tr\s)[\s\S])*?<a(?: class="link__mobile")?\s+href="">\s*([^<]+?)\s*<\/a>/gi;
  for (const match of html.matchAll(blank)) {
    rows.push({
      kind: "share",
      id: match[1],
      path: `/share-centre/details/?csid=${match[1]}`,
      label: decode(match[2]),
      ...named(match[2]),
    });
  }
  // Some hosts print the name without "(TICKER)"; the row's preview link
  // still carries it: data-url="/search/stock/details/?csid=28301&amp;ticker=DRI".
  // That ticker wins: a name can end in its own brackets, "Protalix
  // Biotherapeutics, Inc. (De)" with no "(PLX)" after it, and the brackets
  // then stay in the name.
  const tickers = new Map();
  for (const match of html.matchAll(/csid=(\d+)&amp;ticker=([^"&]+)"/g)) tickers.set(match[1], decode(match[2]).toUpperCase());
  for (const row of rows) {
    const ticker = tickers.get(row.id);
    if (ticker && ticker !== row.ticker) {
      if (row.ticker) row.name = row.label;
      row.ticker = ticker;
    }
    delete row.label;
  }
  return rows;
}

function etfRows(html) {
  const rows = [];
  const pattern = /href="\/etf-centre\/details\/([A-Z0-9]{12})\/([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    rows.push({
      kind: "etf",
      id: `${match[1]}/${match[2]}`,
      path: `/etf-centre/details/${match[1]}/${match[2]}`,
      isin: match[1].toUpperCase(),
      name: decode(match[3]),
      ticker: match[2].toUpperCase(),
    });
  }
  return rows;
}

async function loadShares() {
  const jobs = [];
  const seen = new Set();
  for (const region of REGIONS) {
    let announced = 0;
    const found = [];
    for (let page = 1; page < 80; page += 1) {
      // An empty page before the announced total is a hiccup: ask again, up to
      // six times (the list stops early when it has its total).
      let html = "";
      let rows = [];
      for (let attempt = 0; attempt < 6 && !rows.length; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
        html = await post(
          `${ORIGIN}/search/stock?from=${page}&size=${PAGE}&orderField=name&orderType=ASC&marketCapMin=&marketCapMax=&region=${region}`,
          `page=${page}`
        );
        rows = shareRows(html);
      }
      announced ||= announcedOf(html);
      if (!rows.length) break;
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        found.push({ ...row, region });
      }
      if (announced && found.length >= announced) break;
    }
    if (!limit && found.length !== announced) {
      throw new Error(`${region} announced ${announced} shares and returned ${found.length}`);
    }
    console.error(`${found.length} ${region} shares`);
    jobs.push(...found);
  }
  return jobs;
}

async function loadEtfs() {
  const jobs = [];
  const seen = new Set();
  let announced = 0;
  // Page 1 is offset 0 (offset 1 repeats it). The next button sends 2, then 3.
  for (let page = 0; page < 40; page += 1) {
    if (page === 1) continue;
    // An empty page before the announced total is a hiccup: ask again, up to
    // six times (the list stops early when it has its total).
    let html = "";
    let rows = [];
    for (let attempt = 0; attempt < 6 && !rows.length; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      html = await post(
        `${ORIGIN}/modules/etf/result/?orderField=UnitNameLong&orderType=asc&offset=0&limit=50`,
        `offset=${page}`
      );
      rows = etfRows(html);
    }
    announced ||= announcedOf(html);
    if (!rows.length) break;
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      jobs.push(row);
    }
    if (announced && jobs.length >= announced) break;
  }
  if (!limit && jobs.length !== announced) {
    throw new Error(`ETFs announced ${announced} and returned ${jobs.length}`);
  }
  console.error(`${jobs.length} ETFs`);
  return jobs;
}

function hidden(html, name) {
  const match = html.match(new RegExp(`name="${name}" value="([^"]*)"`));
  return decode(match?.[1] || "");
}

function listingType(kind, name) {
  if (kind === "share") return "STOCK";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  return "ETF";
}

// The order form's market code, as spreads/venues.mjs names the venue.
// AMEX lines are NYSE American companies (Alpha Pro Tech, Avino...), not
// NYSE Arca, which "AMEX" would resolve to.
const MARKETS = {
  LSE: ["LSE", "XLON"],
  NYSE: ["NYSE", "XNYS"],
  NASDAQ: ["NASDAQ", "XNAS"],
  AMEX: ["NYSE American", "XASE"],
  PAR: ["PAR", "XPAR"],
  AMS: ["AMS", "XAMS"],
  BRU: ["BRU", "XBRU"],
  MIL: ["MIL", "XMIL"],
  XETRA: ["XETRA", "XETR"],
};
const CODES = Object.fromEntries(Object.entries(MARKETS).map(([code, [exchange]]) => [exchange, code]));
const unknownMarkets = new Map();

// What a detail page says: the ISIN, the order form's market code and currency.
function factsOf(html, job) {
  const hiddenCode = hidden(html, "Code").toUpperCase();
  const isin = (hidden(html, "ISIN") || (/^[A-Z]{2}[A-Z0-9]{10}$/.test(hiddenCode) ? hiddenCode : "") || html.match(/ISIN:\s*<\/p>\s*<p class="description__text">\s*([A-Z0-9]{12})/i)?.[1] || job.isin || "").toUpperCase();
  return { isin, market: hidden(html, "Market").toUpperCase(), currency: hidden(html, "Currency").toUpperCase() };
}

function rowOf(job, facts) {
  const { isin, market: code, currency } = facts;
  const known = MARKETS[code];
  if (code && !known) unknownMarkets.set(code, (unknownMarkets.get(code) || 0) + 1);
  const exchange = known ? known[0] : code;
  const mic = known ? known[1] : "";
  const name = job.name;
  const ticker = job.ticker;
  const type = listingType(job.kind, name);
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return { row: null, why: "pas d'ISIN" };
  if (!exchange) return { row: null, why: "pas de marché" };
  if (!ticker) return { row: null, why: "pas de ticker" };
  if (!type) return { row: null, why: "pas de type" };
  return {
    row: {
      query: isin,
      ticker,
      name,
      exchange,
      mic,
      currency: currency || null,
      type,
      isin,
      raw: [ticker, name, code, currency, isin].filter(Boolean).join(" "),
    },
  };
}

async function mapPool(items, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, () => worker()));
  return out;
}

// --- The pages already read ------------------------------------------------

function readJson(url) {
  try {
    return JSON.parse(fs.readFileSync(url, "utf8"));
  } catch {
    return null;
  }
}

// A row of the previous catalogue gives back the facts of the card that has
// its name and ticker, when only one row has them.
function seedFromCatalogue(jobs) {
  const catalogue = readJson(OUTPUT);
  if (!Array.isArray(catalogue)) return {};
  const facts = new Map();
  for (const row of catalogue) {
    const market = CODES[row.exchange];
    if (!market || !row.isin || !row.ticker) continue;
    const key = `${row.type === "STOCK" ? "share" : "etf"}|${row.ticker}|${decode(row.name)}`;
    if (!facts.has(key)) facts.set(key, []);
    facts.get(key).push({ isin: row.isin, market, currency: row.currency || "" });
  }
  const seeded = {};
  for (const job of jobs) {
    const hits = facts.get(`${job.kind}|${job.ticker}|${job.name}`);
    if (hits?.length !== 1) continue;
    // An ETF card's link carries its ISIN: a row under another ISIN is not it.
    if (job.isin && job.isin !== hits[0].isin) continue;
    seeded[job.path] = hits[0];
  }
  return seeded;
}

function loadCache(jobs) {
  if (fresh) return {};
  const saved = readJson(CACHE)?.pages;
  const pages = saved && typeof saved === "object" ? saved : {};
  const seeded = seedFromCatalogue(jobs);
  let fromCatalogue = 0;
  for (const [path, facts] of Object.entries(seeded)) {
    if (pages[path]) continue;
    pages[path] = facts;
    fromCatalogue += 1;
  }
  console.error(`${Object.keys(pages).length - fromCatalogue} pages known from ${CACHE.pathname.split("/").pop()}, ${fromCatalogue} from the previous catalogue`);
  return pages;
}

function saveCache(pages) {
  fs.writeFileSync(CACHE, JSON.stringify({ at: new Date().toISOString(), pages }));
}

// --- The London Stock Exchange's lines of an ISIN ---------------------------

async function lseJson(path) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`${LSE_API}${path}`, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Origin: "https://www.londonstockexchange.com",
          Referer: "https://www.londonstockexchange.com/",
        },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.status === 404) return null;
      if (response.ok) return response.json();
      last = `${response.status} ${path}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(3000 * (attempt + 1));
  }
  // A busy API throws: it never passes for a title London does not list.
  throw new Error(`LSE API: ${last}`);
}

// ISIN -> LSE tickers from the repository's listing files.
function csvTickers() {
  const map = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    let text = "";
    try {
      text = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const [ticker, exchange, isin] = line.split(",");
      if (exchange !== "LSE" || !isin) continue;
      if (!map.has(isin)) map.set(isin, new Set());
      map.get(isin).add(ticker.replace(/^LSE:/, ""));
    }
  }
  return map;
}

async function lseLines(isin, known) {
  const found = (await lseJson(`/search?worlds=quotes&q=${isin}`)) || {};
  const tidms = new Set([
    ...(found.instruments || [])
      .filter((item) => item.key === isin)
      .map((item) => item.url?.match(/\/stock\/([^/]+)\//)?.[1])
      .filter(Boolean),
    ...(known || []),
  ]);
  const lines = [];
  for (const tidm of tidms) {
    const data = await lseJson(`/instruments/alldata/${encodeURIComponent(tidm)}`);
    if (data?.isin === isin) lines.push({ tidm: data.tidm || tidm, currency: String(data.currency || "").toUpperCase() });
    await sleep(150);
  }
  return lines;
}

const sterling = (currency) => currency === "GBX" || currency === "GBP";
const sameCurrency = (left, right) => left === right || (sterling(left) && sterling(right));

// The line in the currency the card's name ends with, else the sterling line.
function lineFor(lines, name) {
  const wanted = [...name.toUpperCase().matchAll(/\b(GBP|GBX|USD|EUR|CHF|JPY)\b/g)].pop()?.[1];
  return (
    (wanted && lines.find((line) => sameCurrency(line.currency, wanted))) ||
    lines.find((line) => sterling(line.currency)) ||
    lines[0]
  );
}

// --- Run --------------------------------------------------------------------

const shares = await loadShares();
const etfs = await loadEtfs();
const jobs = [...shares, ...etfs];
if (!jobs.length) throw new Error("Bank of Scotland returned no instruments");
const sample = limit > 0 ? jobs.slice(0, limit) : jobs;
const cache = loadCache(jobs);

let done = 0;
let fetched = 0;
let reused = 0;
const misses = [];
async function readJob(job) {
  const known = cache[job.path];
  if (known?.market) {
    const parsed = rowOf(job, known);
    if (parsed.row) {
      reused += 1;
      done += 1;
      return parsed.row;
    }
    delete cache[job.path];
  }
  const url = `${ORIGIN}${job.path}`;
  let html = "";
  try {
    html = await get(url);
  } catch (error) {
    misses.push({ job, why: String(error.message || error).slice(0, 120), failed: true });
    done += 1;
    return null;
  }
  fetched += 1;
  if (!html) {
    misses.push({ job, why: "page vide" });
    done += 1;
    return null;
  }
  const facts = factsOf(html, job);
  const parsed = rowOf(job, facts);
  done += 1;
  if (done % 200 === 0) console.error(`${done}/${sample.length} (${fetched} read, ${reused} known)`);
  if (fetched % 200 === 0) saveCache(cache);
  if (!parsed.row) {
    misses.push({ job, why: parsed.why, isin: facts.isin, retry: true });
    return null;
  }
  cache[job.path] = facts;
  return parsed.row;
}

const details = await mapPool(sample, readJob);

// Under load the site can time out, or answer 200 with a page that has no
// order form (no market, no ISIN). Every miss is read again, one at a time,
// twice.
for (let round = 1; round <= 2; round += 1) {
  const again = new Set(misses.filter((miss) => miss.failed || miss.retry).map((miss) => miss.job.path));
  if (!again.size) break;
  for (let index = misses.length - 1; index >= 0; index -= 1) if (again.has(misses[index].job.path)) misses.splice(index, 1);
  for (let index = 0; index < sample.length; index += 1) {
    if (details[index] || !again.has(sample[index].path)) continue;
    await sleep(1500 * round);
    details[index] = await readJob(sample[index]);
  }
  console.error(`round ${round}: ${again.size} missed pages read again, ${misses.length} still missing`);
}
// A full run keeps only the pages of the lists it read.
if (!limit) {
  const listed = new Set(jobs.map((job) => job.path));
  for (const path of Object.keys(cache)) if (!listed.has(path)) delete cache[path];
}
saveCache(cache);

// An ETF page that still has no market code is filed on the LSE line of its ISIN.
const tickers = csvTickers();
const recovered = [];
const notOnLse = [];
for (let index = 0; index < sample.length; index += 1) {
  const job = sample[index];
  const miss = misses.find((item) => item.job === job);
  if (details[index] || !miss || job.kind !== "etf" || miss.why !== "pas de marché") continue;
  const isin = miss.isin || job.isin;
  const lines = await lseLines(isin, tickers.get(isin));
  const line = lineFor(lines, job.name);
  if (!line) {
    notOnLse.push(`${job.name} ${isin}`);
    continue;
  }
  misses.splice(misses.indexOf(miss), 1);
  const row = rowOf({ ...job, ticker: line.tidm }, { isin, market: "LSE", currency: line.currency }).row;
  row.raw = [job.ticker, line.tidm, job.name, "no market code, LSE line", line.currency, isin].join(" ");
  recovered.push({ index, job, row, lines });
}
for (const item of recovered) {
  // A card whose line is already filed (Acc CHF beside Acc GBP, when London
  // has no franc line) adds nothing.
  const twin = details.find((row) => row && row.isin === item.row.isin && row.exchange === "LSE" && sameCurrency(row.currency || "", item.row.currency));
  if (twin) {
    item.twin = twin.ticker;
    continue;
  }
  details[item.index] = item.row;
}

if (!limit && misses.filter((miss) => miss.failed).length > 5) throw new Error("more than 5 detail pages could not be read");
if (!limit && misses.length > 80) throw new Error(`${misses.length} detail pages without a market or ISIN`);

const seen = new Set();
const results = [];
for (const row of details) {
  if (!row) continue;
  const id = `${row.isin}|${row.exchange}|${row.ticker}|${row.type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  results.push(row);
}

// --- Listed today -------------------------------------------------------------

async function usDirectory() {
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
    if (!body.startsWith(header)) body = await get(`https://www.nasdaqtrader.com/dynamic/SymDir/${file}`);
    if (!body.startsWith(header)) throw new Error(`${file}: unexpected header ${body.slice(0, 60)}`);
    for (const line of body.split(/\r?\n/).slice(1)) {
      const cells = line.split("|");
      if (cells.length < 7 || line.startsWith("File Creation Time")) continue;
      const nasdaq = file === "nasdaqlisted.txt";
      if ((nasdaq ? cells[3] : cells[6]) === "Y") continue;
      directory.set(cells[0], { code: nasdaq ? "Q" : cells[2], name: cells[1].trim() });
    }
  }
  if (directory.size < 10000) throw new Error(`the US directories hold only ${directory.size} lines`);
  return directory;
}

// ISIN -> American tickers, and ticker -> ISINs, from the listing files.
function usListings() {
  const tickersOf = new Map();
  const isinsOf = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split("\n").slice(1)) {
    const [code, exchange, isin] = line.split(",");
    if (!["NYSE", "NASDAQ", "AMEX", "CBOE"].includes(exchange) || !isin) continue;
    const ticker = code.slice(code.indexOf(":") + 1).toUpperCase();
    if (!tickersOf.has(isin)) tickersOf.set(isin, new Set());
    tickersOf.get(isin).add(ticker);
    if (!isinsOf.has(ticker)) isinsOf.set(ticker, new Set());
    isinsOf.get(ticker).add(isin);
  }
  return { tickersOf, isinsOf };
}

const NOISE = new Set("inc corp corporation co company ltd limited plc the and of class common stock shares share ordinary holdings holding group sa nv ag se".split(" "));
const words = (name) => String(name || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 1 && !NOISE.has(word));
const US_CODES = { Q: ["NASDAQ", "XNAS"], N: ["NYSE", "XNYS"], A: ["NYSE American", "XASE"] };
const usGone = [];
const usRenamed = [];
const sameLine = [];
if (!limit) {
  const directory = await usDirectory();
  const { tickersOf, isinsOf } = usListings();
  const spellings = (ticker) => {
    const bare = ticker.replace(/\*+$/, "");
    return [bare, bare.replace(/[/-]/g, "."), bare.replace(/[./-]/g, "")];
  };
  const entryOf = (ticker) => spellings(ticker).map((spelling) => directory.get(spelling)).find(Boolean);
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const row = results[index];
    if (!["NYSE", "NASDAQ", "NYSE American"].includes(row.exchange)) continue;
    const entry = entryOf(row.ticker);
    const own = isinsOf.get(spellings(row.ticker)[0]) || new Set();
    // A word in common, or one run into another ("Exxon Mobil", "ExxonMobil").
    const glued = (name) => words(name).join("");
    const shared =
      words(row.name).some((word) => words(entry?.name).includes(word) || (word.length >= 4 && glued(entry?.name).includes(word))) ||
      words(entry?.name).some((word) => word.length >= 4 && glued(row.name).includes(word));
    if (entry && (own.has(row.isin) || shared)) continue;
    const listed = [...(tickersOf.get(row.isin) || [])].filter((ticker) => ticker !== spellings(row.ticker)[0] && entryOf(ticker));
    if (listed.length === 1) {
      const [ticker] = listed;
      const place = US_CODES[entryOf(ticker).code];
      usRenamed.push(`${row.ticker}->${ticker}`);
      row.raw = `${row.raw} | listed as ${ticker}`;
      row.ticker = ticker;
      if (place) [row.exchange, row.mic] = place;
      continue;
    }
    usGone.push(`${row.ticker} (${row.name})${entry ? ` - ${row.ticker} is now ${entry.name}` : ""}`);
    results.splice(index, 1);
  }
  if (usGone.length > 150) throw new Error(`${usGone.length} American lines in no directory: spelling changed?`);

  // Two cards on one line.
  let xetra = null;
  const groups = new Map();
  for (const row of results) {
    const key = `${row.isin}|${row.exchange}|${row.currency}|${row.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (group[0].exchange === "XETRA" && !xetra) {
      const page = await get("https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra");
      const href = page.match(/href="([^"]*t7-xetr-allTradableInstruments\.csv)"/)?.[1];
      if (!href) throw new Error("the Xetra instruments page no longer links allTradableInstruments.csv");
      xetra = new Map();
      for (const line of (await get(new URL(href, "https://www.cashmarket.deutsche-boerse.com/").href)).split(/\r?\n/)) {
        const cells = line.split(";");
        if (cells[1] === "Active" && cells[3]) xetra.set(`${cells[3]}|${cells[7]}`, true);
      }
      if (xetra.size < 2000) throw new Error(`the Xetra file holds only ${xetra.size} lines`);
    }
    const own = (row) =>
      (row.exchange === "XETRA" && xetra?.has(`${row.isin}|${row.ticker}`)) ||
      (["NYSE", "NASDAQ", "NYSE American"].includes(row.exchange) && (tickersOf.get(row.isin) || new Set()).has(row.ticker));
    const priced = (row) => {
      const tail = row.name.toUpperCase().match(/\b(GBP|GBX|USD|EUR|CHF)\b\W*$/)?.[1];
      return tail && sameCurrency(tail, String(row.currency || "").toUpperCase());
    };
    const ranked = [...group].sort((left, right) => Number(own(right)) - Number(own(left)) || Number(priced(right)) - Number(priced(left)));
    const [kept, ...rest] = ranked;
    for (const row of rest) {
      sameLine.push(`${row.ticker} (${row.name}) = ${kept.ticker} (${kept.name}), ${row.isin} ${row.exchange} ${row.currency}`);
      results.splice(results.indexOf(row), 1);
    }
  }
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

// What each list announced against what was filed.
const filedIsins = new Set(results.map((row) => row.isin));
const coverage = [];
for (const region of REGIONS) {
  const listed = sample.map((job, index) => [job, index]).filter(([job]) => job.region === region);
  const filed = listed.filter(([, index]) => details[index]).length;
  coverage.push([region, listed.length, filed]);
}
const etfIsins = new Set(sample.filter((job) => job.kind === "etf").map((job) => job.isin));
const etfMissing = [...etfIsins].filter((isin) => !filedIsins.has(isin));
coverage.push(["ETF ISINs", etfIsins.size, etfIsins.size - etfMissing.length]);

if (!limit) {
  const oil = results.find((row) => row.isin === "GB00BRQMRP25");
  const drillisch = results.find((row) => row.isin === "DE0005545503");
  if (!oil || oil.exchange !== "LSE") throw new Error("1947 Oil & Gas was not stored on LSE");
  if (!drillisch || drillisch.exchange !== "XETRA") throw new Error("1&1 Drillisch was not stored on XETRA");
  if (results.some((row) => /neuer markt/i.test(row.exchange))) throw new Error("a display name was stored as the market");
  if (results.some((row) => /&#?\w+;/.test(row.name))) throw new Error("an HTML entity was left in a name");
  if (results.length < 5500) throw new Error(`only ${results.length} listings, expected about 5,800`);
  const want = [["GB0007980591", "LSE", "BP"], ["US0378331005", "NASDAQ", "Apple"], ["US0846707026", "NYSE", "Berkshire Hathaway B"], ["FR0000121014", "PAR", "LVMH"], ["IE00B4L5Y983", "LSE", "iShares Core MSCI World ETF"], ["IE000GA3D489", "LSE", "ARK Innovation ETF"]];
  for (const [isin, exchange, label] of want) {
    if (!results.some((row) => row.isin === isin && row.exchange === exchange)) throw new Error(`${label} missing on ${exchange}`);
  }
  for (const [label, listed, filed] of coverage) {
    if (listed - filed > 5) throw new Error(`${label}: ${listed} listed, only ${filed} filed`);
  }
}

const byType = new Map();
const byExchange = new Map();
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  byExchange.set(row.exchange, (byExchange.get(row.exchange) || 0) + 1);
}
console.error(`${fetched} pages read, ${reused} known from before`);
console.error(
  `${results.length} listings over ${filedIsins.size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    (misses.length ? `, ${misses.length} fiches unread` : "")
);
console.error(coverage.map(([label, listed, filed]) => `${label} ${filed}/${listed}`).join(", "));
if (unknownMarkets.size) console.error(`market codes not mapped: ${[...unknownMarkets].map(([code, count]) => `${code} ${count}`).join(", ")}`);
for (const item of recovered) {
  const lines = item.lines.map((line) => `${line.tidm} ${line.currency}`).join("/");
  console.error(
    item.twin
      ? `no market code, line already filed as ${item.twin}: ${item.job.name} ${item.row.isin} (LSE ${lines})`
      : `no market code, filed on LSE ${item.row.ticker} ${item.row.currency}: ${item.job.name} ${item.row.isin} (LSE ${lines})`
  );
}
for (const item of notOnLse) console.error(`no market code and no LSE line: ${item}`);
console.error(`American lines in no directory, left out (${usGone.length}): ${usGone.join("; ")}`);
console.error(`American lines under a new ticker (${usRenamed.length}): ${usRenamed.join(" ")}`);
console.error(`two cards on one line, one kept (${sameLine.length}): ${sameLine.join("; ")}`);
for (const isin of etfMissing) console.error(`ETF ISIN not filed: ${isin}`);
for (const miss of misses) console.error(`manque ${miss.why} — ${miss.job.name || ""} ${miss.job.path}`);
console.error([...byExchange].sort((a, b) => b[1] - a[1]).map(([exchange, count]) => `${count} ${exchange}`).join(", "));

if (limit > 0) {
  console.log(JSON.stringify(results, null, 2));
} else {
  fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(results)), null, 2));
}
