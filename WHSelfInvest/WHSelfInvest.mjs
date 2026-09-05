import puppeteer from "puppeteer-core";
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

// Funds and shares are both STK on the IBKR portal WH SelfInvest introduces
// onto. The catalogue the ISIN was read from is what types the row; the name
// only splits trackers into ETF / ETC / ETN.
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
const startIndex = Math.max(1, numberArg("start", 1));
const walkLimit = numberArg("limit", 0);

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

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
      const ticker = normalizeTicker(arg);
      if (!ticker || seenQueries.has(ticker)) continue;
      seenQueries.add(ticker);
      jobs.push({ query: ticker, shelf: "crypto", kind: "CRYPTO" });
    }
  }
} else {
  if (wantEtfs) loadIsinJobs(etfsCsvPath, "ETF", seenQueries, jobs);
  if (wantStocks) loadIsinJobs(stocksCsvPath, "STOCK", seenQueries, jobs);
  if (wantCrypto) loadCryptoJobs(cryptosCsvPath, seenQueries, jobs);
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

// The page is only there to lend its signed-in SelfInvest session. Native IBKR
// tabs on interactivebrokers.* are left alone — that walk uses a different
// introducing broker and must keep its own cookies.
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

const outputPath = new URL("whselfinvest-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

const entryKey = (row) =>
  `${row.isin || row.query}:${row.exchange}:${row.ticker}:${row.type}:${row.currency || ""}`.toUpperCase();

// A walk this long is run in stretches. What is already listed is read back
// and kept; `--fresh` is how a run says it means to start the file over.
if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entryKey(entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const API = "/portal.proxy/v1/portal";

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

async function ensureBrowser() {
  try {
    await browser.pages();
    return true;
  } catch {
    try {
      await browser.disconnect().catch(() => {});
      browser = await puppeteer.connect(CHROME);
      page = null;
      console.error("reconnected to Chrome");
      return true;
    } catch {
      return false;
    }
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

// `pattern: true` is what makes an ISIN acceptable as the term; an exact
// search only answers to symbols. Crypto has no ISIN, so those go the other way.
async function search(symbol, pattern) {
  const answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol, pattern, referrer: "" }),
  });
  if (isDeadSession(answer) || (!answer.json && !answer.error)) return null;
  if (!Array.isArray(answer.json)) return [];
  return answer.json.filter((hit) => hit?.conid && hit?.symbol);
}

// The portal signs itself out after a stretch, and login often lands in a
// different tab. Progress is already on disk; this just sits until a search
// answers again so the walk can retry the query it was on.
async function waitForSession() {
  save();
  console.error("portal not answering; waiting until it is signed in again...");

  for (let waited = 0; ; waited += 10) {
    await ensureBrowser();
    await attachPortalPage();

    if (page && !page.isClosed() && !looksLoggedOut(page.url())) {
      const probe = await search("AAPL", false);
      if (probe !== null) {
        console.error("portal session restored");
        return;
      }
    }

    if (waited > 0 && waited % 30 === 0) {
      console.error(`  still waiting (${waited}s)`);
    }
    await sleep(10000);
  }
}

async function searchWithRetry(symbol, pattern) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = await search(symbol, pattern);
    if (payload !== null) return payload;
    console.error("  no answer, retrying");
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

const RESTRICTED_NOTICE =
  /KID|Trading Restricted|not available|cannot be traded|Retail clients can trade packaged/i;

// A US-domiciled fund publishes no KID, and PRIIPs leaves European retail
// clients unable to buy one; only a US resident can. The portal quotes those
// listings all the same and admits it in one place only: field 7183, the
// order-ticket notice. 7184 alone says nothing, since tradable UCITS listings
// come back with 7184=1 too.
async function tradingRestricted(conids) {
  const pending = new Set(conids.filter(Boolean).map(String));
  const status = new Map();
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
        status.set(conid, RESTRICTED_NOTICE.test(notice));
        pending.delete(conid);
        continue;
      }

      if (row["31"] !== undefined || row["6509"] !== undefined) {
        if (!quotedAt.has(conid)) quotedAt.set(conid, attempt);
        if (attempt - quotedAt.get(conid) >= 2) {
          status.set(conid, false);
          pending.delete(conid);
        }
      }
    }

    if (pending.size > 0) await sleep(300);
  }

  for (const conid of pending) status.set(conid, false);
  return status;
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

  const restrictions = await tradingRestricted(hits.map((hit) => String(hit.conid)));
  const rows = [];

  for (const hit of hits) {
    const info = (await readInfo(hit.conid)) || {};
    const ticker = (info.ticker || hit.symbol || "").toUpperCase();
    const name = listingName(hit) || normalize(info.companyName || "");
    const exchange = listingVenue(hit, info) || (job.kind === "CRYPTO" ? "CRYPTO" : "");
    const currency = info.currency || null;
    if (!ticker || !exchange || !name) continue;

    const type = listingType(name, job.kind);
    rows.push({
      ticker,
      name,
      exchange,
      currency,
      type,
      raw: [hit.companyHeader || hit.companyName || name, exchange].filter(Boolean).join(" "),
      restricted: restrictions.get(String(hit.conid)) === true,
    });
  }

  return { silent: false, rows };
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

const endIndex = walkLimit > 0 ? startIndex - 1 + walkLimit : jobs.length;

console.error(
  `${jobs.length} queries to check` +
    (startIndex > 1 || walkLimit > 0
      ? ` (walking ${startIndex}–${Math.min(endIndex, jobs.length)})`
      : "")
);

for (const [queryIndex, job] of jobs.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  if (queryIndex + 1 > endIndex) break;
  if (queryIndex % 5 === 0) await tickle();
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
    continue;
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
    if (row.restricted) entry.usResidentsOnly = true;

    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(entry);

    if (row.restricted) {
      console.error(`  ${row.ticker}@${row.exchange}: US residents only (no KID)`);
    }
  }

  save();
}

const byType = new Map();
let usOnly = 0;
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  if (row.usResidentsOnly) usOnly += 1;
}
console.error(
  `${results.length} listed (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
if (usOnly > 0) {
  console.error(`${usOnly} of them are US-residents only (no KID for European retail)`);
}

await browser.disconnect();
