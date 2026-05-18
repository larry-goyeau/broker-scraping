import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").split(/[./-]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadTickersFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => normalizeTicker(line))
    .filter(Boolean);
}

function loadTickerToIsinFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const content = fs.readFileSync(csvPath, "utf8");
  const map = new Map();

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const cols = line.split(",");
    const ticker = normalizeTicker(cols[0]);
    if (!ticker) continue;

    // Supports both: symbol,isin,name and symbol,exchange,isin,name.
    const isin = toIsin(cols[2]) || toIsin(cols[1]) || cols.map(toIsin).find(Boolean) || "";
    if (!isin) continue;

    if (!map.has(ticker)) map.set(ticker, isin);
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

async function ensureSearchInput(page) {
  const selectors = [
    'input[placeholder*="Find a symbol" i]',
    'input[placeholder*="Find a symbol or company" i]',
    'input[placeholder*="Search" i]',
    'input[type="search"]',
  ];

  let searchInput = await page.$(selectors.join(", "));
  if (searchInput) return searchInput;

  await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const nodes = [...document.querySelectorAll("button, a, div, span")];
    const target = nodes.find((el) => /search/i.test(norm(el.textContent)));
    if (target) target.click();
  });
  await sleep(300);

  searchInput = await page.waitForSelector(selectors.join(", "), { timeout: 8000 });
  return searchInput;
}

async function scrapeRowsForQuery(page, searchInput, query) {
  await searchInput.click({ clickCount: 3 });
  await searchInput.press("Backspace");
  await searchInput.type(query, { delay: 40 });

  const collectRows = async () =>
    page.evaluate((q) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const queryPrefix = new RegExp(`^${escaped}(?:[./-][A-Z0-9]+)?\\b`, "i");

      const rows = [...document.querySelectorAll("button.symbol-search-result, .results .option")]
        .filter((el) => el instanceof HTMLElement && el.offsetParent !== null)
        .map((row) => {
          const symbol = norm(row.querySelector(".symbol")?.textContent || "");
          const name = norm(row.querySelector(".description")?.textContent || "");
          const badges = [...row.querySelectorAll('[class*="badge"]')]
            .map((b) => norm(b.textContent))
            .filter(Boolean);
          const primaryType = badges.find((b) =>
            /^(ETF|Stock|Future|Crypto|Forex|Index|Bond|Fund)$/i.test(b)
          );
          const raw = norm(row.innerText);
          return {
            ticker: symbol.toUpperCase(),
            name,
            type: primaryType ? primaryType.toUpperCase() : null,
            raw,
          };
        })
        .filter((item) => {
          if (!item.ticker || !item.name) return false;
          if (!queryPrefix.test(item.ticker)) return false;
          return true;
        });

      const dedup = new Map();
      for (const row of rows) {
        const key = row.ticker;
        const existing = dedup.get(key);
        if (!existing || (!existing.type && row.type)) dedup.set(key, row);
      }
      const pageText = norm(document.body?.innerText || "");
      const notFound =
        // Primary empty state in the search dropdown.
        /not found in all/i.test(pageText) ||
        // Backup text in case the first line wording changes.
        /clear the search field to browse all symbols/i.test(pageText);

      return {
        rows: [...dedup.values()],
        notFound,
      };
    }, query.toUpperCase());

  const maxWaitMs = 4000;
  const pollMs = 250;
  const stableNeeded = 2;
  let elapsed = 0;
  let lastCount = -1;
  let stableHits = 0;
  let rows = [];

  while (elapsed < maxWaitMs) {
    const snapshot = await collectRows();
    rows = snapshot.rows;

    // Explicit tastytrade empty-state message; no need to keep polling.
    if (snapshot.notFound) break;

    if (rows.length === lastCount && rows.length > 0) {
      stableHits += 1;
      if (stableHits >= stableNeeded) break;
    } else {
      stableHits = 0;
      lastCount = rows.length;
    }

    await sleep(pollMs);
    elapsed += pollMs;
  }

  return rows;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => /tastytrade|tastyworks/i.test(p.url())) || (await browser.newPage());

if (!/tastytrade|tastyworks/i.test(page.url())) {
  await page.goto("https://trade.tastytrade.com/", { waitUntil: "domcontentloaded" });
}

await page.bringToFront();
const searchInput = await ensureSearchInput(page);

const defaultQueries = ["ACWI", "VHT", "VWRL"];
const cliQueries = process.argv.slice(2).map(normalizeTicker).filter(Boolean);
const csvQueries = loadTickersFromCsv("etfs.csv");
const tickerToIsin = loadTickerToIsinFromCsv("etfs.csv");
const rawQueries =
  cliQueries.length > 0 ? cliQueries : csvQueries.length > 0 ? csvQueries : defaultQueries;
const queries = uniqueQueries(rawQueries);

const results = [];
const byKey = new Map();

for (const query of queries) {
  const rows = await scrapeRowsForQuery(page, searchInput, query);
  for (const row of rows) {
    const queryTicker = normalizeTicker(query) || query;
    const resultTicker = normalizeTicker(row.ticker);
    const isin =
      tickerToIsin.get(resultTicker) || tickerToIsin.get(queryTicker) || null;
    const parsed = {
      query: queryTicker,
      ticker: row.ticker,
      name: row.name,
      exchange: null,
      type: row.type,
      raw: row.raw,
      isin,
    };

    const key = `${parsed.query}:${parsed.ticker}`.toUpperCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, parsed);
      results.push(parsed);
      continue;
    }

    // Prefer rows that include a parsed type badge.
    if (!existing.type && parsed.type) Object.assign(existing, parsed);
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.writeFileSync("tastytrade-parsed.json", JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
