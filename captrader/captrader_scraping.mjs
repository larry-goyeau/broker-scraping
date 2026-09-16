import puppeteer from "puppeteer-core";
import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;
  return (afterExchange || "").split(/[./]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadTickersFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  return fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => !/^ticker\s*,/i.test(line))
    .map((line) => normalizeTicker(line))
    .filter(Boolean);
}

// Funds and shares are both plain stock contracts on IBKR, which never says
// which of the two it is quoting. The catalogue a ticker was read from is the
// only thing that knows, so the kind is carried alongside the candidate and
// the winning candidate is what types the row.
function loadTickerCandidatesFromCsv(csvPath, kind, map = new Map()) {
  if (!fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const candidate = {
      isin: toIsin(columns[isinIndex]),
      name: columns.slice(isinIndex + 1).join(",").trim(),
      kind,
    };
    const candidates = map.get(ticker) || [];
    if (!candidates.some((existing) => existing.isin === candidate.isin)) {
      candidates.push(candidate);
      map.set(ticker, candidates);
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated companies, so counting them
// would let "Gold Finder Resources Ltd" pass for "New Gold Issuer Ltd."
const GENERIC_TOKENS = new Set([
  "LTD",
  "LIMITED",
  "PLC",
  "INC",
  "CORP",
  "CORPORATION",
  "LLC",
  "GMBH",
  "THE",
  "CO",
]);

function nameTokens(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

// IBKR abbreviates fund names to fit a fixed width ("ISH S&P500 UT SEC UCIT
// ETF"), so tokens are compared by prefix rather than equality.
function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return 0;

  const used = new Set();
  let matched = 0;
  for (const token of scraped) {
    const index = candidate.findIndex(
      (other, position) => !used.has(position) && tokensMatch(token, other)
    );
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }

  return matched / Math.min(scraped.length, candidate.length);
}

// A ticker on IBKR can belong to several unrelated instruments (GLD is both
// SPDR Gold Shares and Gold Finder Resources), so a listing only earns the
// CSV's ISIN when its name genuinely matches.
const MIN_NAME_SCORE = 0.5;

function resolveListing(tickerCandidates, ticker, scrapedName) {
  const candidates = tickerCandidates.get(ticker) || [];

  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = nameScore(scrapedName, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= MIN_NAME_SCORE ? best : null;
}

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const CHROME = { browserURL: "http://127.0.0.1:9222", defaultViewport: null };
const PORTAL = "https://www.clientam.com/portal/";

let browser = await puppeteer.connect(CHROME);

function isPortalUrl(url) {
  return /clientam\.com/i.test(url);
}

function looksLoggedOut(url) {
  return /sso\.|\/sso\/|\/Login|signin|authentication|amauthentication/i.test(url);
}

// The page is only there to lend its signed-in CapTrader session. Login often
// opens a new tab; we prefer a live portal over a login page.
let page = null;

async function attachPortalPage() {
  let pages = [];
  try {
    pages = await browser.pages();
  } catch {
    return false;
  }

  const portals = [];
  for (const candidate of pages) {
    try {
      if (candidate.isClosed()) continue;
      if (isPortalUrl(candidate.url())) portals.push(candidate);
    } catch {
      // Tab went away while it was being inspected.
    }
  }

  const live = portals.find((candidate) => !looksLoggedOut(candidate.url()));
  page = live || portals[0] || null;
  return Boolean(page);
}

if (!(await attachPortalPage())) {
  page = await browser.newPage();
  await page.goto(PORTAL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

if (!isPortalUrl(page.url()) || looksLoggedOut(page.url())) {
  await page.goto(PORTAL, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(5000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to captrader-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["GLD", "EWY", "IUUS"];
const cliQueries = positionalArgs.map(normalizeTicker).filter(Boolean);

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return new URL(fallback, import.meta.url);
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function loadQueryFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => normalizeTicker(line))
    .filter(Boolean);
}

// `--csv=PATH` overrides the fund list (defaults to etfs.csv) and
// `--stocks-csv=PATH` the share list (defaults to stocks.csv). CapTrader
// introduces the account onto IBKR, so it sells the whole IBKR book: the funds
// and the shares are the same kind of contract behind the same search.
// `--etfs-only` and `--stocks-only` answer for one shelf alone, which is what
// makes a walk of a catalogue this size resumable in parts.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const queryFile = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--file=(.+)$/i);
    if (match) return match[1];
  }
  return "";
})();
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const lanes = Math.max(1, numberArg("concurrency", 4));

const tickerCandidates = new Map();
if (!stocksOnly) loadTickerCandidatesFromCsv(csvPath, "ETF", tickerCandidates);
if (!etfsOnly) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);

const csvQueries = [
  ...(stocksOnly ? [] : loadTickersFromCsv(csvPath)),
  ...(etfsOnly ? [] : loadTickersFromCsv(stocksCsvPath)),
];
const fileQueries = loadQueryFile(queryFile);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : fileQueries.length > 0
      ? fileQueries
      : csvQueries.length > 0
        ? csvQueries
        : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = new URL("captrader-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

const entryKey = (query, row) =>
  `${query}:${row.ticker}:${row.exchange}:${row.name}`.toUpperCase();

// A walk this long is run in stretches, and a stretch that began by emptying
// the file would throw away every stretch before it. What is already listed is
// read back and kept, and the dedup set below is what stops it being listed
// twice; `--fresh` is how a run says it means to start the file over.
if (!hasFlag("fresh") && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entryKey(entry.query, entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const alreadyQueried = new Set(
  results.map((entry) => String(entry.query || "").toUpperCase()).filter(Boolean)
);
const pending = queries.filter((query) => !alreadyQueried.has(query));

const API = "/portal.proxy/v1/portal";
let savedAt = 0;
const SAVE_INTERVAL_MS = 2000;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(stampRows(results, import.meta.url), null, 2));
  savedAt = Date.now();
}

function isDeadSession(answer) {
  if (!answer) return true;
  if (answer.status === 401 || answer.status === 403) return true;
  const err = String(answer.error || "");
  if (/<!DOCTYPE|<html|unauthorized|not authenticated|session expired/i.test(err)) return true;
  const jsonError = answer.json && !Array.isArray(answer.json) ? String(answer.json.error || "") : "";
  if (/unauthorized|not authenticated|session|login|token/i.test(jsonError)) return true;
  try {
    if (page && !page.isClosed() && looksLoggedOut(page.url())) return true;
  } catch {
    return true;
  }
  return false;
}

function isAuthenticatedTickle(answer) {
  const auth = answer?.json?.iserver?.authStatus;
  return Boolean(auth && auth.authenticated === true && auth.connected === true);
}

async function sessionIsLive() {
  if (!page || page.isClosed() || looksLoggedOut(page.url())) return false;
  const answer = await api("tickle");
  return !isDeadSession(answer) && isAuthenticatedTickle(answer);
}

function callInPage(path, options) {
  return page.evaluate(
    async (base, p, opts) => {
      try {
        const response = await fetch(`${base}/${p}`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: opts.method || "GET",
          body: opts.body || undefined,
        });
        const text = await response.text();
        try {
          return { status: response.status, json: JSON.parse(text) };
        } catch {
          return { status: response.status, error: text.slice(0, 200) };
        }
      } catch (error) {
        return { error: String(error) };
      }
    },
    API,
    path,
    options
  );
}

async function reconnectBrowser() {
  await browser.disconnect().catch(() => {});
  browser = await puppeteer.connect(CHROME);
  page = null;
  console.error("reconnected to Chrome");
}

async function ensureBrowser({ force = false } = {}) {
  if (!force) {
    try {
      await browser.pages();
      return true;
    } catch {
      /* reconnect below */
    }
  }
  try {
    await reconnectBrowser();
    return true;
  } catch {
    return false;
  }
}

// The portal reloads itself every so often, and a reload destroys the context
// the call was made from. The call is made again against the new document.
async function api(path, options = {}) {
  for (let attempt = 0; ; attempt += 1) {
    if (!page || page.isClosed()) {
      await attachPortalPage();
      if (!page) return { error: "no portal tab" };
    }

    try {
      return await callInPage(path, options);
    } catch (error) {
      if (attempt >= 4) return { error: String(error) };

      await sleep(1000);
      await attachPortalPage();
    }
  }
}

async function tickle() {
  await api("tickle").catch(() => null);
}

// `pattern: false` asks for the symbol itself. An unknown ticker answers
// `{ error: "No symbol found" }` or `[]`. A logged-out portal answers the
// same `[]`, which must not be treated as "not listed".
async function search(symbol) {
  const answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol, pattern: false, referrer: "" }),
  });
  if (isDeadSession(answer) || (!answer.json && !answer.error)) return null;
  if (!Array.isArray(answer.json)) return [];
  const hits = answer.json.filter((hit) => hit?.conid && hit?.symbol);
  if (hits.length > 0) markHealthy();
  return hits;
}

const HEALTHY_MS = 15_000;
let healthyUntil = 0;
let canaryWait = null;

function markHealthy() {
  healthyUntil = Date.now() + HEALTHY_MS;
}

function isHealthy() {
  return Date.now() < healthyUntil;
}

async function confirmHealthy() {
  if (isHealthy()) return true;
  if (canaryWait) return canaryWait;

  canaryWait = (async () => {
    const probe = await search("SPY");
    return Boolean(probe && probe.length > 0);
  })().finally(() => {
    canaryWait = null;
  });

  return canaryWait;
}

let sessionWait = null;

async function waitForSession() {
  if (sessionWait) return sessionWait;

  sessionWait = (async () => {
    save();
    console.error("portal not answering; waiting until it is signed in again...");

    for (let waited = 0; ; waited += 10) {
      await ensureBrowser({ force: waited === 0 || waited % 60 === 0 });
      page = null;
      await attachPortalPage();

      if (await sessionIsLive()) {
        markHealthy();
        console.error("portal session restored");
        await page.bringToFront().catch(() => {});
        return;
      }

      if (waited > 0 && waited % 30 === 0) {
        console.error(`  still waiting (${waited}s)`);
      }
      await sleep(10000);
    }
  })().finally(() => {
    sessionWait = null;
  });

  return sessionWait;
}

async function searchWithRetry(query) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = await search(query);
    if (payload && payload.length > 0) return payload;

    if (payload !== null) {
      if (attempt === 0) {
        await sleep(400);
        continue;
      }
      if (isHealthy() || (await confirmHealthy())) return payload;
      console.error("  empty while SPY is silent, retrying");
    } else {
      console.error("  no answer, retrying");
    }

    await tickle();
    await sleep(2000 * (attempt + 1));
  }
  return null;
}

// The search says nothing about the currency, which is what separates the two
// London lines of one fund. The contract details do.
async function readInfo(conid) {
  if (!conid) return null;
  const answer = await api(`iserver/secdef/info?conid=${conid}`);
  return answer.json && !answer.json.error ? answer.json : null;
}

const RESTRICTED_NOTICE =
  /KID|Trading Restricted|not available|cannot be traded|Retail clients can trade packaged/i;

// A US-domiciled fund publishes no KID, and PRIIPs leaves European retail
// clients unable to buy one. A non-EU resident still can. IBKR quotes those
// listings all the same and admits it in one place only: field 7183, the
// order-ticket notice. 7184 alone says nothing, since tradable UCITS listings
// come back with 7184=1 too.
//
// A snapshot answers empty until the subscription warms up, so it has to be
// asked repeatedly. Every listing behind one ticker is asked for at once,
// which keeps the waiting to once per query rather than once per listing.
async function tradingRestricted(conids) {
  const pending = new Set(conids.filter(Boolean));
  const status = new Map();

  for (let attempt = 0; attempt < 10 && pending.size > 0; attempt += 1) {
    const answer = await api(
      `iserver/marketdata/snapshot?conids=${[...pending].join(",")}&fields=6509,7183,7184,31`
    );

    for (const row of Array.isArray(answer.json) ? answer.json : []) {
      const conid = String(row?.conid ?? "");
      if (!pending.has(conid)) continue;

      const notice = (row["7183"] || "").toString();
      if (notice) {
        status.set(conid, RESTRICTED_NOTICE.test(notice));
        pending.delete(conid);
      } else if (row["31"] !== undefined || row["6509"] !== undefined) {
        // A price, or mere availability, without a notice means it settled.
        status.set(conid, false);
        pending.delete(conid);
      }
    }

    if (pending.size > 0) await sleep(300);
  }

  // A listing the snapshot never settled on is left unflagged rather than
  // guessed at: the flag is a fact about the notice, not about its absence.
  for (const conid of pending) status.set(conid, false);
  return status;
}

async function scrapeRowsForQuery(query) {
  const payload = await searchWithRetry(query);
  if (payload === null) return { silent: true, rows: [] };

  const hits = payload
    .filter((entry) => (entry?.symbol || "").toUpperCase() === query)
    .filter((entry) =>
      (entry.sections || []).some((section) => section?.secType === "STK")
    );

  const restrictions = await tradingRestricted(hits.map((entry) => String(entry.conid)));

  const rows = [];
  for (const entry of hits) {
    const exchange = (entry.description || "").trim();
    const heading = (entry.companyHeader || entry.companyName || "").trim();
    // The exact search suffixes the listing venue onto the company name
    // ("SPDR GOLD SHARES - ARCA"), which the fuzzy search leaves off.
    const suffix = ` - ${exchange}`;
    const name =
      exchange && heading.endsWith(suffix)
        ? heading.slice(0, -suffix.length).trim()
        : heading;
    if (!name) continue;

    const info = (await readInfo(entry.conid)) || {};

    rows.push({
      ticker: (entry.symbol || "").toUpperCase(),
      name,
      exchange,
      currency: info.currency || null,
      raw: heading,
      restricted: restrictions.get(String(entry.conid)) === true,
    });
  }

  return { silent: false, rows };
}

const walk = pending.slice(startIndex - 1);
console.error(
  `${queries.length} tickers in the list, ${alreadyQueried.size} already listed, ${walk.length} still to ask` +
    (lanes > 1 ? ` (${lanes} in flight)` : "")
);

let done = 0;

function ingest(query, rows) {
  for (const row of rows) {
    const listing = resolveListing(tickerCandidates, query, row.name);
    // Same ticker, different company: not the instrument we asked about.
    if (!listing) continue;

    const key = entryKey(query, row);
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = {
      query,
      ticker: row.ticker,
      name: row.name,
      exchange: row.exchange,
      currency: row.currency,
      type: listing.kind,
      raw: row.raw,
      isin: listing.isin,
    };
    if (row.restricted) entry.nonEuResident = true;
    results.push(entry);
  }
}

async function runQuery(query) {
  let silent;
  let rows;
  for (;;) {
    ({ silent, rows } = await scrapeRowsForQuery(query));
    if (!silent) break;
    console.error("  no answer");
    await waitForSession();
  }
  ingest(query, rows);
}

if (walk.length > 0 && !(await sessionIsLive())) {
  console.error("portal is not signed in; waiting...");
  await waitForSession();
}

let next = 0;
await Promise.all(
  Array.from({ length: Math.min(lanes, walk.length || 1) }, async () => {
    for (;;) {
      const offset = next++;
      if (offset >= walk.length) return;
      const query = walk[offset];
      await runQuery(query);
      done += 1;
      if (done === 1 || done % 50 === 0 || done >= walk.length) {
        console.error(`[${done}/${walk.length}] ${query} → ${results.length} listed`);
      }
      if (Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
      if (done % 20 === 0 && !(await sessionIsLive())) await waitForSession();
    }
  })
);
save();

const byType = new Map();
let nonEu = 0;
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  if (row.nonEuResident) nonEu += 1;
}
console.error(
  `${results.length} listed (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
if (nonEu > 0) {
  console.error(`${nonEu} of them are non-EU-resident (no KID for European retail)`);
}

await browser.disconnect();
