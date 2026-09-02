import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  // Check digit is always numeric, which keeps catalogue noise like
  // ALSALAMSUDAN from being treated as a security.
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  return firstColumn.includes(":") ? firstColumn.split(":").pop().trim() : firstColumn;
}

// EasyBourse answers an ISIN with the listing it actually quotes, so the CSV
// is only asked for the ticker and the name the lists already agreed on.
function loadByIsin(csvPath, kind, into = new Map()) {
  if (!fs.existsSync(csvPath)) return into;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    const exchange =
      isinIndex >= 2 ? (columns[isinIndex - 1] || "").trim().toUpperCase() : "";
    if (!name) continue;

    const rows = into.get(isin) || [];
    into.set(isin, rows);
    rows.push({ ticker, kind, name, exchange });
  }
  return into;
}

const MARKET_EXCHANGES = new Set([
  "EURONEXT",
  "NASDAQ",
  "NYSE",
  "AMEX",
  "CBOE",
  "XETR",
  "LSE",
  "SIX",
  "MIL",
  "VIE",
  "OMXSTO",
  "OMXHEX",
  "OSL",
  "BME",
]);

// The autocomplete names a place in full; the lists file the same books under
// the venue code the other catalogues already use.
const EXCHANGE_NAMES = {
  "EURONEXT PARIS": "EURONEXT",
  "EURONEXT AMSTERDAM": "EURONEXT",
  "EURONEXT AMSTERDAM - MULTI-CURRENCY": "EURONEXT",
  "EURONEXT BRUSSELS": "EURONEXT",
  "EURONEXT LISBON": "EURONEXT",
  "EURONEXT DUBLIN": "EURONEXT",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  "NYSE AMERICAN": "AMEX",
  "NYSE ARCA": "AMEX",
  AMEX: "AMEX",
  XETRA: "XETR",
  "DEUTSCHE BÖRSE": "XETR",
  LSE: "LSE",
  "LONDON STOCK EXCHANGE": "LSE",
  SIX: "SIX",
  "SIX SWISS EXCHANGE": "SIX",
  MILAN: "MIL",
  "BORSA ITALIANA": "MIL",
  VIENNA: "VIE",
  "WIENER BORSE": "VIE",
  STOCKHOLM: "OMXSTO",
  "NASDAQ STOCKHOLM": "OMXSTO",
  HELSINKI: "OMXHEX",
  "NASDAQ HELSINKI": "OMXHEX",
  OSLO: "OSL",
  "OSLO BORS": "OSL",
  "EURONEXT OSLO": "OSL",
  MADRID: "BME",
  "BOLSA DE MADRID": "BME",
  BME: "BME",
  CBOE: "CBOE",
  BATS: "CBOE",
  "CBOE BZX": "CBOE",
};

function mapExchange(market) {
  const text = String(market || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!text || text === "OPCVM") return "";
  if (EXCHANGE_NAMES[text]) return EXCHANGE_NAMES[text];
  if (text.startsWith("EURONEXT")) return "EURONEXT";
  if (text.includes("NASDAQ")) return "NASDAQ";
  if (text.includes("NYSE") && text.includes("ARCA")) return "AMEX";
  if (text.includes("NYSE")) return "NYSE";
  if (text.includes("XETRA")) return "XETR";
  if (text.includes("STOCKHOLM")) return "OMXSTO";
  if (text.includes("HELSINKI")) return "OMXHEX";
  if (text.includes("OSLO")) return "OSL";
  if (text.includes("MADRID") || text === "BME") return "BME";
  if (text.includes("CBOE") || text.includes("BATS")) return "CBOE";
  return "";
}

const KEEP_TYPES = { Tracker: "ETF", Action: "STOCK" };

function tickerFor(rows, csvExchange, kind) {
  const pool = (rows || []).filter((row) => !kind || row.kind === kind);
  const onVenue = csvExchange
    ? pool.filter((row) => row.exchange === csvExchange)
    : [];
  return (onVenue[0] || pool[0] || {}).ticker || "";
}

function tickerFallback(label, isin) {
  const text = String(label || "").trim();
  const cut = text.split(" - ").pop();
  if (cut && cut !== text && /^[A-Z0-9.]{1,12}$/i.test(cut)) return cut.toUpperCase();
  return isin;
}

function nameFor(rows, csvExchange, kind, fallback) {
  const pool = (rows || []).filter((row) => !kind || row.kind === kind);
  const onVenue = csvExchange
    ? pool.filter((row) => row.exchange === csvExchange)
    : [];
  return (onVenue[0] || pool[0] || {}).name || fallback;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /easybourse\.com/i.test(candidate.url())) ||
  (await browser.newPage());
await page.bringToFront().catch(() => {});

if (!/easybourse\.com/i.test(page.url())) {
  await page.goto("https://www.easybourse.com/trackers/", { waitUntil: "domcontentloaded" });
}

const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

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

// `--csv=PATH` the fund list (defaults to etfs.csv) and `--stocks-csv=PATH`
// the share list (defaults to stocks.csv). EasyBourse is a French book: UCITS
// trackers and shares on Euronext, plus the American names the order ticket
// will accept. There is no spot crypto and no US-residents-only flag.
// `--funds-only` / `--etfs-only` answer for the trackers alone; `--stocks-only`
// for the shares.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");

const byIsin = new Map();
if (!stocksOnly) loadByIsin(csvPath, "ETF", byIsin);
if (!fundsOnly) loadByIsin(stocksCsvPath, "STOCK", byIsin);

const AUTOCOMPLETE = "https://www.easybourse.com/rest?method=getSearchAutocomplete&keywords=";
const QUOTE_URL = "https://www.easybourse.com/rest/?redirecttostream=true";
const ETF_SEARCH =
  "https://www.easybourse.com/trackers/recherche/etf/?ordre=1&dir=1&action=1&typeTracker=etf&page=";
const CONCURRENCY = 2;
const QUOTE_BATCH = 20;

let cookieHeader = "";
async function refreshCookies() {
  const cookies = await page.cookies("https://www.easybourse.com");
  cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
await refreshCookies();

function raceTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

async function fetchText(url, options = {}, timeoutMs = 8000) {
  const run = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Cookie: cookieHeader,
          Referer: "https://www.easybourse.com/",
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) return "";
      return await response.text();
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  };
  return raceTimeout(run(), timeoutMs + 2000, "");
}

async function autocomplete(isin) {
  const body = await fetchText(`${AUTOCOMPLETE}${encodeURIComponent(isin)}`, {
    headers: { Accept: "application/json, text/javascript, */*" },
  });
  if (!body) return { status: 0, hits: [] };
  try {
    const payload = JSON.parse(body);
    const hits = Object.values(payload).filter(
      (row) => row && typeof row === "object" && row.isin
    );
    return { status: 200, hits };
  } catch {
    return { status: 0, hits: [] };
  }
}

async function autocompleteWithRetry(isin) {
  let answer = await autocomplete(isin);
  for (let attempt = 0; attempt < 2 && answer.status !== 200; attempt++) {
    await refreshCookies();
    await sleep(400);
    answer = await autocomplete(isin);
  }
  return answer;
}

async function quoteMany(ids) {
  if (ids.length === 0) return new Map();
  const body = `method=getInstrumentValueInfo&${ids
    .map((id) => `data[]=${encodeURIComponent(id)}`)
    .join("&")}&token=${Math.random()}`;
  const xml = await fetchText(
    QUOTE_URL,
    {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
    12000
  );

  const units = new Map();
  for (const block of xml.split(/<(?=[A-Z]{2}[A-Z0-9]{10}-\d+)/).slice(1)) {
    const id = (block.match(/^([A-Z]{2}[A-Z0-9]{10}-\d+)/) || [])[1];
    const unit =
      (block.match(/cours_dernier[^>]*unit="([A-Z]+)"/) || [])[1] ||
      (block.match(/cours_dernier_connu[^>]*unit="([A-Z]+)"/) || [])[1] ||
      (block.match(/cours_veille[^>]*unit="([A-Z]+)"/) || [])[1] ||
      "";
    if (id && unit && unit !== "PCT" && unit !== "PTS") units.set(id, unit);
  }
  return units;
}

// The public tracker directory is the fund book they actually sell: a thousand
// rows instead of asking autocomplete about every UCITS line in the CSV. Each
// ISIN is still sent through search afterwards, because Paris and Amsterdam
// (and the dollar book) are separate tickets for the same fund.
async function crawlTrackerIsins() {
  const isins = new Set();
  let lastPage = 1;
  for (let n = 1; n <= lastPage; n++) {
    const html = await fetchText(`${ETF_SEARCH}${n}`, {}, 12000);
    if (!html) {
      console.error(`  ETF page ${n} failed`);
      continue;
    }
    if (n === 1) {
      const nums = [...html.matchAll(/submitSearch\((\d+)\)/g)].map((m) => +m[1]);
      lastPage = Math.max(1, ...nums);
      console.error(`ETF directory: ${lastPage} pages`);
    }
    for (const match of html.matchAll(/prodid="([A-Z]{2}[A-Z0-9]{9}\d)-\d+"/g)) {
      isins.add(match[1]);
    }
    if (n % 20 === 0 || n === lastPage) {
      console.error(`  crawled ${n}/${lastPage}, ${isins.size} tracker ISINs`);
    }
  }
  return [...isins];
}

function wantedHits(isin, hits) {
  const out = [];
  for (const hit of hits) {
    if (toIsin(hit.isin) !== isin) continue;
    if (String(hit.status) === "0") continue;
    const type = KEEP_TYPES[hit.type];
    if (!type) continue;
    if (fundsOnly && type !== "ETF") continue;
    if (stocksOnly && type !== "STOCK") continue;
    const exchange = mapExchange(hit.market);
    if (!exchange) continue;
    out.push({
      id: hit.id,
      type,
      exchange,
      market: String(hit.market || "").replace(/\s+/g, " ").trim(),
      label: String(hit.label || "").replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

const csvIsins = [...byIsin.entries()]
  .filter(([, rows]) =>
    rows.some((row) => !row.exchange || MARKET_EXCHANGES.has(row.exchange))
  )
  .map(([isin]) => isin);

const cliQueries = positionalArgs.map(toIsin).filter(Boolean);

const outputPath = new URL("easybourse-parsed.json", import.meta.url);
const statePath = new URL("easybourse-state.json", import.meta.url);

function loadJson(fileUrl) {
  if (!fs.existsSync(fileUrl)) return null;
  try {
    return JSON.parse(fs.readFileSync(fileUrl, "utf8"));
  } catch {
    return null;
  }
}

const priorState = cliQueries.length > 0 ? null : loadJson(statePath);

let queries = [];
if (cliQueries.length > 0) {
  queries = [...new Set(cliQueries)];
} else if (Array.isArray(priorState?.queries) && priorState.queries.length > 0) {
  queries = priorState.queries;
  console.error(`Resuming ${queries.length} ISINs from prior run`);
} else {
  const stockQueries = stocksOnly
    ? csvIsins
    : csvIsins.filter((isin) => (byIsin.get(isin) || []).some((row) => row.kind === "STOCK"));
  let etfQueries = [];
  if (!stocksOnly) {
    const crawled = await crawlTrackerIsins();
    etfQueries = crawled.filter((isin) => (byIsin.get(isin) || []).some((row) => row.kind === "ETF"));
    console.error(`${etfQueries.length} directory trackers also on the fund list`);
  }
  queries = [...new Set(fundsOnly ? etfQueries : [...etfQueries, ...stockQueries])];
}

const results = [];
const seen = new Set();
const lookedUp = new Set();
const entryKey = (query, ticker, exchange, currency) =>
  `${query}:${ticker}:${exchange}:${currency || ""}`.toUpperCase();

const existing = loadJson(outputPath);
if (Array.isArray(existing)) {
  for (const entry of existing) {
    results.push(entry);
    if (entry?.query && entry?.ticker) {
      seen.add(entryKey(entry.query, entry.ticker, entry.exchange, entry.currency));
    }
    if (entry?.query) lookedUp.add(String(entry.query).toUpperCase());
  }
}

const listings = Array.isArray(priorState?.listings) ? priorState.listings : [];
if (Array.isArray(priorState?.lookedUp)) {
  for (const isin of priorState.lookedUp) lookedUp.add(String(isin).toUpperCase());
}

if (startIndex > 1) {
  for (const isin of queries.slice(0, startIndex - 1)) lookedUp.add(isin);
}

function saveState() {
  fs.writeFileSync(
    statePath,
    JSON.stringify({ queries, lookedUp: [...lookedUp], listings }, null, 2)
  );
}

function saveResults() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

async function quoteFrom(offset) {
  for (let i = offset; i < listings.length; i += QUOTE_BATCH) {
    const batch = listings.slice(i, i + QUOTE_BATCH);
    let units = await quoteMany(batch.map((row) => row.id));
    if (units.size === 0 && batch.length > 0) {
      await sleep(400);
      units = await quoteMany(batch.map((row) => row.id));
    }

    for (const row of batch) {
      const csvExchange = row.exchange;
      const ticker =
        tickerFor(byIsin.get(row.isin), csvExchange, row.type) ||
        tickerFallback(row.label, row.isin);
      const name = nameFor(byIsin.get(row.isin), csvExchange, row.type, row.label);
      const currency =
        units.get(row.id) ||
        (csvExchange === "NASDAQ" || csvExchange === "NYSE" || csvExchange === "AMEX"
          ? "USD"
          : "EUR");

      const key = entryKey(row.isin, ticker, csvExchange, currency);
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        query: row.isin,
        ticker,
        name,
        exchange: csvExchange,
        currency,
        type: row.type,
        raw: [row.label, row.id, row.market].filter(Boolean).join(" "),
        isin: row.isin,
      });
    }
  }
  saveResults();
  return listings.length;
}

const pending = queries.filter((isin) => !lookedUp.has(isin));
console.error(`${pending.length} ISINs to look up (${lookedUp.size} already done)`);

const skipped = new Map();
const bump = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);

let quotedThrough = 0;
if (listings.length > 0) quotedThrough = await quoteFrom(quotedThrough);

for (let offset = 0; offset < pending.length; offset += CONCURRENCY) {
  const batch = pending.slice(offset, offset + CONCURRENCY);
  const answers = await Promise.all(batch.map((isin) => autocompleteWithRetry(isin)));

  for (const [index, isin] of batch.entries()) {
    lookedUp.add(isin);
    const answer = answers[index];
    if (answer.status !== 200) {
      bump("search failed");
      console.error(`  ${isin}: search failed`);
      continue;
    }
    const hits = wantedHits(isin, answer.hits);
    if (hits.length === 0) {
      bump("not listed");
      continue;
    }
    for (const hit of hits) listings.push({ isin, ...hit });
  }

  if (offset > 0 && offset % 400 === 0) await refreshCookies();

  const done = offset + batch.length;
  if (done <= 20 || done % 50 < CONCURRENCY || done >= pending.length) {
    console.error(`  looked up ${done}/${pending.length}, ${listings.length} listings`);
  }
  if (done % 50 < CONCURRENCY) {
    saveState();
    quotedThrough = await quoteFrom(quotedThrough);
  }
}

saveState();
quotedThrough = await quoteFrom(quotedThrough);
console.error(`${listings.length} tradable listings quoted`);

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
if (fs.existsSync(statePath)) fs.unlinkSync(statePath);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
for (const [reason, count] of [...skipped].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(count).padStart(5)} ${reason}`);
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
