import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  // Drop EXCHANGE: prefix and exchange-specific tails like .USD, /N, -ETFP.
  const afterExchange = text.includes(":") ? text.split(":").pop() : text;
  return (afterExchange || "").split(/[./-]/)[0].trim();
}

function loadIsinToTickersFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const content = fs.readFileSync(csvPath, "utf8");
  const map = new Map();

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const cols = line.split(",");
    // Supports both: symbol,isin,name and symbol,exchange,isin,name
    const isin = toIsin(cols[2]) || toIsin(cols[1]) || cols.map(toIsin).find(Boolean) || "";
    if (!isin) continue;

    const ticker = normalizeTicker(cols[0]);
    if (!ticker) continue;

    if (!map.has(isin)) map.set(isin, new Set());
    map.get(isin).add(ticker);
  }

  return map;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((p) => p.url().includes("app.trading212.com")) || (await browser.newPage());

if (!page.url().includes("app.trading212.com")) {
  await page.goto("https://app.trading212.com/", { waitUntil: "domcontentloaded" });
}

await page.bringToFront();

let searchInput = await page.$('input[placeholder*="Search" i], input[type="search"]');
if (!searchInput) {
  const searchTrigger =
    (await page.$('[aria-label*="Search" i]')) ||
    (await page.$('button[title*="Search" i], button:has(svg)'));
  if (searchTrigger) await searchTrigger.click();
  await sleep(300);
  searchInput = await page.waitForSelector(
    'input[placeholder*="Search" i], input[type="search"]',
    { timeout: 5000 }
  );
}

const isinToTickers = loadIsinToTickersFromCsv("etfs.csv");

const cliIsins = process.argv.slice(2).filter(Boolean).map(toIsin).filter(Boolean);
const defaultIsins = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];

const queries =
  cliIsins.length > 0
    ? [...new Set(cliIsins)]
    : isinToTickers.size > 0
      ? [...isinToTickers.keys()]
      : defaultIsins;

async function selectEtfTab() {
  const clicked = await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

    function findSearchModal() {
      const candidates = [...document.querySelectorAll("div")]
        .filter((el) => el instanceof HTMLElement && el.offsetParent !== null)
        .filter((el) => {
          const t = el.innerText || "";
          return (
            t.includes("Stocks") &&
            t.includes("ETFs") &&
            t.includes("CFDs") &&
            t.includes("Leveraged funds")
          );
        })
        .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
      return candidates[0] || null;
    }

    const modal = findSearchModal();
    if (!modal) return false;

    const tab = [...modal.querySelectorAll("*")]
      .filter((el) => el instanceof HTMLElement && el.offsetParent !== null)
      .find((el) => norm(el.textContent) === "ETFs");
    if (!tab) return false;

    tab.click();
    return true;
  });
  return clicked;
}

async function scrapeResultsForQuery(q) {
  await searchInput.click({ clickCount: 3 });
  await searchInput.press("Backspace");
  await searchInput.type(q, { delay: 40 });
  await sleep(900);

  await selectEtfTab();
  await sleep(500);

  return page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

    // Trading212's search modal has a tabs row ("All Stocks ETFs CFDs Leveraged funds")
    // plus either result rows (with " · ") or "No results found". Find the smallest
    // ancestor that contains both signals so we exclude the dashboard's
    // Trending/Watchlist/Recently viewed panels.
    function findSearchModal() {
      const candidates = [...document.querySelectorAll("div")]
        .filter((el) => el instanceof HTMLElement && el.offsetParent !== null)
        .filter((el) => {
          const t = el.innerText || "";
          const hasTabs =
            t.includes("Stocks") &&
            t.includes("ETFs") &&
            t.includes("CFDs") &&
            t.includes("Leveraged funds");
          if (!hasTabs) return false;
          return /\s·\s/.test(t) || /No results found/i.test(t);
        })
        .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
      return candidates[0] || null;
    }

    const modal = findSearchModal();
    if (!modal) return [];
    if (/No results found/i.test(modal.innerText || "")) return [];

    const rowCandidates = [...modal.querySelectorAll("*")]
      .filter((el) => el instanceof HTMLElement && el.offsetParent !== null)
      .map((el) => norm(el.innerText))
      .filter((text) => {
        if (!text) return false;
        if (text.length < 18 || text.length > 180) return false;
        if (!/(?:[€$£p]|[A-Za-z]{1,4})\s*\d/.test(text)) return false;
        if (!/\s·\s/.test(text)) return false;
        // Drop any text that still contains the tab row.
        if (/All\s+Stocks\s+ETFs\s+CFDs\s+Leveraged\s+funds/i.test(text)) return false;
        return true;
      })
      .sort((a, b) => a.length - b.length);

    const uniqueTexts = [...new Set(rowCandidates)];
    return uniqueTexts.map((text) => {
      const match = text.match(
        /^(.*?)\s+([A-Z0-9.-]{2,12})\s*·\s*([A-Z]{2,8})\s+((?:[€$£p]|[A-Za-z]{1,4})\s*[0-9][0-9.,]*)\s*([+-]?[0-9][0-9.,]*%)?/i
      );

      if (!match) return { raw: text };

      return {
        name: match[1].trim(),
        ticker: match[2].trim(),
        exchange: match[3].trim(),
        raw: `${match[1].trim()} ${match[2].trim()} · ${match[3].trim()}`,
      };
    });
  });
}

const results = [];
const seen = new Set();
for (const [queryIndex, isin] of queries.entries()) {
  console.error(`[${queryIndex + 1}/${queries.length}] ${isin}`);
  const expectedTickers = isinToTickers.get(isin) || new Set();
  const foundResults = await scrapeResultsForQuery(isin);

  for (const result of foundResults) {
    if (!result?.ticker) continue;

    // Trading212 search is fuzzy and returns many name-related ETFs for an ISIN,
    // not a strict ISIN match. Keep only rows whose ticker is one of the expected
    // tickers from etfs.csv for this ISIN.
    const resultTicker = normalizeTicker(result.ticker);
    if (expectedTickers.size === 0 || !expectedTickers.has(resultTicker)) continue;

    const key = `${isin}:${result.exchange || ""}:${result.ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query: isin,
      isin,
      ...result,
    });
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.writeFileSync("trading212-parsed.json", JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
