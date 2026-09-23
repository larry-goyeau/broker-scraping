// What LYNX+ actually quotes: the signed-in tab on lynxplus.com, through
// `/ibapi/v1/api` — Interactive Brokers' iserver under Lynx's own host.
// LYNX B.V. introduces onto IBKR; the book is the same STK search Mexem
// and CapTrader walk, filtered to what this account may see. Funds and
// shares are both STK; the CSV the ISIN came from types the row.
//
// Do not navigate the tab. A `goto` on lynxplus.com has been seen to
// fire `/ibapi/v1/api/logout` and drop the bridge.
//
//   node lynx/lynx_scraping.mjs
//   node lynx/lynx_scraping.mjs IE00B4L5Y983 US0378331005
//   node lynx/lynx_scraping.mjs --fresh --start=400
//
// Writes `lynx-parsed.json` next to this file.

import puppeteer from "puppeteer-core";
import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").split(/[./]/)[0].trim();
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

function hasSection(hit, secType) {
  return (hit.sections || []).some((section) => section?.secType === secType);
}

// Funds and shares are both STK on the IBKR book LYNX+ introduces onto.
// The catalogue the ISIN was read from is what types the row; the name only
// splits trackers into ETF / ETC / ETN.
function listingType(name, kind) {
  if (kind === "CRYPTO") return "CRYPTO";
  if (kind === "STOCK") return "STOCK";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  return "ETF";
}

function listingName(hit) {
  const heading = normalize(hit.companyHeader || hit.companyName || "");
  const exchange = normalize(hit.description || "");
  const suffix = exchange ? ` - ${exchange}` : "";
  if (suffix && heading.endsWith(suffix)) return heading.slice(0, -suffix.length).trim();
  return heading;
}

function listingVenue(hit, info) {
  const fromSearch = normalize(hit.description || "").toUpperCase();
  if (fromSearch) return fromSearch;
  const listed = normalize(info.listingExchange || info.exchange || "").toUpperCase();
  return listed;
}

function unwrapInfo(json, conid) {
  if (!json || json.error) return null;
  if (Array.isArray(json)) {
    return json.find((row) => String(row?.conid) === String(conid)) || json[0] || null;
  }
  return json;
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` walk one shelf. Funds are loaded first so an ISIN both
// catalogues happen to carry is remembered as the fund it is.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const fresh = hasFlag("fresh");
// Re-read the retail KID block onto rows already in lynx-parsed.json.
// A what-if preview, not an order: the portal answers before any transmit.
const restrictionsOnly = hasFlag("restrictions");
const startIndex = Math.max(1, numberArg("start", 1));
const walkLimit = numberArg("limit", 0);
// Several searches can be in flight on the same signed-in tab; the portal
// answers them as ordinary fetches. Four is enough to cut the walk without
// crowding the snapshot subscription. `--concurrency=1` restores the old pace.
const lanes = Math.max(1, numberArg("concurrency", 4));

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
// LYNX+ is the equity / ETF book. Spot crypto is not walked here.
const wantCrypto = false;

function loadIsinKinds(csvPath, kind, index) {
  if (!csvPath || !fs.existsSync(csvPath)) return;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (isin && !index.has(isin)) index.set(isin, kind);
  }
}

function loadIsinJobs(csvPath, kind, seen, jobs) {
  if (!csvPath || !fs.existsSync(csvPath)) return;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin || seen.has(isin)) continue;
    seen.add(isin);
    jobs.push({ query: isin, shelf: "isin", kind });
  }
}

function loadCryptoJobs(csvPath, seen, jobs) {
  if (!csvPath || !fs.existsSync(csvPath)) return;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const ticker = normalizeTicker(line.split(",")[0]);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    jobs.push({ query: ticker, shelf: "crypto", kind: "CRYPTO" });
  }
}

const kindByIsin = new Map();
loadIsinKinds(etfsCsvPath, "ETF", kindByIsin);
loadIsinKinds(stocksCsvPath, "STOCK", kindByIsin);

const jobs = [];
const seenQueries = new Set();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

if (positionalArgs.length > 0) {
  for (const arg of positionalArgs) {
    const isin = toIsin(arg);
    if (isin) {
      if (seenQueries.has(isin)) continue;
      seenQueries.add(isin);
      jobs.push({
        query: isin,
        shelf: "isin",
        kind: kindByIsin.get(isin) || "STOCK",
      });
    } else {
      continue;
    }
  }
} else {
  if (wantEtfs) loadIsinJobs(etfsCsvPath, "ETF", seenQueries, jobs);
  if (wantStocks) loadIsinJobs(stocksCsvPath, "STOCK", seenQueries, jobs);
  if (wantCrypto) loadCryptoJobs(cryptosCsvPath, seenQueries, jobs);
  const HOME_RANK = { FR: 0, NL: 1, IE: 2, LU: 3, DE: 4, BE: 5, US: 6, GB: 7, AT: 8, CH: 9 };
  const homeRank = (isin) => HOME_RANK[String(isin).slice(0, 2)] ?? 10;
  jobs.sort((a, b) => homeRank(a.query) - homeRank(b.query) || String(a.query).localeCompare(b.query));
}

const CHROME = { browserURL: "http://127.0.0.1:9222", defaultViewport: null };
const HOME = "https://www.lynxplus.com/";

let browser = await puppeteer.connect(CHROME);

function isPortalUrl(url) {
  return /lynxplus\.com/i.test(url);
}

function looksLoggedOut(url) {
  return /\/login|signin|sso\.|authentication/i.test(url) && !/instrument/i.test(url);
}

// The page is only there to lend its signed-in LYNX+ session. Do not
// `goto` an instrument or the home page on a live tab: that has logged
// the bridge out. Native IBKR / clientam tabs are left alone.
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
  await page.goto(HOME, { waitUntil: "domcontentloaded" });
}

const outputPath = new URL("lynx-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
const existingByKey = new Map();

const entryKey = (row) =>
  `${row.isin || row.query}:${row.exchange}:${row.ticker}:${row.type}:${row.currency || ""}`.toUpperCase();

// A walk this long is run in stretches. What is already listed is read back
// and kept; `--fresh` is how a run says it means to start the file over.
if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        if (String(entry?.type || "").toUpperCase() === "CRYPTO") continue;
        if (unsupportedVenue(entry.exchange)) continue;
        results.push(entry);
        if (entry?.ticker) {
          const key = entryKey(entry);
          seen.add(key);
          existingByKey.set(key, entry);
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const API = "/ibapi/v1/api";

function isDeadSession(answer) {
  if (!answer) return true;
  if (answer.status === 401 || answer.status === 403) return true;
  const err = String(answer.error || "");
  if (/<!DOCTYPE|<html|unauthorized|not authenticated|session expired/i.test(err)) return true;
  const jsonError = answer.json && !Array.isArray(answer.json) ? String(answer.json.error || "") : "";
  if (/unauthorized|not authenticated|session|login|token|no bridge/i.test(jsonError)) return true;
  try {
    if (page && !page.isClosed() && looksLoggedOut(page.url())) return true;
  } catch {
    return true;
  }
  return false;
}

// A logged-out bridge still answers search with `[]` or "no bridge", which
// the walk would treat as "this ISIN is not listed".
function isAuthenticatedStatus(answer) {
  const json = answer?.json;
  if (json && json.authenticated === true && json.connected === true) return true;
  const auth = json?.iserver?.authStatus;
  return Boolean(auth && auth.authenticated === true && auth.connected === true);
}

async function sessionIsLive() {
  if (!page || page.isClosed() || looksLoggedOut(page.url())) return false;
  const status = await api("iserver/auth/status");
  if (!isDeadSession(status) && isAuthenticatedStatus(status)) return true;
  const tickle = await api("iserver/tickle");
  return !isDeadSession(tickle) && isAuthenticatedStatus(tickle);
}

function callInPage(path, options) {
  return page.evaluate(
    async (base, target, opts) => {
      try {
        const response = await fetch(`${base}/${target}`, {
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
  await api("iserver/tickle").catch(() => null);
}

// `pattern: true` is what makes an ISIN acceptable as the term; an exact
// search only answers to symbols. Crypto has no ISIN, so those go the other way.
async function search(symbol, pattern) {
  const answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol, pattern, referrer: "" }),
  });
  if (isDeadSession(answer) || (!answer.json && !answer.error)) return null;
  if (!Array.isArray(answer.json)) return [];
  const hits = answer.json.filter((hit) => hit?.conid && hit?.symbol);
  if (hits.length > 0) markHealthy();
  return hits;
}

// A non-empty search (any query, including the SPY canary) is proof the
// portal still answers. Empty arrays that arrive inside that window are
// real misses; outside it they are treated as faults until SPY confirms.
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
    const probe = await search("SPY", false);
    return Boolean(probe && probe.length > 0);
  })().finally(() => {
    canaryWait = null;
  });

  return canaryWait;
}

// The portal signs itself out after a stretch, and login often lands in a
// different tab. Progress is already on disk; this just sits until a search
// answers again so the walk can retry the query it was on. Parallel workers
// share one wait so they do not all poke the login page at once.
let sessionWait = null;

async function waitForSession() {
  if (sessionWait) return sessionWait;

  sessionWait = (async () => {
    save();
    console.error("LYNX+ not answering; waiting until it is signed in again...");

    for (let waited = 0; ; waited += 10) {
      // Login opens a new tab; after a long wait the old CDP list no longer
      // sees it. Reconnect every minute so the walk resumes by itself.
      await ensureBrowser({ force: waited === 0 || waited % 60 === 0 });
      page = null;
      await attachPortalPage();

      if (await sessionIsLive()) {
        // Authenticated and connected is the same proof a search gives, so
        // the lanes can resume without each one probing SPY first.
        markHealthy();
        console.error("LYNX+ session restored");
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

async function searchWithRetry(symbol, pattern) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = await search(symbol, pattern);
    if (payload && payload.length > 0) return payload;

    if (payload !== null) {
      // One empty is cheap to fake under load. A second empty, with SPY
      // still answering (or having answered in the last few seconds), is an
      // unknown ISIN. SPY silent means the session, not the catalogue.
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

async function readInfo(conid) {
  if (!conid) return null;
  const answer = await api(`iserver/secdef/info?conid=${conid}`);
  return unwrapInfo(answer.json, conid);
}

const KID_NOTICE = /KID|Retail clients can trade packaged/i;
const CLOSE_ONLY_NOTICE = /only closing orders|no opening trade/i;
// The what-if error is the order-ticket sentence. A bare "KID" match would
// also catch a preview that merely links the document.
const TICKET_KID = /does not have a KID|Retail clients can trade packaged/i;
const LOT_SIZE = /multiple of ([\d,]+)/i;

function closeOnlyVenue(listingExchange) {
  return /\.EXPERT\b/i.test(String(listingExchange || ""));
}

// These places quote, and the what-if answers "No trading permissions."
// The order ticket says the instrument is not supported via LYNX (E003).
// A liquid name gets the same answer as a small one — Samsung on KRX,
// TSMC on TWSE — so it is the place, not the line. Lynx only opens
// accounts in AT BE CZ FI FR DE NL PL SK, so a resident of Korea or
// Taiwan is not a client who could buy it either. Dropped, like a
// close-only venue.
function unsupportedVenue(exchange) {
  const code = String(exchange || "").toUpperCase();
  return code === "KRX" || code === "TWSE" || code === "TPEX";
}

// A packaged product with no KID in a language approved for this retail
// account cannot be bought by an EEA resident. A non-EU resident still can.
// The portal quotes the listing all the same. Field 7183 sometimes carries
// that sentence; on this account it stays empty, and the same words come
// back from a what-if preview. 7184 alone says nothing, since tradable UCITS
// listings come back with 7184=1 too. The what-if is not an order.
//
// PINK.EXPERT (and 7183 "only closing orders") is close-only: the line can
// be sold if already held, not bought. It is dropped, not flagged.
async function tradingNotices(conids) {
  const pending = new Set(conids.filter(Boolean).map(String));
  const kid = new Map();
  const closeOnly = new Map();
  const quotedAt = new Map();

  for (let attempt = 0; attempt < 10 && pending.size > 0; attempt += 1) {
    const answer = await api(
      `iserver/marketdata/snapshot?conids=${[...pending].join(",")}&fields=6509,7183,7184,31`
    );

    for (const row of Array.isArray(answer.json) ? answer.json : []) {
      const conid = String(row?.conid ?? "");
      if (!pending.has(conid)) continue;

      const notice = (row["7183"] || "").toString();
      if (notice) {
        const skip = CLOSE_ONLY_NOTICE.test(notice);
        closeOnly.set(conid, skip);
        kid.set(conid, !skip && KID_NOTICE.test(notice));
        pending.delete(conid);
        continue;
      }

      if (row["31"] !== undefined || row["6509"] !== undefined) {
        if (!quotedAt.has(conid)) quotedAt.set(conid, attempt);
        if (attempt - quotedAt.get(conid) >= 2) {
          kid.set(conid, false);
          closeOnly.set(conid, false);
          pending.delete(conid);
        }
      }
    }

    if (pending.size > 0) await sleep(300);
  }

  for (const conid of pending) {
    kid.set(conid, false);
    closeOnly.set(conid, false);
  }
  return { kid, closeOnly };
}

let tradingAccountId = "";

async function tradingAccount() {
  if (tradingAccountId) return tradingAccountId;
  const answer = await api("iserver/accounts");
  const id = answer.json?.accounts?.[0];
  if (!id) return "";
  tradingAccountId = String(id);
  return tradingAccountId;
}

function previewText(answer) {
  const json = answer?.json;
  if (!json || Array.isArray(json)) return "";
  const parts = [json.error, json.warning];
  for (const list of [json.errors, json.warns, json.warnings]) {
    if (Array.isArray(list)) parts.push(...list);
  }
  return parts.filter(Boolean).join(" ");
}

// True when this retail account is told the product has no approved KID.
// False when the preview fails for some other reason (lot size already
// retried, complex-product permission, a market this account has not
// enabled). Null when the session itself is gone.
async function kidFromTicket(conid) {
  const account = await tradingAccount();
  if (!account || !conid) return false;

  let quantity = 1;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await api(`iserver/account/${encodeURIComponent(account)}/orders/whatif`, {
      method: "POST",
      body: JSON.stringify({
        orders: [
          {
            acctId: account,
            conid: Number(conid),
            orderType: "MKT",
            side: "BUY",
            tif: "DAY",
            quantity,
          },
        ],
      }),
    });
    if (isDeadSession(answer)) return null;

    const err = previewText(answer);
    if (TICKET_KID.test(err)) return true;

    const lot = err.match(LOT_SIZE);
    const next = lot ? Number(lot[1].replace(/,/g, "")) : 0;
    if (next > quantity && next <= 100000) {
      quantity = next;
      continue;
    }
    return false;
  }
  return false;
}

async function kidFromTicketWhenReady(conid) {
  for (;;) {
    const ticket = await kidFromTicket(conid);
    if (ticket !== null) return ticket;
    await waitForSession();
  }
}

function wantedHits(payload, job) {
  if (!payload) return [];
  const query = job.query.toUpperCase();

  if (job.shelf === "crypto") {
    return payload.filter(
      (hit) => (hit.symbol || "").toUpperCase() === query && hasSection(hit, "CRYPTO")
    );
  }

  return payload.filter((hit) => hit.conid && hasSection(hit, "STK"));
}

async function scrapeJob(job) {
  const pattern = job.shelf === "isin";
  const payload = await searchWithRetry(job.query, pattern);
  if (payload === null) return { silent: true, rows: [] };

  const hits = wantedHits(payload, job);
  if (hits.length === 0) return { silent: false, rows: [] };

  const notices = await tradingNotices(hits.map((hit) => String(hit.conid)));
  const infos = await Promise.all(hits.map((hit) => readInfo(hit.conid)));
  // One preview per product. The KID sentence is about the instrument, and
  // every venue of that search is the same ISIN.
  let productKid = hits.some((hit) => notices.kid.get(String(hit.conid)) === true);
  if (!productKid && job.kind === "ETF") {
    productKid = await kidFromTicketWhenReady(hits[0].conid);
    if (productKid) console.error("  ticket: no KID for European retail");
  }
  const rows = [];

  for (const [index, hit] of hits.entries()) {
    const conid = String(hit.conid);
    const info = infos[index] || {};
    if (closeOnlyVenue(info.listingExchange) || notices.closeOnly.get(conid)) continue;
    if (unsupportedVenue(listingVenue(hit, info))) continue;

    const ticker = (info.ticker || hit.symbol || "").toUpperCase();
    const name = listingName(hit) || normalize(info.companyName || "");
    const exchange = listingVenue(hit, info) || (job.kind === "CRYPTO" ? "CRYPTO" : "");
    const currency = info.currency || null;
    if (!ticker || !exchange || !name) continue;

    const type = listingType(name, job.kind);
    if (type === "CRYPTO") continue;
    rows.push({
      ticker,
      name,
      exchange,
      currency,
      type,
      raw: [hit.companyHeader || hit.companyName || name, exchange].filter(Boolean).join(" "),
      restricted: productKid || notices.kid.get(conid) === true,
    });
  }

  return { silent: false, rows };
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(stampRows(results, import.meta.url), null, 2));
}

const endIndex = walkLimit > 0 ? startIndex - 1 + walkLimit : jobs.length;
const walk = jobs.slice(startIndex - 1, endIndex);

const checkedPath = "/tmp/lynx-kid-checked.txt";

async function applyStoredRestrictions() {
  const doneIsins = new Set();
  if (fs.existsSync(checkedPath)) {
    for (const line of fs.readFileSync(checkedPath, "utf8").split(/\r?\n/)) {
      const isin = line.trim().toUpperCase();
      if (isin) doneIsins.add(isin);
    }
  }

  const byIsin = new Map();
  for (const row of results) {
    if (!/^(ETF|ETC|ETN)$/.test(row.type || "")) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!isin) continue;
    if (!byIsin.has(isin)) byIsin.set(isin, []);
    byIsin.get(isin).push(row);
  }

  // UCITS domiciles are usually allowed, so they wait. The no-KID
  // lines (US, CA, AU, …) are what the ticket withholds, and they are
  // written first.
  const later = new Set([
    "IE", "LU", "FR", "NL", "DE", "BE", "SE", "PL", "HU", "EE", "AT", "FI",
    "PT", "ES", "IT", "NO", "IS", "LI", "DK", "CZ", "SK", "SI", "HR", "BG",
    "RO", "GR", "CY", "MT", "LV", "LT", "GB",
  ]);
  const pending = [...byIsin.keys()]
    .filter((isin) => !doneIsins.has(isin) && !byIsin.get(isin).some((row) => row.nonEuResident))
    .sort((a, b) => Number(later.has(a.slice(0, 2))) - Number(later.has(b.slice(0, 2))));
  console.error(
    `${pending.length} packaged products to preview (${byIsin.size} in the file` +
      (lanes > 1 ? `, ${lanes} at a time` : "") +
      ")"
  );

  let cursor = 0;
  let finished = 0;
  let blocked = 0;
  const batch = [];
  const started = Date.now();

  function flush() {
    if (batch.length === 0) return;
    const writing = batch.splice(0, batch.length);
    save();
    fs.appendFileSync(checkedPath, `${writing.join("\n")}\n`);
    const secs = (Date.now() - started) / 1000;
    console.error(
      `  ${finished}/${pending.length} previewed, ${blocked} without a KID (${(finished / secs).toFixed(2)}/s)`
    );
  }

  // Search and the what-if share one page call. The ISIN is recorded only
  // after the file is written, so a stop cannot skip a block it did not save.
  async function one(isin) {
    const account = await tradingAccount();
    let answer = null;
    for (;;) {
      if (!page || page.isClosed()) {
        await attachPortalPage();
        if (!page) {
          await waitForSession();
          continue;
        }
      }
      try {
        answer = await page.evaluate(
          async (isin, account) => {
            const kidRe = /does not have a KID|Retail clients can trade packaged/i;
            const lotRe = /multiple of ([\d,]+)/i;
            const search = await fetch("/ibapi/v1/api/iserver/secdef/search", {
              credentials: "include",
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ symbol: isin, pattern: true, referrer: "" }),
            });
            const searchText = await search.text();
            let hits;
            try {
              hits = JSON.parse(searchText);
            } catch {
              return { dead: true };
            }
            if (!Array.isArray(hits)) {
              const err = String(hits?.error || "");
              if (/unauthorized|not authenticated|no bridge/i.test(err) || search.status === 401) {
                return { dead: true };
              }
              return { kid: false };
            }
            const hit = hits.find(
              (row) => row?.conid && (row.sections || []).some((section) => section?.secType === "STK")
            );
            if (!hit || !account) return { kid: false };

            let quantity = 1;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const response = await fetch(
                `/ibapi/v1/api/iserver/account/${encodeURIComponent(account)}/orders/whatif`,
                {
                  credentials: "include",
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    orders: [
                      {
                        acctId: account,
                        conid: Number(hit.conid),
                        orderType: "MKT",
                        side: "BUY",
                        tif: "DAY",
                        quantity,
                      },
                    ],
                  }),
                }
              );
              const text = await response.text();
              let json;
              try {
                json = JSON.parse(text);
              } catch {
                return { dead: true };
              }
              if (response.status === 401 || response.status === 403) return { dead: true };
              const parts = [json?.error, json?.warning];
              for (const list of [json?.errors, json?.warns, json?.warnings]) {
                if (Array.isArray(list)) parts.push(...list);
              }
              const err = parts.filter(Boolean).join(" ");
              if (/unauthorized|not authenticated|no bridge/i.test(err)) return { dead: true };
              if (kidRe.test(err)) return { kid: true };
              const lot = err.match(lotRe);
              const next = lot ? Number(lot[1].replace(/,/g, "")) : 0;
              if (next > quantity && next <= 100000) {
                quantity = next;
                continue;
              }
              return { kid: false };
            }
            return { kid: false };
          },
          isin,
          account
        );
      } catch {
        answer = null;
      }
      if (answer && !answer.dead) break;
      console.error("  no answer");
      await waitForSession();
    }

    if (answer.kid) {
      for (const row of byIsin.get(isin)) row.nonEuResident = true;
      blocked += 1;
    }
    batch.push(isin);
    finished += 1;
    if (batch.length >= 40) flush();
  }

  if (pending.length > 0 && !(await sessionIsLive())) {
    console.error("LYNX+ is not signed in; waiting...");
    await waitForSession();
  }

  await Promise.all(
    Array.from({ length: Math.min(lanes, pending.length) }, async () => {
      for (;;) {
        const offset = cursor++;
        if (offset >= pending.length) return;
        await one(pending[offset]);
      }
    })
  );

  flush();
  console.error(`${finished} previewed, ${blocked} without a KID for European retail`);
}

if (restrictionsOnly) {
  await applyStoredRestrictions();
  await browser.disconnect();
  process.exit(0);
}

console.error(
  `${jobs.length} queries to check` +
    (startIndex > 1 || walkLimit > 0
      ? ` (walking ${startIndex}–${Math.min(endIndex, jobs.length)})`
      : "") +
    (lanes > 1 ? `, ${lanes} at a time` : "")
);

let next = 0;
let done = 0;

async function runJob(queryIndex, job) {
  console.error(`[${queryIndex + 1}/${jobs.length}] ${job.query}`);

  let silent;
  let rows;
  for (;;) {
    ({ silent, rows } = await scrapeJob(job));
    if (!silent) break;
    console.error("  no answer");
    await waitForSession();
  }

  if (rows.length === 0) {
    console.error("  no listings");
    return;
  }

  for (const row of rows) {
    const entry = {
      query: job.query,
      ticker: row.ticker,
      name: row.name,
      exchange: row.exchange,
      currency: row.currency,
      type: row.type,
      raw: row.raw,
      isin: job.shelf === "isin" ? job.query : "",
    };
    if (row.restricted) entry.nonEuResident = true;
    // NSE cash in rupees is on the book but IBKR Europe will not permission
    // it (Indian / NRI account only). Keep the line and mark it.
    if (
      String(row.exchange || "").toUpperCase() === "NSE" &&
      (!row.currency || String(row.currency).toUpperCase() === "INR")
    ) {
      entry.indianOnly = true;
    }

    if (row.restricted) {
      console.error(`  ${row.ticker}@${row.exchange}: non-EU resident (no KID)`);
    }
    if (entry.indianOnly) {
      console.error(`  ${row.ticker}@${row.exchange}: Indian-resident only`);
    }

    const key = entryKey(entry);
    if (seen.has(key)) {
      const existing = existingByKey.get(key);
      if (existing && entry.nonEuResident) existing.nonEuResident = true;
      continue;
    }
    seen.add(key);
    existingByKey.set(key, entry);
    results.push(entry);
  }

  save();
}

if (walk.length > 0 && !(await sessionIsLive())) {
  console.error("LYNX+ is not signed in; waiting...");
  await waitForSession();
}

await Promise.all(
  Array.from({ length: Math.min(lanes, walk.length) }, async () => {
    for (;;) {
      const offset = next++;
      if (offset >= walk.length) return;
      await runJob(startIndex - 1 + offset, walk[offset]);
      done += 1;
      // A blind tickle keeps the session warm but never says whether it is
      // still signed in, and a signed-out portal answers `[]` rather than an
      // error. The same call read for `authStatus` costs nothing more.
      if (done % 20 === 0 && !(await sessionIsLive())) await waitForSession();
    }
  })
);

const byType = new Map();
let nonEu = 0;
let indianOnly = 0;
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  if (row.nonEuResident) nonEu += 1;
  if (row.indianOnly) indianOnly += 1;
}
console.error(
  `${results.length} listed (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
if (nonEu > 0) {
  console.error(`${nonEu} of them are non-EU-resident (no KID for European retail)`);
}
if (indianOnly > 0) {
  console.error(`${indianOnly} of them are Indian-resident only (NSE cash)`);
}

await browser.disconnect();
