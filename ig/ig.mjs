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

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("deal.ig.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/ig-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

const csvQueries = loadIsinsFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = new URL("../parsed_json/ig-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

// When resuming, load already-saved entries so earlier progress is preserved.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        const key = entry?.ticker
          ? `${entry.query}:TICKER:${entry.ticker}`.toUpperCase()
          : entry?.raw
            ? `${entry.query}:RAW:${entry.raw}`.toUpperCase()
            : null;
        if (key) seen.add(key);
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

async function scrapeRowsForQuery(query) {
  const url = `https://deal.ig.com/eu/web-platform/search/etfs?q=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const maxWaitMs = 8000;
  const pollMs = 250;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    const state = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("tbody tr")].filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const bodyText = document.body.innerText || "";
      const noResults =
        /\b0\s+r[ée]sultat/i.test(bodyText) ||
        /aucun r[ée]sultat|no results|0 results/i.test(bodyText);
      return { hasRows: rows.length > 0, noResults };
    });

    if (state.hasRows || state.noResults) break;
    await sleep(pollMs);
    elapsed += pollMs;
  }

  return page.evaluate(() => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

    return [...document.querySelectorAll("tbody tr")]
      .map((row) => {
        const rect = row.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const firstCell = row.querySelector("td");
        if (!firstCell) return null;

        const titledSpans = [...firstCell.querySelectorAll("span[title]")];
        const ticker = normalize(
          titledSpans[0]?.getAttribute("title") || titledSpans[0]?.textContent
        ).toUpperCase();
        const name = normalize(
          titledSpans[1]?.getAttribute("title") || titledSpans[1]?.textContent
        );
        if (!ticker || !name) return null;

        return {
          ticker,
          name,
          type: "ETF",
          raw: normalize(row.innerText),
        };
      })
      .filter(Boolean);
  });
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const rows = await scrapeRowsForQuery(query);
  for (const row of rows) {
    const key = `${query}:TICKER:${row.ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ...row,
      isin: query,
    });
  }

  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
