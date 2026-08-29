import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => {
      // Supports both: ticker,isin,name and ticker,exchange,isin,name.
      const columns = line.split(",");
      const fromKnownColumns = toIsin(columns[2]) || toIsin(columns[1]);
      if (fromKnownColumns) return fromKnownColumns;

      for (const column of columns) {
        const isin = toIsin(column);
        if (isin) return isin;
      }
      return "";
    })
    .filter(Boolean);
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

const clean = (value) => (value || "").replace(/\s+/g, " ").trim();

// Runs several calls at once while keeping a ceiling on how many are in flight.
// IG served 80 details a second without complaint; this stays well under that.
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

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to ig-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);
const csvQueries = loadIsinsFromCsv(csvPath);
const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const queries = uniqueQueries(
  cliQueries.length > 0 ? cliQueries : csvQueries.length > 0 ? csvQueries : defaultQueries
);

// The gateway behind deal.ig.com. It answers the same calls the web platform
// makes for itself, so nothing here asks for more than the screen already shows.
const API = "https://api.ig.com/eu-investments-api-gateway";
const CONCURRENCY = 12;
const PAGE_SIZE = 100;

// The catalogue is filtered to funds. IG's European share dealing lists shares
// under a second type, but no ETC or ETN at all, so an ETF list has nothing to
// find outside this one.
const ETF_FILTER = {
  instrumentType: "ETF",
  country: { values: [] },
  dividendTreatment: { values: [] },
  provider: { values: [] },
  sector: { values: [] },
};

// The dealing token rotates while the platform is open, so it is read from the
// browser rather than copied once, and read again whenever a call is refused.
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

    // An instrument this account cannot see, rather than a broken call.
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

    if (attempt === tries) {
      throw new Error(`IG answered ${response.status} to ${path}`);
    }
    await sleep(400 * attempt);
  }
  return null;
}

const searchPage = (query, pageNumber, pageSize, filters) =>
  api("/instruments/search", {
    query,
    pageNumber,
    pageSize,
    ...(filters ? { filters } : {}),
  });

const details = (instrumentId) => api(`/instruments/${instrumentId}/details`);

// The only place the dealing currency is written down. It doubles as the answer
// to whether the listing is quoted at all.
const priceCache = new Map();
async function price(instrumentId) {
  if (!priceCache.has(instrumentId)) priceCache.set(instrumentId, api(`/prices/${instrumentId}`));
  return priceCache.get(instrumentId);
}

// Every fund IG offers, in `PAGE_SIZE` chunks. The search sorts by name, so
// paging it is stable, and ids are deduplicated in case a page boundary shifts
// under us mid-read.
async function readCatalogue() {
  const first = await searchPage("", 0, PAGE_SIZE, ETF_FILTER);
  const total = first?.meta?.totalResults ?? 0;
  const pageCount = first?.meta?.totalPages ?? 0;
  if (!total) {
    throw new Error("IG handed over an empty catalogue. Is the session still signed in?");
  }

  const byId = new Map();
  for (const instrument of first.instruments || []) byId.set(instrument.id, instrument);

  const rest = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 1);
  await mapLimit(rest, CONCURRENCY, async (pageNumber) => {
    const result = await searchPage("", pageNumber, PAGE_SIZE, ETF_FILTER);
    for (const instrument of result?.instruments || []) byId.set(instrument.id, instrument);
  });

  if (byId.size < total) {
    console.error(`  warning: ${total} funds listed but only ${byId.size} came back`);
  }
  return [...byId.values()];
}

// IG deals its European share dealing accounts on one venue, and says which by
// coding it into the instrument's RIC. The name is spelled out where it is
// known and passed through as it comes where it is not, rather than guessing a MIC.
const VENUES = {
  TG: "Tradegate",
  DE: "Xetra",
  PA: "Euronext Paris",
  AS: "Euronext Amsterdam",
  BR: "Euronext Brussels",
  MI: "Borsa Italiana",
  MC: "BME",
  L: "London Stock Exchange",
  S: "SIX Swiss Exchange",
};

function venueOf(detail) {
  const suffix = (detail.tradegateRic || "").split(".")[1] || "";
  if (suffix) return VENUES[suffix] || suffix;
  const prefix = (detail.tradingViewSymbol || "").split(":")[0] || "";
  return prefix ? VENUES[prefix] || clean(prefix) : null;
}

function rowFrom(query, detail, quote) {
  const ticker = (detail.tickerCode || "").toUpperCase();
  const name = clean(detail.name);
  const exchange = venueOf(detail);
  return {
    query,
    isin: (detail.isin || query).toUpperCase(),
    ticker: ticker || null,
    name,
    // The venue's own code for the line, which is not always IG's ticker: IG
    // files iShares Core MSCI World under SWDA, Tradegate quotes it as EUNL.
    symbol: (detail.tradegateRic || "").split(".")[0] || null,
    exchange,
    // What the account actually deals in. Every line here is bought in euros
    // because that is what the venue quotes, whatever the fund is priced in.
    currency: quote?.currency || null,
    // IG's own figure for the listing it quotes fund statistics from, which is
    // a different thing from the currency above: a world tracker dealt in euros
    // is still reported against its dollar or sterling line.
    listingCurrency: detail.listingCurrency || null,
    type: detail.instrumentType || "ETF",
    distribution: detail.dividendTreatment || null,
    instrumentId: detail.instrumentId || null,
    raw: [ticker, name, exchange, quote?.currency].filter(Boolean).join(" "),
  };
}

const outputPath = new URL("ig-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

// One ISIN can be listed more than once, so what tells two rows apart is the
// line, not the fund.
const entryKey = (row) =>
  `${row.isin}:${row.ticker}:${row.exchange || ""}:${row.currency || ""}`.toUpperCase();

// When resuming, load already-saved entries so earlier progress is preserved.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin) seen.add(entryKey(entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

// A search answers one ISIN per round trip, so a long list is cheaper to answer
// by reading the whole catalogue once and matching it here. Below that, asking
// for the few funds wanted beats reading the couple of thousand on offer.
const pending = queries.slice(startIndex - 1);
const useCatalogue = pending.length >= 300;

let byIsin = null;

if (useCatalogue) {
  console.error("reading IG's fund list");
  const catalogue = await readCatalogue();

  // The list itself carries no ISIN, so each line has to be opened to learn
  // which fund it is. This is the slow part of a run, and the only one.
  console.error(`${catalogue.length} funds listed, reading what each one is`);
  let done = 0;
  const detailed = await mapLimit(catalogue, CONCURRENCY, async (instrument) => {
    const detail = await details(instrument.id);
    done += 1;
    if (done % 500 === 0) console.error(`  ${done}/${catalogue.length}`);
    return detail;
  });

  byIsin = new Map();
  let nameless = 0;
  for (const detail of detailed) {
    const isin = (detail?.isin || "").toUpperCase();
    if (!isin) {
      nameless += 1;
      continue;
    }
    if (!byIsin.has(isin)) byIsin.set(isin, []);
    byIsin.get(isin).push(detail);
  }
  console.error(
    `${byIsin.size} ISINs on offer${nameless ? `, ${nameless} listings without one` : ""}`
  );
}

console.error(`${queries.length} ISINs to check`);

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  let matches;
  if (useCatalogue) {
    matches = byIsin.get(query) || [];
  } else {
    // Searching by ISIN is not the same as asking for one: IG matches loosely
    // and will answer a near neighbour, so every hit is opened and only the
    // ones carrying the ISIN we asked for are kept.
    const found = await searchPage(query, 0, 20);
    const hits = found?.instruments || [];
    const opened = await mapLimit(hits, CONCURRENCY, (hit) => details(hit.id));
    matches = opened.filter((detail) => (detail?.isin || "").toUpperCase() === query);
  }

  if (matches.length === 0) continue;

  const quotes = await mapLimit(matches, CONCURRENCY, (detail) =>
    price(detail.instrumentId).catch(() => null)
  );

  for (const [index, detail] of matches.entries()) {
    const row = rowFrom(query, detail, quotes[index]);
    const key = entryKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(row);
  }

  if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
}

save();
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
