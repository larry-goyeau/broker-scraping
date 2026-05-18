import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toTickerOnly(value) {
  const text = (value || "").trim();
  if (!text) return "";

  // Handle CSV lines like: EXCHANGE:TICKER,Name
  const firstColumn = text.split(",")[0].trim();
  if (!firstColumn) return "";

  const tickerWithSuffix = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;

  // Drop suffixes like ".GB" / ".USD" to keep one search query.
  const baseTicker = (tickerWithSuffix || "").split(".")[0];
  return baseTicker.trim();
}

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
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;

      // Fallback: find the first ISIN-looking token in the row.
      for (const col of cols) {
        const isin = toIsin(col);
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

async function ensureEtoroSearchInput(page) {
  let searchInput = await page.$(
    'input[placeholder*="Search" i], input[placeholder*="Rechercher" i], input[type="search"]'
  );
  if (searchInput) return searchInput;

  const triggerSelectors = [
    '[aria-label*="Search" i]',
    '[aria-label*="Rechercher" i]',
    'button[title*="Search" i]',
    'button[title*="Rechercher" i]',
    'a[href*="/discover"]',
  ];

  for (const selector of triggerSelectors) {
    const trigger = await page.$(selector);
    if (trigger) {
      await trigger.click();
      await sleep(300);
      searchInput = await page.$(
        'input[placeholder*="Search" i], input[placeholder*="Rechercher" i], input[type="search"]'
      );
      if (searchInput) return searchInput;
    }
  }

  // Fallback: click a visible element with "Search" or "Recherche" text.
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("button, a, div, span")];
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const target = nodes.find((el) => {
      const text = (el.textContent || "").trim();
      return isVisible(el) && /^(search|recherche)$/i.test(text);
    });
    if (target) target.click();
  });

  searchInput = await page.waitForSelector(
    'input[placeholder*="Search" i], input[placeholder*="Rechercher" i], input[type="search"]',
    { timeout: 8000 }
  );
  return searchInput;
}

function parseEtoroRowText(text) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;

  // Drop trailing action labels from CTA buttons.
  const cleaned = compact
    .replace(/\s+(Investissez|Investir|Acheter|Vendre|Trade|Buy|Sell)\s*$/i, "")
    .trim();

  const pipeMatch = cleaned.match(/^([A-Z0-9.-]{2,20})\s*\|\s*(.+)$/i);
  if (!pipeMatch) return { raw: cleaned };

  const ticker = pipeMatch[1].trim().toUpperCase();
  let rest = pipeMatch[2].trim();

  // Common line shape: "Name ETF, Xetra ETFs"
  const exchangeMatch = rest.match(/,\s*([^,]+)$/);
  const exchange = exchangeMatch ? exchangeMatch[1].trim() : null;
  if (exchangeMatch) {
    rest = rest.slice(0, exchangeMatch.index).trim();
  }

  // Strip instrument-type suffix from name.
  const name = rest.replace(/\s+(ETF|Stock|Crypto|Index|CFD|Forex|Commodity)\b.*$/i, "").trim();

  return {
    name: name || rest,
    ticker,
    exchange,
    raw: exchange ? `${ticker} | ${name || rest} · ${exchange}` : `${ticker} | ${name || rest}`,
  };
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("etoro.com")) || (await browser.newPage());

if (!page.url().includes("etoro.com")) {
  await page.goto("https://www.etoro.com/", { waitUntil: "domcontentloaded" });
}

await page.bringToFront();
const searchInput = await ensureEtoroSearchInput(page);

const defaultEtfQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = process.argv.slice(2).filter(Boolean).map(toIsin).filter(Boolean);
const csvQueries = loadIsinsFromCsv("etfs.csv");
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultEtfQueries;
const queries = uniqueQueries(rawQueries);

async function scrapeResultsForQuery(query) {
  await searchInput.click({ clickCount: 3 });
  await searchInput.press("Backspace");
  await searchInput.type(query, { delay: 40 });
  await sleep(900);

  return page.evaluate((q) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const nodes = [...document.querySelectorAll("*")].filter(
      (el) => el instanceof HTMLElement && el.offsetParent !== null
    );

    const rowCandidates = nodes
      .map((el) => norm(el.innerText))
      .filter((text) => {
        if (!text) return false;
        if (text.length < 8 || text.length > 220) return false;
        if (!text.includes("|")) return false;
        if (!/^[A-Z0-9.-]{2,20}\s*\|/.test(text)) return false;
        if (/^(Recherches récentes|Recent searches|Tendances|Trending|Smart Portfolios)/i.test(text)) {
          return false;
        }
        return true;
      });

    return [...new Set(rowCandidates)];
  }, query);
}

const results = [];
const byKey = new Map();

for (const query of queries) {
  const foundTexts = await scrapeResultsForQuery(query);
  for (const text of foundTexts) {
    const parsed = parseEtoroRowText(text);
    if (!parsed) continue;

    // The page scraper picks up both a parent container (with exchange info) and
    // child elements (without it), so we dedupe by (query, ticker) and keep
    // whichever variant has the richest exchange value.
    const key = parsed.ticker
      ? `${query}:TICKER:${parsed.ticker.toUpperCase()}`
      : `${query}:RAW:${(parsed.raw || "").toUpperCase()}`;

    const incoming = { query, ...parsed, isin: query };
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, incoming);
      results.push(incoming);
      continue;
    }
    if (!existing.exchange && incoming.exchange) {
      Object.assign(existing, incoming);
    }
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.writeFileSync("etoro-parsed.json", JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));
await browser.disconnect();
