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
  return (afterExchange || "").trim();
}

// Funds first so an ISIN both catalogues happen to carry is remembered as the
// fund it is. IG's own label is the fallback when `--all` keeps a line the
// lists do not know.
function loadCsv(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (isin && !index.has(isin)) index.set(isin, kind);
  }
  return index;
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

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    })
  );
  return results;
}

// `--csv=PATH` overrides the fund list (defaults to etfs.csv) and
// `--stocks-csv=PATH` the share list. `--etfs-only` and `--stocks-only`
// walk one shelf alone. There is no coin book: a search for BTC answers
// an ETF and a share, not a pair.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));
const walkLimit = numberArg("limit", 0);
const lanes = Math.max(1, numberArg("concurrency", 12));

const wantEtfs = !stocksOnly;
const wantStocks = !etfsOnly;

const catalogue = new Map();
if (wantEtfs) loadCsv(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadCsv(stocksCsvPath, "STOCK", catalogue);

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliIsins = positionalArgs.map(toIsin).filter(Boolean);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session to the calls below: the
// web platform holds the dealing token in a cookie the page can be asked for.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("deal.ig.com")) || (await browser.newPage());

if (!page.url().includes("deal.ig.com")) {
  await page.goto("https://deal.ig.com/eu/web-platform/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

// The gateway behind deal.ig.com. It answers the same calls the web platform
// makes for itself, so nothing here asks for more than the screen already shows.
const API = "https://api.ig.com/eu-investments-api-gateway";
const PAGE_SIZE = 100;

async function readSession() {
  const cookies = await page.cookies("https://api.ig.com", "https://deal.ig.com");
  const value = (name) => cookies.find((cookie) => cookie.name === name)?.value || "";
  return {
    token: value("X-SECURITY-TOKEN"),
    account: value("preferredAccountId") || value("eu_web_session").split("|")[0],
  };
}

let session = await readSession();
if (!session.token) {
  throw new Error("No IG session in the browser. Sign in to deal.ig.com and run again.");
}

function headers() {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-security-token": session.token,
    ...(session.account ? { "ig-account-id": session.account } : {}),
    // Not decoration: the gateway answers 400 to a request that does not say
    // which locale and which client it is speaking for.
    "x-ig-device_locale": "en-GB",
    "x-device-user-agent": "vendor=IG Group | applicationType=ig | platform=WTP",
    origin: "https://deal.ig.com",
    referer: "https://deal.ig.com/",
  };
}

async function api(path, body, { tries = 4 } = {}) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        method: body ? "POST" : "GET",
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      if (attempt === tries) throw error;
      await sleep(400 * attempt);
      continue;
    }

    if (response.status === 404) return null;
    if (response.ok) return response.json();

    if (response.status === 401 || response.status === 403) {
      session = await readSession();
      if (!session.token) {
        throw new Error("IG signed the session out. Sign in to deal.ig.com and run again.");
      }
      await sleep(500);
      continue;
    }

    if (attempt === tries) throw new Error(`IG answered ${response.status} to ${path}`);
    await sleep(400 * attempt);
  }
  return null;
}

const searchPage = (query, pageNumber, filters) =>
  api("/instruments/search", {
    query,
    pageNumber,
    pageSize: PAGE_SIZE,
    ...(filters ? { filters } : {}),
  });

const details = (instrumentId) => api(`/instruments/${instrumentId}/details`);

function typeFilter(instrumentType) {
  return {
    instrumentType,
    country: { values: [] },
    dividendTreatment: { values: [] },
    provider: { values: [] },
    sector: { values: [] },
  };
}

// Every line this account can open, in `PAGE_SIZE` chunks. The search sorts
// by name, so paging it is stable, and ids are deduplicated in case a page
// boundary shifts under us mid-read.
async function readCatalogue(instrumentType) {
  const filters = instrumentType ? typeFilter(instrumentType) : undefined;
  const first = await searchPage("", 0, filters);
  const total = first?.meta?.totalResults ?? 0;
  const pageCount = first?.meta?.totalPages ?? 0;
  if (!total) {
    throw new Error("IG handed over an empty catalogue. Is the session still signed in?");
  }

  const byId = new Map();
  for (const instrument of first.instruments || []) byId.set(instrument.id, instrument);

  const rest = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 1);
  await mapLimit(rest, lanes, async (pageNumber) => {
    const result = await searchPage("", pageNumber, filters);
    for (const instrument of result?.instruments || []) byId.set(instrument.id, instrument);
  });

  if (byId.size < total) {
    console.error(`  warning: ${total} listed but only ${byId.size} came back`);
  }
  return [...byId.values()];
}

// IG's European share dealing is a Tradegate book. The RIC suffix says so
// (AAPL.TG); the primary listing (AAPL.OQ) is only where the name is from.
const VENUES = {
  TG: "TRADEGATE",
  DE: "XETR",
  PA: "EURONEXT",
  AS: "EURONEXT",
  BR: "EURONEXT",
  MI: "MIL",
  MC: "BME",
  L: "LSE",
  S: "SIX",
};

const LEGACY_EXCHANGES = {
  TRADEGATE: "TRADEGATE",
  XETRA: "XETR",
  "EURONEXT PARIS": "EURONEXT",
  "EURONEXT AMSTERDAM": "EURONEXT",
  "EURONEXT BRUSSELS": "EURONEXT",
  "BORSA ITALIANA": "MIL",
  "LONDON STOCK EXCHANGE": "LSE",
  "SIX SWISS EXCHANGE": "SIX",
};

function venueOf(detail) {
  const suffix = (detail.tradegateRic || "").split(".")[1] || "";
  if (suffix) return VENUES[suffix] || suffix.toUpperCase();
  const prefix = (detail.tradingViewSymbol || "").split(":")[0] || "";
  return prefix ? VENUES[prefix] || LEGACY_EXCHANGES[prefix.toUpperCase()] || prefix.toUpperCase() : "TRADEGATE";
}

function listingType(detail, kind) {
  const name = detail.name || "";
  if (kind === "ETF" || detail.instrumentType === "ETF") {
    if (/\bETNs?\b/i.test(name)) return "ETN";
    if (/\bETCs?\b/i.test(name)) return "ETC";
    return "ETF";
  }
  return kind || "STOCK";
}

function rowFrom(query, detail, kind) {
  const ticker = normalizeTicker(detail.tickerCode);
  const name = normalize(detail.name);
  const exchange = venueOf(detail);
  const isin = toIsin(detail.isin) || toIsin(query);
  const type = listingType(detail, kind);
  return {
    query,
    ticker: ticker || null,
    name,
    exchange,
    // The account deals every line in euros on Tradegate, whatever the fund
    // reports as its listing currency.
    currency: "EUR",
    type,
    raw: `${ticker} ${name} - ${exchange}`.trim(),
    isin: isin || null,
  };
}

const outputPath = new URL("ig-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

const entryKey = (row) =>
  `${row.isin || ""}:${row.ticker || ""}:${row.exchange || ""}:${row.currency || ""}`.toUpperCase();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    for (const entry of Array.isArray(existing) ? existing : []) {
      if (!entry?.ticker || !entry?.isin) continue;
      if (entry.exchange) {
        entry.exchange = LEGACY_EXCHANGES[normalize(entry.exchange).toUpperCase()] || entry.exchange;
      }
      if (seen.has(entryKey(entry))) continue;
      seen.add(entryKey(entry));
      results.push(entry);
    }
    if (results.length) console.error(`${results.length} listings already saved`);
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

function keepDetail(detail) {
  if (!detail) return false;
  const isin = toIsin(detail.isin);
  const kind = isin ? catalogue.get(isin) : "";
  if (cliIsins.length > 0) {
    if (!cliIsins.includes(isin)) return false;
  } else if (!kind && !keepUnlisted) {
    return false;
  }
  if (kind === "ETF" && !wantEtfs) return false;
  if (kind === "STOCK" && !wantStocks) return false;
  if (!kind && detail.instrumentType === "ETF" && !wantEtfs) return false;
  if (!kind && detail.instrumentType === "STOCK" && !wantStocks) return false;
  return true;
}

function addDetail(detail, query) {
  const isin = toIsin(detail.isin) || toIsin(query);
  const kind = isin ? catalogue.get(isin) : "";
  const row = rowFrom(query || isin, detail, kind);
  if (!row.ticker || !row.isin) return false;
  const key = entryKey(row);
  if (seen.has(key)) return false;
  seen.add(key);
  results.push(row);
  return true;
}

if (cliIsins.length > 0) {
  console.error(`${cliIsins.length} ISINs to check`);
  for (const [index, isin] of cliIsins.entries()) {
    if (index + 1 < startIndex) continue;
    if (walkLimit && index + 1 >= startIndex + walkLimit) break;
    const found = await searchPage(isin, 0);
    const hits = found?.instruments || [];
    const opened = await mapLimit(hits, lanes, (hit) => details(hit.id));
    for (const detail of opened) {
      if (!keepDetail(detail)) continue;
      if ((detail.isin || "").toUpperCase() !== isin) continue;
      addDetail(detail, isin);
    }
    console.error(`  ${index + 1}/${cliIsins.length} ${isin}, ${results.length} listings`);
  }
} else {
  const shelves = [];
  if (wantEtfs && wantStocks) shelves.push({ type: "", label: "instruments" });
  else if (wantEtfs) shelves.push({ type: "ETF", label: "funds" });
  else if (wantStocks) shelves.push({ type: "STOCK", label: "shares" });

  const listed = [];
  const seenIds = new Set();
  for (const shelf of shelves) {
    console.error(`reading IG's ${shelf.label}`);
    for (const instrument of await readCatalogue(shelf.type || undefined)) {
      if (seenIds.has(instrument.id)) continue;
      seenIds.add(instrument.id);
      listed.push(instrument);
    }
  }

  const walk = listed.slice(startIndex - 1, walkLimit > 0 ? startIndex - 1 + walkLimit : undefined);
  console.error(`${walk.length} listings to open`);

  let done = 0;
  let unmatched = 0;
  await mapLimit(walk, lanes, async (instrument) => {
    const detail = await details(instrument.id);
    done += 1;
    if (!detail) {
      unmatched += 1;
    } else if (!keepDetail(detail)) {
      unmatched += 1;
    } else {
      addDetail(detail);
    }
    if (done % 500 === 0) {
      console.error(`  ${done}/${walk.length} opened, ${results.length} listings`);
      save();
    }
  });
  if (unmatched) console.error(`${unmatched} listings with no catalogue match`);
}

save();

const tally = {};
for (const row of results) tally[row.type] = (tally[row.type] || 0) + 1;
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin).filter(Boolean)).size} ISINs ` +
    `(${Object.entries(tally)
      .sort((left, right) => right[1] - left[1])
      .map(([type, count]) => `${count} ${type}`)
      .join(", ")})`
);

await browser.disconnect();
