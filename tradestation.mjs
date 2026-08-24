import puppeteer from "puppeteer-core";
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
    .map((line) => normalizeTicker(line))
    .filter(Boolean);
}

function loadTickerToIsinFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    if (!ticker) continue;

    // Supports both: symbol,isin,name and symbol,exchange,isin,name.
    const isin =
      toIsin(columns[2]) ||
      toIsin(columns[1]) ||
      columns.map(toIsin).find(Boolean) ||
      "";
    if (isin && !map.has(ticker)) map.set(ticker, isin);
  }

  return map;
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

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("my.tradestation.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/tradestation-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["SPY", "ACWI", "VTI"];
const cliQueries = positionalArgs.map(normalizeTicker).filter(Boolean);

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const csvQueries = loadTickersFromCsv(csvPath);
const tickerToIsin = loadTickerToIsinFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = "parsed_json/tradestation-parsed.json";
const results = [];
const seen = new Set();

// When resuming, load already-saved entries so earlier progress is preserved.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) {
          seen.add(`${entry.query}:${entry.ticker}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

async function scrapeInstrument(query) {
  const url =
    `https://my.tradestation.com/portfolio/research?symbol=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const maxWaitMs = 8000;
  const pollMs = 250;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    const loadedTicker = await page.evaluate(() => {
      const header = document.querySelector('[data-testid="symbol-header"]');
      const priceDisplay = header?.querySelector('[data-testid="price-display"]');
      const tickerElement = priceDisplay?.parentElement?.querySelector(":scope > span");
      return (tickerElement?.textContent || "").trim().toUpperCase();
    });
    if (loadedTicker === query) break;

    await sleep(pollMs);
    elapsed += pollMs;
  }

  return page.evaluate(() => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
    const header = document.querySelector('[data-testid="symbol-header"]');
    if (!header) return null;

    const logo = header.querySelector("img[alt]");
    const ticker = normalize(logo?.getAttribute("alt")).toUpperCase();
    if (!ticker) return null;

    const details = logo?.nextElementSibling;
    const metadata = details?.children?.[1];
    const metadataSpans = metadata
      ? [...metadata.children].filter((element) => element.tagName === "SPAN")
      : [];
    const name = normalize(metadataSpans[0]?.textContent);
    const exchange = normalize(metadataSpans[2]?.textContent);
    if (!name) return null;

    return {
      ticker,
      name,
      exchange: exchange || null,
      // TradeStation researches US listings only, quoted in dollars.
      currency: "USD",
      type: "ETF",
      raw: normalize(header.innerText),
    };
  });
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const parsed = await scrapeInstrument(query);
  if (parsed && parsed.ticker === query) {
    const result = {
      query,
      ...parsed,
      isin: tickerToIsin.get(query) || null,
    };
    const key = `${result.query}:${result.ticker}`.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(result);
    }
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
