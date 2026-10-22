// Webull UK (Webull Securities (UK) Ltd, FCA FRN 961286) — what a UK resident
// can buy, with the plan (Go or Meridian) that opens each line.
//
// Sources and rules, read 2026-10-21:
//
// US — listed shares only, no ETFs, no ETNs, no OTC, no crypto.
//   https://www.webull-uk.com/uk-stocks
//     "Trade all stocks listed on US exchanges, US Options, UK stocks and UK ETFs"
//   https://www.webull-uk.com/help/faq/1388 (How do I enable ETFs or Options trading?)
//     "Webull UK does not currently offer Exchange Traded Funds ('ETFs') or
//      Options trading of ETFs."
//   https://www.webull-uk.com/help/faq/1522-What-UK-shares-and-ETFs-can-I-trade
//     "You can find the full list of ETFs available to Meridian members below."
//     That full list holds UCITS funds only: no US-domiciled ETF is on it, and
//     no page of webull-uk.com sells one, so US ETFs/ETNs are left out. The
//     same list is why the Hong Kong and China Connect ETFs of the base are
//     left out too.
//   https://www.webull-uk.com/help/faq/1470-What-can-I-transfer-to-Webull
//     "We do not accept delisted/suspended/OTC stocks, bonds, ETFs or mutual
//      fund transfers at this time." No page offers OTC shares; the OTC rows
//     of the base are left out.
//   The site's product menu (US Stocks, UK Stocks, US Options, ETFs, Emerging
//   Asia, GBP Cash Savings) offers no crypto: the base's US crypto rows (a
//   Webull US/SG product) are left out.
//
// London — shares from Webull's own UK ranking, ETFs from FAQ 1522's images.
//   https://www.webull-uk.com/uk-stocks
//     "Access thousands of UK Stocks and ETFs trading on the LSE"
//   Shares: GET quotes-gw.webullfintech.com/api/wlas/ranking/v9/{rise,fall}
//     ?regionId=4&rankType=1d with `app: gb` — every LSE share quoted that day
//     (about 1,170), each with its quote currency (GBX, a few GBP). A share not
//     quoted that day is missing; FTSE 100 names missing are added (FAQ 1522
//     says Go "gives access to any FTSE100 listed company"). The ISIN is that of
//     the LSE line of the same ticker in assets/stocks.csv, else
//     assets/etfs.csv (investment trusts). Webull's template is "stock", so an
//     investment trust stays STOCK.
//   ETFs: brokers/webulluk/webulluk-etfs.json, transcribed from the images of
//     FAQ 1522 (the 21-line Go table, then the six Meridian pages), each line
//     with the image it came from, plus brokers/webulluk/webulluk-support-etfs.json,
//     the list Webull UK support sent ("UK ETF Lists 18112025.xlsx", 733
//     ETFs): an ETF on either list is in (owner decision, 2026-10-22). The
//     support reply: "we do not offer trading of HK/US listed ETFs". Each ISIN is resolved to its LSE lines in
//     assets/etfs.csv. The currency of each LSE line is read from the London
//     page the spread book links for it (spreads/spread.json, XLON), else from
//     the other catalogues' LSE rows of that ticker.
//
// Hong Kong and China Connect — from the base.
//   https://www.webull-uk.com/emerging-markets-asia
//     "Trade Hong Kong Stocks and China Stock Connect with Webull UK"
//   https://www.webull-uk.com/help/faq/1454 (What are the trading rules for A-shares?)
//     "ChiNEXT and STAR symbols are currently not available for trading on Webull."
//   https://www.webull-uk.com/help/faq/1443
//     "Renminbi (CNH) is the only supported currency for trading A-shares"
//   The base already drops STAR (688) and ChiNext (300, 301); this file
//   checks again. Shares only (see FAQ 1522 above for the ETFs).
//
// Plans — every row carries `go: true` when Webull Go (the free plan) can buy
// it, `go: false` when only Meridian can.
//   https://www.webull-uk.com/help/faq/1512-What-is-the-difference-between-Webull-Go-and-Meridian
//     Meridian adds: "Trade our full range of UK shares outside of FTSE 100"
//     and "Invest in our full range of UK ETFs – Webull Go users only have
//     access to a curated list of the 20 most popular UK ETFs"
//   https://www.webull-uk.com/help/faq/1522-What-UK-shares-and-ETFs-can-I-trade
//     "our basic model is Webull Go which gives access to any FTSE100 listed
//      company and a selection of 20 of our most popular UK ETFs"
//   So: US, Hong Kong and China rows go: true; an LSE share is go: true when
//   it is a FTSE 100 constituent; an LSE ETF is go: true when its ISIN is on
//   the Go table (01.jpg).
//   FTSE 100 constituents: the table of https://en.wikipedia.org/wiki/FTSE_100_Index
//     (after the FTSE Russell changes of 1 October 2026, citing
//     https://research.ftserussell.com/products/index-notices/home/getnotice/?id=2622120).
//   Cross-check: Webull's ranking marks a Meridian-only line with
//   `onlyMemberSupport: 1` (FAQ 1519: "Some instruments are only accessible to
//   Webull Meridian clients – these are identified with a golden crown
//   symbol"). On 2026-10-21 the 99 lines it leaves open are exactly the FTSE
//   100 minus Metlen (MTLN), which was not in the ranking that day. Any
//   disagreement is printed.
//   The Go table prints IE00BLCHJN13 (Global X Lithium & Battery Tech) beside
//   "GLOBAL X URANIUM UCITS ETF"; the name is followed (IE000MS9DTS9, the
//   ISIN the Meridian list prints for that name).
//
// Deposit currency — GBP only.
//   https://www.webull-uk.com/help/faq/1523
//     "You will only be able to deposit and withdraw in GBP"
//   https://www.webull-uk.com/help/faq/1399
//     "We do not charge any fees for withdrawing GBP to a UK bank account"
//   So a title quoted on the LSE in several currencies keeps its GBP/GBX
//   line(s) only; one with no pound line keeps its USD/EUR line (Go converts
//   automatically, FAQ 1492). US, HK and China lines stay in their market
//   currency (USD, HKD and CNH, CNH being the only currency A-shares trade in).

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";

const here = (name) => new URL(name, import.meta.url);
const root = (name) => new URL(`../../${name}`, import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HEADERS = {
  app: "gb",
  appid: "wb_web_gb",
  "app-group": "broker",
  platform: "web",
  "device-type": "Web",
  hl: "en",
  os: "web",
  ver: "1.0.0",
  "User-Agent": "Mozilla/5.0",
};

async function getJson(url, headers = HEADERS) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (response.ok) return await response.json();
      last = new Error(`${response.status} for ${url}`);
    } catch (error) {
      last = error;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw last;
}

async function getText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 broker-scraping" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.text();
}

const tokens = (text) =>
  String(text || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 1 && !["PLC", "LTD", "LIMITED", "THE", "GROUP", "HOLDINGS", "ORD", "SHS", "FUND", "INC", "CO"].includes(t));

function nameScore(left, right) {
  const a = tokens(left);
  const b = new Set(tokens(right));
  if (!a.length || !b.size) return 0;
  return a.filter((t) => b.has(t) || [...b].some((u) => u.startsWith(t) || t.startsWith(u))).length / a.length;
}

// ---------------------------------------------------------------- catalogues

function lseLines(file) {
  const byTicker = new Map();
  const byIsin = new Map();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
    const cells = line.split(",");
    if (cells[1] !== "LSE" || !cells[2]) continue;
    const ticker = cells[0].replace(/^LSE:/, "");
    const entry = { ticker, isin: cells[2], name: cells.slice(3).join(",") };
    const list = byTicker.get(ticker) || byTicker.set(ticker, []).get(ticker);
    if (!list.some((e) => e.isin === entry.isin)) list.push(entry);
    const tickers = byIsin.get(entry.isin) || byIsin.set(entry.isin, []).get(entry.isin);
    if (!tickers.some((e) => e.ticker === ticker)) tickers.push(entry);
  }
  return { byTicker, byIsin };
}

const stocksCsv = lseLines(root("assets/stocks.csv"));
const etfsCsv = lseLines(root("assets/etfs.csv"));

// A ticker with two ISINs in the catalogues is nearly always a share
// consolidation (ULVR, AAL, RKT, MRO...): the old ISIN lingers. The one with
// a London book in the spread cache wins, then the one the other catalogues
// use most, then the closer name.
function isinForLseShare(ticker, name) {
  for (const book of [stocksCsv, etfsCsv]) {
    const candidates = book.byTicker.get(ticker) || [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const scored = candidates
        .map((c) => ({ ...c, score: (evidence.londonBook.has(c.isin) ? 1e6 : 0) + (evidence.lseRows.get(c.isin) || 0) * 10 + nameScore(name, c.name) }))
        .sort((a, b) => b.score - a.score);
      if (scored[0].score > scored[1].score) return scored[0];
      return null;
    }
  }
  return null;
}

// Currency of each LSE line: the London page the spread book links for that
// ISIN and currency names the ticker; else the other catalogues' rows.
function readLseEvidence() {
  const found = new Map();
  const londonBook = new Set();
  const lseRows = new Map();
  const note = (isin, ticker, currency, weight) => {
    const key = `${isin}|${ticker}`;
    const counts = found.get(key) || found.set(key, new Map()).get(key);
    counts.set(currency, (counts.get(currency) || 0) + weight);
  };
  const book = JSON.parse(fs.readFileSync(root("spreads/spread.json"), "utf8")).spreads || {};
  for (const [isin, places] of Object.entries(book)) {
    if (places?.XLON) londonBook.add(isin);
    for (const [currency, leaf] of Object.entries(places?.XLON || {})) {
      const ticker = String(leaf?.url || "").match(/londonstockexchange\.com\/stock\/([^/]+)\//)?.[1];
      if (ticker) note(isin, decodeURIComponent(ticker), currency, 1000);
    }
  }
  for (const folder of fs.readdirSync(root("brokers"))) {
    if (/^webull/i.test(folder)) continue;
    let files = [];
    try {
      files = fs.readdirSync(root(`brokers/${folder}`)).filter((name) => name.endsWith("-parsed.json"));
    } catch {
      continue;
    }
    for (const name of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(root(`brokers/${folder}/${name}`), "utf8"));
      } catch {
        continue;
      }
      for (const row of Array.isArray(data) ? data : data.rows || []) {
        if (!/^(LSE|XLON)$/i.test(String(row.exchange || "")) || !row.isin) continue;
        const isin = String(row.isin).toUpperCase();
        lseRows.set(isin, (lseRows.get(isin) || 0) + 1);
        if (/^[A-Z]{3}$/.test(String(row.currency || ""))) note(isin, row.ticker, row.currency, 1);
      }
    }
  }
  const family = (c) => (c === "GBX" ? "GBP" : c);
  const lineCurrency = (isin, ticker) => {
    const counts = found.get(`${isin}|${ticker}`);
    if (!counts) return [];
    // The book's figure outweighs any catalogue, unless its one London page
    // stands for two currencies other than pence and pounds (HSUD for USD and
    // GBP): then the catalogues decide.
    const fromBook = [...counts].filter(([, n]) => n >= 1000).map(([c]) => c);
    if (fromBook.length && new Set(fromBook.map(family)).size === 1) return fromBook;
    const rows = [...counts].map(([c, n]) => [c, n % 1000]).filter(([, n]) => n > 0);
    if (!rows.length) return fromBook.length === 1 ? fromBook : [];
    const best = Math.max(...rows.map(([, n]) => n));
    return rows.filter(([, n]) => n === best).map(([c]) => c);
  };
  return { londonBook, lseRows, lineCurrency };
}

const evidence = readLseEvidence();

const POUND = new Set(["GBP", "GBX"]);

// ---------------------------------------------------------------- base rows

const base = JSON.parse(fs.readFileSync(root("brokers/webull/webull-base.json"), "utf8"));
const OWN_CURRENCY = { NYSE: "USD", NASDAQ: "USD", AMEX: "USD", CBOE: "USD", HKEX: "HKD", Shanghai: "CNH", Shenzhen: "CNH" };
const US = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);

function restrictedBoard(row) {
  return (row.exchange === "Shanghai" && /^688/.test(row.ticker)) || (row.exchange === "Shenzhen" && /^30[01]/.test(row.ticker));
}

const left = new Map();
const leave = (reason) => left.set(reason, (left.get(reason) || 0) + 1);
const rows = [];
const baseGroups = new Map();
for (const row of base) {
  if (!(row.exchange in OWN_CURRENCY)) {
    leave(`${row.exchange} ${row.type}`);
    continue;
  }
  if (row.type !== "STOCK") {
    leave(`${US.has(row.exchange) ? "US" : row.exchange} ${row.type}`);
    continue;
  }
  if (restrictedBoard(row)) {
    leave("STAR/ChiNext");
    continue;
  }
  const key = `${row.exchange}|${row.ticker}`;
  (baseGroups.get(key) || baseGroups.set(key, []).get(key)).push(row);
}
// The base was widened to the Singapore entity's cash currencies: a copy of
// a line in another currency keeps the original's `raw`, which ends with the
// currency Webull quotes it in. That line is kept, the copies are not (GBP is
// the only cash a UK client holds). A dual counter has its own ticker (HK
// 8xxxx in CNH) and its own original line.
const quoted = (row) => String(row.raw || "").trim().split(/\s+/).pop();
for (const group of baseGroups.values()) {
  const own =
    group.find((row) => row.currency === quoted(row)) || group.find((row) => row.currency === OWN_CURRENCY[row.exchange]);
  for (const row of own ? [own] : group) rows.push({ ...row, go: true });
  if (own && group.length > 1) for (let i = 1; i < group.length; i += 1) leave("base currency widening");
}

// ---------------------------------------------------------------- FTSE 100

const WIKI = "https://en.wikipedia.org/w/index.php?title=FTSE_100_Index&action=raw";
const wiki = (await getText(WIKI)).split("\n");
const start = wiki.findIndex((line) => line.startsWith("==Constituents"));
const end = wiki.findIndex((line, index) => index > start && line.startsWith("|}"));
const ftse100 = wiki
  .slice(start, end)
  .filter((line) => /^\|[^-}]/.test(line) && line.includes("||"))
  .map((line) => line.slice(1).split("||").map((cell) => cell.trim()))
  .map(([company, ticker]) => ({
    name: company.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1"),
    ticker: ticker.replace(/\s/g, "").replace(/\.$/, ""),
  }));
if (ftse100.length < 95 || ftse100.length > 105) throw new Error(`FTSE 100 table read ${ftse100.length} names`);
const ftseTickers = new Set(ftse100.map((c) => c.ticker));
const inFtse = (ticker) => ftseTickers.has(String(ticker).replace(/\.$/, ""));

// ---------------------------------------------------------------- LSE shares

// The gateway answers 403 for a while when it is called too often. The last
// full walk is kept in webulluk-ranking-cache.json and used, with a warning,
// when the live walk fails.
const RANKING_CACHE = here("webulluk-ranking-cache.json");
let ranked = new Map();
let rankingSource = "live";
try {
  for (const direction of ["rise", "fall"]) {
    for (let page = 1; page <= 30; page += 1) {
      const url = `https://quotes-gw.webullfintech.com/api/wlas/ranking/v9/${direction}?regionId=4&rankType=1d&pageIndex=${page}&pageSize=100`;
      const answer = await getJson(url);
      for (const item of answer.data || []) if (item?.ticker?.tickerId) ranked.set(item.ticker.tickerId, item.ticker);
      if (!answer.hasMore || !(answer.data || []).length) break;
      await sleep(400);
    }
  }
  if (ranked.size < 800) throw new Error(`Webull's UK ranking gave ${ranked.size} lines only`);
  fs.writeFileSync(RANKING_CACHE, JSON.stringify({ fetched: new Date().toISOString(), lines: [...ranked.values()] }, null, 1));
} catch (error) {
  if (!fs.existsSync(RANKING_CACHE)) throw error;
  const cache = JSON.parse(fs.readFileSync(RANKING_CACHE, "utf8"));
  ranked = new Map(cache.lines.map((t) => [t.tickerId, t]));
  rankingSource = `cache of ${cache.fetched}`;
  console.error(`Webull's UK ranking failed (${error.message}); using the ${rankingSource}`);
}

const crownDisagree = [];
let lseUnresolved = [];
const lseRows = [];
for (const t of ranked.values()) {
  if (t.template !== "stock" || t.disExchangeCode !== "LSE") {
    leave(`ranking ${t.template} ${t.disExchangeCode}`);
    continue;
  }
  const ticker = t.symbol;
  const match = isinForLseShare(ticker, t.name);
  if (!match) {
    lseUnresolved.push(`${ticker} ${t.name}`);
    continue;
  }
  const go = inFtse(ticker);
  if (go !== (t.onlyMemberSupport === 0)) crownDisagree.push(`${ticker} ${t.name}: FTSE 100 ${go}, Webull open to Go ${t.onlyMemberSupport === 0}`);
  lseRows.push({
    query: ticker,
    ticker,
    name: t.name,
    exchange: "LSE",
    currency: t.currencyCode,
    type: "STOCK",
    raw: [ticker, t.name, "LSE", t.currencyCode, t.onlyMemberSupport === 0 ? "go" : "meridian"].join(" "),
    isin: match.isin,
    go,
  });
}
// FAQ 1522: Go "gives access to any FTSE100 listed company".
const rankedTickers = new Set(lseRows.map((row) => row.ticker.replace(/\.$/, "")));
const ftseAdded = [];
for (const constituent of ftse100) {
  if (rankedTickers.has(constituent.ticker)) continue;
  const ticker = stocksCsv.byTicker.has(constituent.ticker) ? constituent.ticker : `${constituent.ticker}.`;
  const match = isinForLseShare(ticker, constituent.name);
  if (!match) {
    lseUnresolved.push(`${constituent.ticker} ${constituent.name} (FTSE 100)`);
    continue;
  }
  ftseAdded.push(ticker);
  lseRows.push({
    query: ticker,
    ticker,
    name: match.name,
    exchange: "LSE",
    currency: "GBX",
    type: "STOCK",
    raw: [ticker, constituent.name, "LSE", "GBX", "FTSE 100, not in Webull's ranking that day"].join(" "),
    isin: match.isin,
    go: true,
  });
}

// ---------------------------------------------------------------- LSE ETFs

const transcription = JSON.parse(fs.readFileSync(here("webulluk-etfs.json"), "utf8"));
const goIsins = new Set(transcription.rows.filter((e) => e.list === "go" && e.resolvedIsin).map((e) => e.resolvedIsin));
const { lineCurrency } = evidence;
const etfRows = [];
const etfGaps = [];
const shareKeys = new Set(lseRows.map((row) => row.isin));
const seenEtf = new Set();
// One ETF of a Webull list onto its LSE lines. `where` names the list line.
function addEtf(isin, name, where) {
  if (seenEtf.has(isin)) return;
  seenEtf.add(isin);
  if (shareKeys.has(isin)) return; // an investment trust already in the share ranking
  const lines = etfsCsv.byIsin.get(isin) || [];
  if (!lines.length) {
    etfGaps.push(`${where} ${name} (${isin}): no LSE line in assets/etfs.csv`);
    return;
  }
  const priced = [];
  for (const line of lines) {
    const currencies = lineCurrency(isin, line.ticker);
    if (!currencies.length) continue;
    // One pence/pound book: GBX when the book names both.
    const currency = currencies.includes("GBX") ? "GBX" : currencies.includes("GBP") ? "GBP" : currencies[0];
    priced.push({ ...line, currency });
  }
  const pound = priced.filter((line) => POUND.has(line.currency));
  const keep = pound.length ? pound : priced;
  if (!keep.length) {
    etfGaps.push(`${where} ${name} (${isin}): no currency known for ${lines.map((l) => l.ticker).join("/")}`);
    return;
  }
  for (const line of keep) {
    const type = /\bETC\b/i.test(line.name) ? "ETC" : /\bETN\b/i.test(line.name) ? "ETN" : "ETF";
    etfRows.push({
      query: line.ticker,
      ticker: line.ticker,
      name: line.name,
      exchange: "LSE",
      currency: line.currency,
      type,
      raw: [line.ticker, name, "LSE", line.currency, isin, where].join(" "),
      isin,
      go: goIsins.has(isin),
    });
  }
}
for (const entry of transcription.rows) {
  if (!entry.resolvedIsin) {
    etfGaps.push(`${entry.image}#${entry.row} ${entry.name} (${entry.isin}): not in assets/etfs.csv`);
    continue;
  }
  addEtf(entry.resolvedIsin, entry.name, `FAQ 1522 ${entry.image}#${entry.row}`);
}
// The support list (webulluk-support-etfs.json) adds what the FAQ lacks;
// it never opens a line to Go.
const support = JSON.parse(fs.readFileSync(here("webulluk-support-etfs.json"), "utf8"));
let supportAdded = 0;
for (const entry of support.rows) {
  if (seenEtf.has(entry.isin)) continue;
  const before = etfRows.length;
  addEtf(entry.isin, entry.name, `support ${support.dated} ${entry.sheet}#${entry.row}`);
  if (etfRows.length > before) supportAdded++;
}

// ---------------------------------------------------------------- write

const all = [...rows, ...lseRows, ...etfRows];
const unresolvedVenue = all.filter((row) => !resolveVenue({ exchange: row.exchange, currency: row.currency, isin: row.isin }).venue?.mic);
if (unresolvedVenue.length) throw new Error(`no venue for ${unresolvedVenue.slice(0, 5).map((r) => `${r.exchange}/${r.currency}/${r.ticker}`).join(", ")}`);

const seen = new Set();
const out = [];
for (const row of all) {
  const key = `${row.exchange}|${row.ticker}|${row.type}|${row.currency}|${row.isin}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(row);
}
out.sort((a, b) => String(a.type).localeCompare(b.type) || String(a.exchange).localeCompare(b.exchange) || String(a.ticker).localeCompare(b.ticker));
const final = stampRows(withoutObligations(out));
fs.writeFileSync(here("webulluk-parsed.json"), JSON.stringify(final, null, 2));

const tally = new Map();
for (const row of final) {
  const key = `${row.exchange} ${row.type} ${row.currency} ${row.go ? "go" : "meridian"}`;
  tally.set(key, (tally.get(key) || 0) + 1);
}
console.error(`${final.length} rows (${out.length - final.length} obligations dropped)`);
for (const [key, n] of [...tally].sort()) console.error(`  ${key}: ${n}`);
console.error(`left out of the base: ${[...left].map(([k, n]) => `${n} ${k}`).join(", ")}`);
console.error(`UK ranking: ${ranked.size} lines (${rankingSource})`);
console.error(`ETFs added from the support list: ${supportAdded}`);
console.error(`FTSE 100 read: ${ftse100.length}; added from it (not in the ranking): ${ftseAdded.join(", ") || "none"}`);
if (crownDisagree.length) console.error(`FTSE 100 vs Webull's Go flag disagree:\n  ${crownDisagree.join("\n  ")}`);
if (lseUnresolved.length) console.error(`LSE shares with no ISIN in the catalogues (${lseUnresolved.length}): ${lseUnresolved.join("; ")}`);
if (etfGaps.length) console.error(`ETF lines not placed (${etfGaps.length}):\n  ${etfGaps.join("\n  ")}`);
