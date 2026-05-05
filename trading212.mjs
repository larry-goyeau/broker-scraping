import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toTickerOnly(value) {
  const text = (value || "").trim();
  if (!text) return "";

  // Handle CSV lines like: EXCHANGE:TICKER,Name
  const firstColumn = text.split(",")[0].trim();
  if (!firstColumn) return "";

  // Keep only ticker part from EXCHANGE:TICKER
  const ticker = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;

  return (ticker || "").trim();
}

function loadTickersFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => toTickerOnly(line))
    .filter(Boolean);
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

const defaultEtfQueries = ["ACWI", "VWCE", "VUAA"];
const cliQueries = process.argv.slice(2).filter(Boolean).map(toTickerOnly).filter(Boolean);
const csvQueries = loadTickersFromCsv("etfs.csv");
const queries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultEtfQueries;

async function scrapeFirstResultForQuery(q) {
  await searchInput.click({ clickCount: 3 });
  await searchInput.press("Backspace");
  await searchInput.type(q, { delay: 40 });
  await sleep(900);

  return page.evaluate((query) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const queryUpper = query.toUpperCase();

    const nodes = [...document.querySelectorAll("*")].filter(
      (el) => el instanceof HTMLElement && el.offsetParent !== null
    );

    const rowCandidates = nodes
      .map((el) => norm(el.innerText))
      .filter((text) => {
        if (!text) return false;
        if (text.length < 18 || text.length > 180) return false;
        if (!text.toUpperCase().includes(queryUpper)) return false;
        if (!/[€$£p]\s*\d/.test(text)) return false;
        if (!/\s·\s/.test(text)) return false;
        if (/^INVEST Search/i.test(text)) return false;
        return true;
      })
      .sort((a, b) => a.length - b.length);

    const text = rowCandidates[0];
    if (!text) return null;

    const match = text.match(
      /^(.*?)\s+([A-Z0-9.-]{2,12})\s*·\s*([A-Z]{2,8})\s+([€$£p][0-9][0-9.,]*)\s*([+-]?[0-9][0-9.,]*%)?/i
    );

    if (!match) return { raw: text };

    return {
      name: match[1].trim(),
      ticker: match[2].trim(),
      exchange: match[3].trim(),
      price: match[4].trim(),
      change: (match[5] || "").trim() || null,
      raw: text,
    };
  }, q);
}

const results = [];
for (const query of queries) {
  const firstResult = await scrapeFirstResultForQuery(query);
  results.push({
    query,
    ...firstResult,
    found: !!firstResult,
  });
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
