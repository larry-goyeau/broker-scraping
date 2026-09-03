import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").split(/[./]/)[0].trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
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

// Freedom24 files an instrument under the market it trades on rather than the
// exchange, so a London listing is VUAA.EU and a New York one AAPL.US. Athens
// is the odd one out: it answers to .GR, not .EU.
const MARKET_SUFFIX = new Map(
  Object.entries({
    LSE: "EU",
    EURONEXT: "EU",
    XETR: "EU",
    SIX: "EU",
    VIE: "EU",
    AQUIS: "EU",
    BX: "EU",
    LSIN: "EU",
    LUXSE: "EU",
    GPW: "EU",
    BET: "EU",
    OMXCOP: "EU",
    OMXHEX: "EU",
    OMXSTO: "EU",
    BME: "EU",
    MIL: "EU",
    LJSE: "EU",
    BVB: "EU",
    PSECZ: "EU",
    OSL: "EU",
    GETTEX: "EU",
    FWB: "EU",
    TRADEGATE: "EU",
    LSX: "EU",
    LS: "EU",
    DUS: "EU",
    MUN: "EU",
    HAM: "EU",
    HAN: "EU",
    SWB: "EU",
    ATHEX: "GR",
    AMEX: "US",
    NASDAQ: "US",
    NYSE: "US",
    CBOE: "US",
    OTC: "US",
    BATS: "US",
    ARCA: "US",
  })
);

const FINDER_EXCHANGES = [
  "FIX",
  "EU",
  "HKEX",
  "EUROBONDS",
  "ATHEX",
  "BIST",
  "WSE",
  "CRPT",
  "KASE",
  "AIX",
  "ITS",
].join(",");

const KEPT_MARKETS = new Set(["FIX", "EU", "HKEX", "ATHEX", "WSE", "EUROBOND", "EUROBONDS", "CRPT"]);

function isAliasTicker(ticker) {
  const text = String(ticker || "");
  return /@/.test(text) || /_KZ/.test(text) || /-RM/.test(text) || /\.ITS$/i.test(text) || /MBANK/i.test(text);
}

function listingType(info, catalogueKind) {
  const kind = Number(info.kind);
  const shelf = Number(info.type);
  if (kind === 9 || kind === 18 || shelf === 2) return "BND";
  if (kind === 8 || kind === 29 || kind === 31 || kind === 32 || kind === 33 || shelf === 6) {
    return "CRYPTO";
  }
  if (kind === 7) {
    const name = info.name || "";
    if (/\bETC\b/i.test(name)) return "ETC";
    if (/\bETN\b/i.test(name)) return "ETN";
    return catalogueKind === "STOCK" ? "STOCK" : "ETF";
  }
  return catalogueKind || "STOCK";
}

function cryptoBase(ticker) {
  const text = normalize(ticker).toUpperCase();
  if (!text) return "";
  return text.split(/[/\-]/)[0].split(".")[0];
}

function loadCsv(csvPath, kind, index = { byIsin: new Map(), byTicker: new Map() }) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const exchange = normalize(columns[1]).toUpperCase();
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean) || "";
    if (isin && !index.byIsin.has(isin)) index.byIsin.set(isin, kind);
    if (ticker && !index.byTicker.has(ticker)) index.byTicker.set(ticker, kind);
    if (kind === "BND") {
      if (isin) index.bondIsins.push(isin);
      continue;
    }
    if (kind === "CRYPTO") {
      if (ticker) index.cryptoTickers.add(ticker);
      continue;
    }
    if (ticker) {
      const suffix = MARKET_SUFFIX.get(exchange);
      if (suffix) index.candidates.add(`${ticker}.${suffix}`);
      if (exchange === "HKEX") {
        const padded = /^\d+$/.test(ticker) ? ticker.padStart(4, "0") : ticker;
        index.hkQueries.push({ query: `${padded}.HK`, isin });
      }
    }
  }
  return index;
}

const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const bondsCsvPath = pathArg("bonds-csv", "../bonds.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const bondsOnly = hasFlag("bonds-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const fresh = hasFlag("fresh");
const keepUnlisted = hasFlag("all");
const startIndex = Math.max(1, numberArg("start", 1));

const wantEtfs = !stocksOnly && !bondsOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !bondsOnly && !cryptoOnly;
const wantBonds = !etfsOnly && !stocksOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly && !bondsOnly;

const catalogue = { byIsin: new Map(), byTicker: new Map(), candidates: new Set(), hkQueries: [], bondIsins: [], cryptoTickers: new Set() };
if (wantEtfs) loadCsv(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadCsv(stocksCsvPath, "STOCK", catalogue);
if (wantBonds) loadCsv(bondsCsvPath, "BND", catalogue);
if (wantCrypto) loadCsv(cryptosCsvPath, "CRYPTO", catalogue);

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliIsins = positionalArgs.map(toIsin).filter(Boolean);
const cliTickers = positionalArgs
  .filter((arg) => !toIsin(arg))
  .map((arg) => normalize(arg).toUpperCase())
  .filter(Boolean);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("freedom24.com")) || (await browser.newPage());
await page.bringToFront();
if (!page.url().includes("freedom24.com/terminal")) {
  await page.goto("https://freedom24.com/terminal", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

const outputPath = new URL("freedom24-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query) seen.add(entry.query.toUpperCase());
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

async function call(cmd, params) {
  return page.evaluate(
    async (command, args) => {
      const form = new FormData();
      form.append("q", JSON.stringify({ cmd: command, params: args }));
      const response = await fetch(`https://freedom24.com/api?cmd=${command}`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return { error: text.slice(0, 120) };
      }
    },
    cmd,
    params
  );
}

async function callWithRetry(cmd, params, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const answer = await call(cmd, params).catch(() => null);
    // "Request limit exceeded" arrives as a normal answer, and reading it as a
    // result would quietly turn a throttled call into an empty one.
    if (answer && !answer.error && !/request limit/i.test(String(answer.errMsg || ""))) return answer;
    if (attempt < attempts) await sleep(attempt * 15000);
  }
  return null;
}

const FINDER_CONCURRENCY = 8;

function finderHits(answer, isin) {
  const found = Array.isArray(answer?.found) ? answer.found : [];
  return found.filter((row) => {
    const ticker = row.t || "";
    if (!ticker || isAliasTicker(ticker)) return false;
    if (!KEPT_MARKETS.has(row.mkt)) return false;
    if (Number(row.type) === 10) return false;
    if (isin && toIsin(row.isin) !== isin) return false;
    return true;
  });
}

async function findMany(queries) {
  const answers = new Array(queries.length);
  let next = 0;

  const run = async () => {
    while (next < queries.length) {
      const index = next;
      next += 1;
      const query = queries[index];
      answers[index] = await callWithRetry("tickerFinder", {
        text: query.text,
        exchanges: FINDER_EXCHANGES,
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(FINDER_CONCURRENCY, queries.length) }, run));
  return answers;
}

const PERMISSION_BATCH = 300;
const DETAIL_CONCURRENCY = 12;

function readDetails(batch) {
  return page.evaluate(
    async (tickers, workers) => {
      const answers = new Array(tickers.length);
      let next = 0;

      const run = async () => {
        while (next < tickers.length) {
          const index = next;
          next += 1;
          try {
            const form = new FormData();
            form.append("q", JSON.stringify({ cmd: "getSecurityInfo", params: { ticker: tickers[index] } }));
            const response = await fetch("https://freedom24.com/api?cmd=getSecurityInfo", {
              method: "POST",
              body: form,
              credentials: "include",
            });
            answers[index] = await response.json();
          } catch (error) {
            answers[index] = { error: String(error) };
          }
        }
      };

      await Promise.all(Array.from({ length: workers }, run));
      return answers;
    },
    batch,
    DETAIL_CONCURRENCY
  );
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

function catalogueKind(isin, ticker) {
  if (isin && catalogue.byIsin.has(isin)) return catalogue.byIsin.get(isin);
  const base = cryptoBase(ticker);
  if (catalogue.cryptoTickers.has(base)) return "CRYPTO";
  if (keepUnlisted) return "";
  return null;
}

function keepRow(info, ticker) {
  if (!info || info.error) return false;
  if (Number(info.type) === 10) return false;
  if (isAliasTicker(info.c || ticker)) return false;

  const isin = toIsin(info.issue_nb);
  const kind = catalogueKind(isin, ticker);
  if (kind === null) return false;

  const key = (info.c || ticker).toUpperCase();
  if (seen.has(key)) return false;
  seen.add(key);

  results.push({
    query: info.c || ticker,
    ticker: (info.code_nm || "").trim() || String(ticker).split(/[./]/)[0],
    name: normalize(info.name) || ticker,
    exchange: normalize(info.codesub_nm || info.ltr) || null,
    currency: info.x_curr || null,
    type: listingType(info, kind),
    raw: [info.c, info.name, info.codesub_nm, info.issue_nb].filter(Boolean).join(" "),
    isin: isin || null,
  });
  return true;
}

async function processTickers(tickers, label) {
  const queue = [...new Set(tickers)].filter((ticker) => !seen.has(ticker));
  if (queue.length === 0) return;
  console.error(`${queue.length} ${label} to check`);

  let checked = 0;
  let tradable = 0;

  for (let offset = 0; offset < queue.length; offset += PERMISSION_BATCH) {
    const candidates = queue.slice(offset, offset + PERMISSION_BATCH);
    checked += candidates.length;

    const permissions = await callWithRetry("checkAllowedTickerAndBanOnTrade", {
      checkBan: false,
      checkInstrumentUserAgreementLog: true,
      tickers: candidates,
    });

    if (!permissions) {
      console.error(`  [${offset + 1}-${offset + candidates.length}] permission check failed`);
      continue;
    }

    // "This instrument is not available to you" is what allowed = 0 looks like on
    // screen, so anything but 1 is dropped here.
    const batch = candidates.filter((ticker) => permissions[ticker]?.allowed === 1);
    tradable += batch.length;

    const answers = batch.length > 0 ? (await readDetails(batch).catch(() => null)) || [] : [];

    for (const [index, ticker] of batch.entries()) {
      const info = answers[index];
      if (!info || info.error) {
        console.error(`  ${ticker}: details unavailable`);
        continue;
      }
      keepRow(info, ticker);
    }

    save();
    console.error(`[${checked}/${queue.length}] ${tradable} tradable, ${results.length} saved`);
  }
}

async function addFromFinder(queries, label) {
  if (queries.length === 0) return [];
  console.error(`looking up ${queries.length} ${label}`);
  const found = [];
  for (let offset = 0; offset < queries.length; offset += 200) {
    const batch = queries.slice(offset, offset + 200);
    const answers = await findMany(batch.map((row) => ({ text: row.text })));
    for (const [index, row] of batch.entries()) {
      for (const hit of finderHits(answers[index], row.isin)) found.push(hit.t);
    }
    console.error(`  ${label} ${Math.min(offset + batch.length, queries.length)}/${queries.length}, ${found.length} tickers`);
  }
  return found;
}

if (cliTickers.length > 0 || cliIsins.length > 0) {
  const wanted = [...cliTickers];
  if (cliIsins.length > 0) {
    wanted.push(
      ...(await addFromFinder(
        cliIsins.map((isin) => ({ text: isin, isin })),
        "ISINs"
      ))
    );
  }
  await processTickers(wanted, "candidates");
} else {
  const guessed = [...catalogue.candidates];
  if (wantCrypto) {
    for (const ticker of catalogue.cryptoTickers) guessed.push(`${ticker}/USD`);
  }
  await processTickers(guessed.slice(Math.max(0, startIndex - 1)), "listed tickers");

  if (wantBonds) {
    const bondTickers = await addFromFinder(
      [...new Set(catalogue.bondIsins)].map((isin) => ({ text: isin, isin })),
      "bond ISINs"
    );
    await processTickers(bondTickers, "bonds");
  }

  if (wantStocks) {
    const hkTickers = await addFromFinder(
      catalogue.hkQueries.map((row) => ({ text: row.query, isin: row.isin })),
      "Hong Kong listings"
    );
    await processTickers(hkTickers, "Hong Kong tickers");
  }
}

save();

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin).filter(Boolean)).size} ISINs ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
