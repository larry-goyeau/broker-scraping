import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  // Swissquote's digital-asset book uses synthetic codes (EX0X00XBT000), not ISINs.
  if (/^(EX0X|CCX|XC[X0])/i.test(text)) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").replace(/[\s/^]+/g, ".").trim();
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

function loadByIsin(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin) continue;
    const name = normalize(columns.slice(3).join(","));
    const exchange = normalize(columns[1]).toUpperCase();
    const entry = index.get(isin);
    if (!entry) {
      index.set(isin, {
        isin,
        kind,
        names: name ? [name] : [],
        exchange,
        exchanges: new Set(exchange ? [exchange] : []),
      });
    } else {
      if (exchange) entry.exchanges.add(exchange);
      if (name && !entry.names.includes(name)) entry.names.push(name);
    }
  }
  return index;
}

function loadCryptoTickers(csvPath) {
  const tickers = new Set();
  if (!csvPath || !fs.existsSync(csvPath)) return tickers;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const ticker = normalizeTicker(line.split(",")[0]);
    if (ticker) tickers.add(ticker);
  }
  return tickers;
}

const EXCHANGES = {
  "NASDAQ NATIONAL MARKET": "NASDAQ",
  "NASDAQ CAPITAL MARKET": "NASDAQ",
  "NASDAQ GLOBAL MARKET": "NASDAQ",
  "NASDAQ GLOBAL SELECT": "NASDAQ",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  "NYSE ARCA": "AMEX",
  "NYSE AMERICAN": "AMEX",
  "NYSE MKT": "AMEX",
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  OTC: "OTC",
  SIX: "SIX",
  "SIX SWISS EXCHANGE": "SIX",
  XETRA: "XETR",
  FRANKFURT: "FWB",
  LSE: "LSE",
  "LONDON STOCK EXCHANGE": "LSE",
  MILAN: "MIL",
  "BORSA ITALIANA": "MIL",
  PARIS: "XPAR",
  "EURONEXT PARIS": "XPAR",
  AMSTERDAM: "XAMS",
  "EURONEXT AMSTERDAM": "XAMS",
  BRUSSELS: "XBRU",
  "EURONEXT BRUSSELS": "XBRU",
  LISBON: "XLIS",
  "EURONEXT LISBON": "XLIS",
  TRADEGATE: "TRADEGATE",
  "TOKYO SE": "TSE",
  TOKYO: "TSE",
  "HONG KONG": "HKEX",
  HKEX: "HKEX",
  ASX: "ASX",
  TSX: "TSX",
  TORONTO: "TSX",
  "TSX VENTURE": "TSXV",
  COPENHAGEN: "XCSE",
  STOCKHOLM: "XSTO",
  HELSINKI: "XHEL",
  OSLO: "OSL",
  MADRID: "BME",
  VIENNA: "VIE",
  WARSAW: "GPW",
  PRAGUE: "PSECZ",
  MUNCHEN: "MUN",
  MUNICH: "MUN",
  DUSSELDORF: "DUS",
  HAMBURG: "HAM",
  STUTTGART: "SWB",
  BERLIN: "BER",
  HANNOVER: "HAN",
  GETTEX: "GETTEX",
  SINGAPORE: "SGX",
  SGX: "SGX",
  "DIGITAL ASSET MARKET": "CRYPTO",
};

const US_VENUES = ["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"];

// Swissquote Bank Europe: EEA retail cannot buy packaged products whose
// manufacturer is outside the EEA (no PRIIPs KID). Shares stay open. The
// scanner does not mark this, so domicile is the ISIN country. XS is the
// international note prefix those ETC/ETN issuers already use with a KID.
const EEA_ISIN = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR",
  "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT",
  "RO", "SE", "SI", "SK", "XS",
]);

function nonEuResident(type, isin) {
  if (type !== "ETF" && type !== "ETC" && type !== "ETN") return false;
  const country = String(isin || "").slice(0, 2).toUpperCase();
  return Boolean(country) && !EEA_ISIN.has(country);
}

function listingType(item) {
  const kind = String(item.type || "").toUpperCase();
  const name = normalize(item.name || item.companyName);
  if (kind === "CRYPTOCURRENCY") return "CRYPTO";
  if (kind !== "SHARE" && kind !== "ETF") return "";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  const withoutParens = name.replace(/\([^)]*\)/g, " ");
  if (/\bETCs?\b/i.test(withoutParens) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) {
    return "ETC";
  }
  if (kind === "ETF" || item.fundType === "ETF" || /\bETFs?\b|\bUCITS\b/i.test(name)) return "ETF";
  return "STOCK";
}

function venueOf(item, match) {
  if (String(item.type || "").toUpperCase() === "CRYPTOCURRENCY") return "CRYPTO";
  const market = normalize(item.market).toUpperCase();
  if (EXCHANGES[market]) return EXCHANGES[market];
  if (market.includes("NASDAQ")) return "NASDAQ";
  if (market.includes("NYSE ARCA") || market.includes("ARCA")) return "AMEX";
  if (market.includes("NYSE")) return "NYSE";
  if (market.includes("XETRA")) return "XETR";
  if (market.includes("EURONEXT")) {
    if (market.includes("PARIS")) return "XPAR";
    if (market.includes("AMSTERDAM")) return "XAMS";
    if (market.includes("BRUSSELS")) return "XBRU";
    if (market.includes("LISBON")) return "XLIS";
    if (market.includes("MILAN") || market.includes("ITALIA")) return "MIL";
    return "EURONEXT";
  }
  if (match?.exchanges) {
    const currency = normalize(item.stockKey?.currency).toUpperCase();
    if (currency === "USD") {
      for (const code of US_VENUES) {
        if (match.exchanges.has(code)) return code;
      }
    }
    if (match.exchange) return match.exchange;
  }
  return market.replace(/[^A-Z0-9]/g, "") || "";
}

function currencyOf(item) {
  const code = normalize(item.stockKey?.currency || item.currency).toUpperCase();
  if (code === "GBX" || code === "GBp") return "GBP";
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

function flattenHits(payload) {
  const rows = [];
  for (const item of payload?.securities || []) {
    rows.push(item);
    for (const child of item.children || []) rows.push(child);
  }
  return rows;
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over. `--start=` resumes the scanner.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const catalogue = new Map();
if (wantEtfs) loadByIsin(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadByIsin(stocksCsvPath, "STOCK", catalogue);
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);
const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const outputPath = new URL("swissquote-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        if (entry && nonEuResident(entry.type, entry.isin)) entry.nonEuResident = true;
        else if (entry) delete entry.nonEuResident;
        results.push(entry);
        if (entry?.ticker) {
          seen.add(
            `${entry.isin || entry.ticker}:${entry.exchange || ""}:${entry.ticker}:${entry.currency || ""}:${entry.type || ""}`.toUpperCase()
          );
        }
      }
    }
  } catch {
    // Ignore malformed prior output.
  }
}

const PAGE_SIZE = 200;
const CONCURRENCY = 4;

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("trade.swissquote.ch")) ||
  (await browser.newPage());

if (!page.url().includes("trade.swissquote.ch")) {
  await page.goto("https://trade.swissquote.ch/eding_trading-platform/#markets", {
    waitUntil: "domcontentloaded",
  });
  await sleep(4000);
}

async function call(path, body) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await sleep(400 * attempt);
    const answer = await page.evaluate(
      async (target, payload) => {
        try {
          const response = await fetch(target, {
            method: payload === undefined ? "GET" : "POST",
            credentials: "include",
            headers: {
              Accept: "application/json",
              ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
            },
            body: payload === undefined ? undefined : JSON.stringify(payload),
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
      path,
      body
    );
    if (answer.status === 401 || answer.status === 403) {
      throw new Error("Swissquote asked to sign in again.");
    }
    if (answer.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (answer.json) return answer.json;
  }
  return null;
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

function emit(item) {
  const type = listingType(item);
  if (!type) {
    skip(String(item.type || "unknown").toLowerCase());
    return;
  }
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) return;
  if (type === "STOCK" && !wantStocks) return;
  if (type === "CRYPTO" && !wantCrypto) return;

  const ticker = normalizeTicker(item.symbol);
  const isin = toIsin(item.stockKey?.isin || item.isin);
  if (!ticker) {
    skip("no ticker");
    return;
  }
  if (onlyTickers.size > 0 || onlyIsins.size > 0) {
    if (!onlyTickers.has(ticker) && !onlyIsins.has(isin)) return;
  }

  const match = isin ? catalogue.get(isin) : null;
  const exchange = venueOf(item, match);
  const currency = currencyOf(item);
  if (!exchange) {
    skip("no exchange");
    return;
  }
  if (!currency) {
    skip("no currency");
    return;
  }

  if (type === "CRYPTO") {
    if (!cryptoTickers.has(ticker) && !keepUnlisted) {
      unlisted += 1;
      return;
    }
  } else if (!match && !keepUnlisted) {
    unlisted += 1;
    return;
  }

  const key = `${isin || ticker}:${exchange}:${ticker}:${currency}:${type}`.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);

  const name = normalize(item.name || item.companyName || match?.names?.[0] || ticker);
  const row = {
    query: ticker,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, isin].filter(Boolean).join(" "),
    isin: isin || "",
  };
  if (nonEuResident(type, isin)) row.nonEuResident = true;
  results.push(row);
}

async function search(term) {
  const payload = await call("/eding_securities-search-plugin/api/search/allGrouped", {
    count: 100,
    searchTerm: term,
    suggestTab: "false",
  });
  return flattenHits(payload);
}

async function scannerPage(productType, offset) {
  return call(`/eding_securities-search-plugin/api/scanner/data/${productType}`, {
    count: String(PAGE_SIZE),
    offset: String(offset),
    language: "en",
    sortByColumn: "name",
    sortOrder: "asc",
    productType,
  });
}

async function walkScanner(productType, label) {
  const first = await scannerPage(productType, 0);
  const total = first?.securitiesCount || 0;
  const rows = first?.securities || [];
  console.error(`${label}: ${total} listings`);
  for (const row of rows) emit(row);

  const offsets = [];
  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);
  const startAt = Math.max(0, startIndex - 1 - PAGE_SIZE);
  const jobs = offsets.filter((offset) => offset >= startAt);

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const pagesRead = await Promise.all(batch.map((offset) => scannerPage(productType, offset)));
    for (const payload of pagesRead) {
      for (const row of payload?.securities || []) emit(row);
    }
    const done = Math.min(batch[batch.length - 1] + PAGE_SIZE, total);
    if (i === 0 || (i + CONCURRENCY) % 20 === 0 || i + CONCURRENCY >= jobs.length) {
      console.error(`  [${done}/${total}] ${results.length} matched`);
    }
    if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
  }
}

const reachable = await call("/eding_securities-search-plugin/api/search/allGrouped", {
  count: 1,
  searchTerm: "AAPL",
  suggestTab: "false",
});
if (!reachable?.securities) {
  await browser.disconnect();
  throw new Error("Swissquote's instrument search did not answer. Is trade.swissquote.ch signed in?");
}

if (onlyTickers.size > 0 || onlyIsins.size > 0) {
  const queries = [...onlyTickers, ...onlyIsins];
  for (let offset = 0; offset < queries.length; offset += CONCURRENCY) {
    const batch = queries.slice(offset, offset + CONCURRENCY);
    const found = await Promise.all(batch.map((query) => search(query)));
    for (const hits of found) for (const hit of hits) emit(hit);
    console.error(`[${Math.min(offset + CONCURRENCY, queries.length)}/${queries.length}] ${results.length} matched`);
  }
} else {
  if (wantCrypto) await walkScanner("cryptocurrency", "Crypto");
  if (wantStocks) await walkScanner("share", "Shares");
  if (wantEtfs) await walkScanner("etf", "ETFs");
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

save();

const byType = new Map();
let nonEu = 0;
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  if (row.nonEuResident) nonEu += 1;
}
const byCurrency = new Map();
for (const row of results) byCurrency.set(row.currency, (byCurrency.get(row.currency) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"}; ` +
    `${[...byCurrency].map(([currency, count]) => `${count} ${currency}`).join(", ") || "no currency"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
if (nonEu > 0) {
  console.error(`${nonEu} of them are non-EU-resident only (no KID for EEA retail)`);
}

await browser.disconnect();
