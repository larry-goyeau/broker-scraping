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

// The page is only there to lend its signed-in session to the calls below.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("mydavy.ie")) ||
  (await browser.newPage());

if (!page.url().includes("mydavy.ie")) {
  await page.goto("https://www.mydavy.ie/trading.htm", { waitUntil: "domcontentloaded" });
  await sleep(3000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/davy-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B6R52259", "IE00B4L5Y983", "IE00B5BMR087"];
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const csvQueries = loadIsinsFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = "parsed_json/davy-parsed.json";
const results = [];
const seen = new Set();

function entryKey(query, row) {
  return `${query}:${row.ticker}:${row.exchange}:${row.currency || ""}`.toUpperCase();
}

// When resuming, load already-saved entries so earlier progress is preserved.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) seen.add(entryKey(entry.query, entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const SEARCH_URL = "https://www.mydavy.ie/api/search/tradeProductSearch";

// The lookup the ticket runs as the search box is typed into. `tradeType` picks
// the universe, and the ETF tab spells it `etfs`: the constant the app's own
// code carries ("ETF") is accepted but answers empty, ISIN or not.
async function fetchListings(isin) {
  const answer = await page.evaluate(
    async (url, term) => {
      const response = await fetch(
        `${url}?search=${encodeURIComponent(term)}&selling=false&tradeType=etfs`,
        { credentials: "include", headers: { Accept: "application/json, text/plain, */*" } }
      );
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, error: text.slice(0, 160) };
      }
    },
    SEARCH_URL,
    isin
  );

  // A signed-out session is answered with the login page rather than an error,
  // so anything that is not a list counts as no answer at all.
  return Array.isArray(answer.json) ? answer.json : null;
}

function parseListing(entry, query) {
  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

  const isin = toIsin(entry?.isin);
  if (isin !== query) return null;

  const code = normalize(entry?.code).toUpperCase();
  const name = normalize(entry?.name);
  if (!code || !name) return null;

  const exchange = normalize(entry?.exchange);
  const currency = normalize(entry?.currency).toUpperCase() || null;

  return {
    // Codes carry a venue suffix ("IWDA.L"), which the exchange already states.
    ticker: code.split(".")[0],
    name,
    exchange,
    currency,
    type: normalize(entry?.assetType).toUpperCase() || "ETF",
    raw: [name, code, isin, exchange, currency].filter(Boolean).join(" "),
  };
}

console.error(`${queries.length} ISINs to check`);

let silences = 0;

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const listings = await fetchListings(query);
  if (!listings) {
    silences += 1;
    console.error("  no answer");
    if (silences >= 5) {
      throw new Error("myDavy stopped answering. Is the session still signed in?");
    }
    continue;
  }
  silences = 0;

  for (const entry of listings) {
    const row = parseListing(entry, query);
    if (!row) continue;

    const key = entryKey(query, row);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ...row,
      isin: query,
    });
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
