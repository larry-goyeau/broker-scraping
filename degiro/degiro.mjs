import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function normalize(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeTicker(value) {
  return normalize(value).toUpperCase();
}

// Supports both: ticker,isin,name and ticker,exchange,isin,name. Crypto rows
// often have no ISIN, so the ticker is remembered as well.
function loadCsv(csvPath, kind, index = { byIsin: new Map(), byTicker: new Map() }) {
  if (!fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0].includes(":") ? columns[0].split(":").pop() : columns[0]);
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean) || "";
    if (isin && !index.byIsin.has(isin)) index.byIsin.set(isin, kind);
    if (ticker && !index.byTicker.has(ticker)) index.byTicker.set(ticker, kind);
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

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const fresh = hasFlag("fresh");
const keepUnlisted = hasFlag("all");

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliIsins = new Set(positionalArgs.map(toIsin).filter(Boolean));

// Funds are read first so an ISIN both catalogues happen to carry is remembered
// as the fund it is. Crypto sits in its own file.
const catalogue = { byIsin: new Map(), byTicker: new Map() };
const cryptoTickers = new Set();
const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;
if (wantEtfs) loadCsv(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadCsv(stocksCsvPath, "STOCK", catalogue);
if (wantCrypto) {
  loadCsv(cryptosCsvPath, "CRYPTO", catalogue);
  // Coin tickers collide with share tickers (BTC, ETH), so crypto is matched
  // against this list rather than the combined map.
  if (fs.existsSync(cryptosCsvPath)) {
    for (const line of fs.readFileSync(cryptosCsvPath, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const ticker = normalizeTicker(line.split(",")[0]);
      if (ticker) cryptoTickers.add(ticker);
    }
  }
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

async function degiroPage() {
  const pages = await browser.pages();
  const found =
    pages.find((candidate) => /degiro\./i.test(candidate.url())) || (await browser.newPage());

  if (!/degiro\./i.test(found.url())) {
    await found.goto("https://trader.degiro.nl/trader/#/markets", { waitUntil: "domcontentloaded" });
    await sleep(5000);
  }
  return found;
}
let page = await degiroPage();

async function inPage(fn, ...args) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (error) {
      if (attempt >= 3) throw error;
      console.error(`  retrying: ${normalize(String(error?.message)).slice(0, 90)}`);
      await sleep(2000 * attempt);
      page = await degiroPage();
    }
  }
}

// Every call the trader makes carries the session and the account number in
// plain sight, so they are read back off its own traffic rather than guessed.
async function readSession() {
  return inPage(() => {
    const found = {};
    for (const entry of performance.getEntriesByType("resource")) {
      try {
        const query = new URL(entry.name).searchParams;
        if (query.get("sessionId")) found.sessionId = query.get("sessionId");
        if (query.get("intAccount")) found.intAccount = query.get("intAccount");
      } catch {
        // Ignore malformed performance entries.
      }
    }
    return found;
  });
}

let session = await readSession();
if (!session.sessionId || !session.intAccount) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(6000);
  session = await readSession();
}
if (!session.sessionId || !session.intAccount) {
  throw new Error("Could not read the DeGiro session. Is the trader signed in?");
}

function tail() {
  return `intAccount=${session.intAccount}&sessionId=${session.sessionId}`;
}

async function api(path) {
  const answer = await inPage(async (url) => {
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    try {
      return { status: response.status, json: JSON.parse(text) };
    } catch {
      return { status: response.status, error: text.slice(0, 160) };
    }
  }, path);

  if (answer.status === 401 || answer.status === 403) {
    session = await readSession();
    throw new Error(`DeGiro session expired (${answer.status})`);
  }
  if (answer.status !== 200) {
    throw new Error(`DeGiro answered ${answer.status} for ${path.split("?")[0]}`);
  }
  return answer.json;
}

async function apiRetry(path) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await api(path);
    } catch (error) {
      if (attempt >= 3) throw error;
      console.error(`  retrying: ${normalize(String(error?.message)).slice(0, 90)}`);
      await sleep(2000 * attempt);
      page = await degiroPage();
      session = await readSession();
    }
  }
}

// Products name their venue by number; the dictionary turns that into the
// short code the trader shows in its own product table. Stock countries are
// needed because an unfiltered stock search is capped at 10,000 rows.
async function loadDictionary() {
  const payload = await apiRetry(`/productsearch/secure/v1/config/dictionary?${tail()}`);
  const exchanges = new Map();
  for (const row of payload?.exchanges || []) {
    exchanges.set(String(row.id), (row.hiqAbbr || row.name || "").toUpperCase());
  }
  const stockCountries = (payload?.stockCountries || []).map((row) => Number(row.country));
  return { exchanges, stockCountries };
}

// The tracker search accepts a thousand rows; the stock search rejects anything
// above a hundred.
const PAGE_SIZE = { etfs: 1000, funds: 1000, stocks: 100, crypto: 100 };

async function loadPaged(label, buildPath, pageSize = 1000) {
  const products = [];
  for (let offset = 0; offset < 500000; offset += pageSize) {
    const payload = await apiRetry(buildPath(offset, pageSize));
    const batch = payload?.products || [];
    products.push(...batch);
    const total = payload?.total ?? products.length;
    console.error(`  ${label} ${products.length}/${total}`);
    if (batch.length < PAGE_SIZE || products.length >= total) break;
  }
  return products;
}

// Trackers and funds live on the v5 search. Stocks and crypto live on
// the older productsearch service; stocks have to be asked for one country at
// a time or the answer is truncated.
async function loadShelf(exchanges, stockCountries) {
  const products = [];

  if (wantEtfs) {
    console.error("ETFs");
    products.push(
      ...(await loadPaged(
        "etfs",
        (offset, limit) =>
          `/product_search/secure/v5/etfs?popularOnly=false&inputAggregateTypes=&inputAggregateValues=` +
          `&searchText=&offset=${offset}&limit=${limit}&requireTotal=true` +
          `&sortColumns=name&sortTypes=asc&${tail()}`,
        PAGE_SIZE.etfs
      ))
    );
  }

  if (wantStocks) {
    console.error("stocks");
    const countries = stockCountries.length > 0 ? stockCountries : [null];
    for (const country of countries) {
      const filter = country == null ? "" : `&stockCountryId=${country}`;
      products.push(
        ...(await loadPaged(
          `stocks ${country ?? "all"}`,
          (offset, limit) =>
            `/productsearch/secure/v1/stocks?offset=${offset}&limit=${limit}&requireTotal=true` +
            `&sortColumns=name&sortTypes=asc${filter}&${tail()}`,
          PAGE_SIZE.stocks
        ))
      );
    }
  }

  if (wantEtfs) {
    console.error("funds");
    products.push(
      ...(await loadPaged(
        "funds",
        (offset, limit) =>
          `/product_search/secure/v5/funds?popularOnly=false&inputAggregateTypes=&inputAggregateValues=` +
          `&searchText=&offset=${offset}&limit=${limit}&requireTotal=true` +
          `&sortColumns=name&sortTypes=asc&${tail()}`,
        PAGE_SIZE.funds
      ))
    );
  }

  if (wantCrypto) {
    console.error("crypto");
    products.push(
      ...(await loadPaged(
        "crypto",
        (offset, limit) =>
          `/productsearch/secure/v1/crypto?offset=${offset}&limit=${limit}&requireTotal=true&${tail()}`,
        PAGE_SIZE.crypto
      ))
    );
  }

  return products;
}

// What DeGiro calls a tracker shelf is ETF, ETC and ETN together. 1 is a
// fund, 3 a commodity ETC, 4 an ETN. 2 is a mixed ETP bucket that also holds
// ordinary UCITS trackers, so it is left as ETF.
const ETP_TYPES = { 1: "ETF", 3: "ETC", 4: "ETN" };

const PRODUCT_TYPES = {
  STOCK: "STOCK",
  ETF: "ETF",
  FUND: "FUND",
  CRYPTO: "CRYPTO",
};

function listingType(product, kind) {
  if (kind) {
    if (kind === "ETF") return ETP_TYPES[product.etpType] || "ETF";
    return kind;
  }
  const shelf = String(product.productType || "").toUpperCase();
  if (shelf === "ETF") return ETP_TYPES[product.etpType] || "ETF";
  return PRODUCT_TYPES[shelf] || shelf || "STOCK";
}

function catalogueKind(product, isin, ticker) {
  const shelf = String(product.productType || "").toUpperCase();
  if (shelf === "CRYPTO") {
    const known = cryptoTickers.has(ticker) || catalogue.byIsin.get(isin) === "CRYPTO";
    if (cliIsins.size > 0) return cliIsins.has(isin) ? (known ? "CRYPTO" : "") : null;
    if (known) return "CRYPTO";
    return keepUnlisted ? "CRYPTO" : null;
  }

  if (cliIsins.size > 0) {
    if (cliIsins.has(isin)) return catalogue.byIsin.get(isin) || "";
    return null;
  }
  const kind = isin ? catalogue.byIsin.get(isin) : "";
  if (kind) return kind;
  return keepUnlisted ? "" : null;
}

const { exchanges, stockCountries } = await loadDictionary();
console.error(`${exchanges.size} exchanges named, ${catalogue.byIsin.size} ISINs in the catalogues`);

const shelf = await loadShelf(exchanges, stockCountries);

const outputPath = new URL("degiro-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

function entryKey(row) {
  return `${row.exchange}:${row.ticker}:${row.isin}`.toUpperCase();
}

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    for (const entry of Array.isArray(existing) ? existing : []) {
      if (!entry?.isin || !entry?.ticker || entry.type === "BND") continue;
      if (seen.has(entryKey(entry))) continue;
      seen.add(entryKey(entry));
      results.push(entry);
    }
    console.error(`${results.length} listings already saved`);
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

let untradable = 0;
let absent = 0;

for (const product of shelf) {
  if (String(product.productType || "").toUpperCase() === "BOND") continue;
  const isin = toIsin(product?.isin);
  if (!isin) continue;

  const ticker = normalizeTicker(product.symbol) || isin;
  const kind = catalogueKind(product, isin, ticker);
  if (kind === null) {
    absent += 1;
    continue;
  }

  if (!product.tradable || !product.active) {
    untradable += 1;
    continue;
  }

  const exchange = exchanges.get(String(product.exchangeId)) || String(product.exchangeId);
  const name = normalize(product.name);
  if (!name) continue;

  const row = {
    query: isin,
    name,
    ticker,
    exchange,
    currency: product.currency || null,
    type: listingType(product, kind),
    isin,
  };

  if (seen.has(entryKey(row))) continue;
  seen.add(entryKey(row));
  results.push(row);
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = {};
for (const row of results) byType[row.type] = (byType[row.type] || 0) + 1;
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} ISINs ` +
    `(${Object.entries(byType)
      .map(([type, count]) => `${count} ${type}`)
      .join(", ")}), ${untradable} not tradable, ${absent} the catalogues do not carry`
);

await browser.disconnect();
