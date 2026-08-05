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
  pages.find((candidate) => candidate.url().includes("bitpanda.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/bitpanda-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B4L5Y983", "IE00B5BMR087", "IE00B4KBBD01"];
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

const outputPath = "parsed_json/bitpanda-parsed.json";
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

// The asset picker of the buy flow, which is where assets can be searched.
const SEARCH_URL =
  "https://app.bitpanda.com/?o=modal-buy&stepId=AssetSelection&tracking=trade_tab&assetFilter=ALL";
const SEARCH_INPUT = 'input[placeholder="Search assets"]';

async function openSearchModal() {
  // Reloading empties the in-app cache, so every query below reaches the
  // search call the asset type is read from.
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(SEARCH_INPUT, { timeout: 60000 });
}

// The rendered rows never mention the asset type, so it is picked up from the
// search call backing them. Results also come from an in-app cache that skips
// the network entirely, hence this only enriches what the DOM already gives.
let lastPayload = null;

page.on("response", async (response) => {
  if (!response.url().includes("graphql")) return;

  const request = response.request().postData() || "";
  if (!request.includes('"operationName":"AssetList"')) return;

  const searched = request.match(/"query":"([^"]*)"/)?.[1];
  if (!searched) return;

  try {
    const payload = await response.json();
    const types = new Map();
    for (const edge of payload?.data?.assets?.edges || []) {
      const symbol = (edge?.node?.symbol || "").toUpperCase();
      // "EquityEtfAsset" / "EquityEtcAsset" / "EquityStockAsset".
      const typename = edge?.node?.__typename || "";
      const type = typename.replace(/^Equity/, "").replace(/Asset$/, "").toUpperCase();
      if (symbol && type) types.set(symbol, type);
    }
    lastPayload = { query: searched, types };
  } catch {
    // A malformed payload just means the type stays unknown.
  }
});

function setSearchTerm(term) {
  return page.evaluate(
    (value, selector) => {
      const input = document.querySelector(selector);
      if (!input) return;
      // React owns the value, so it only reacts to a native setter plus event.
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    term,
    SEARCH_INPUT
  );
}

function readModal() {
  return page.evaluate((selector) => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
    const input = document.querySelector(selector);
    const modal = input?.closest('[role="dialog"]');
    if (!modal) return null;

    const text = normalize(modal.textContent);
    const rows = [...modal.querySelectorAll('[role="listitem"]')].map((row) => ({
      name: normalize(row.querySelector('[style*="grid-area: Name"]')?.textContent),
      ticker: normalize(row.querySelector('[style*="grid-area: Symbol"]')?.textContent).toUpperCase(),
    }));

    return { text, rows };
  }, SEARCH_INPUT);
}

async function searchIsin(query) {
  const showing = await page.$eval(SEARCH_INPUT, (input) => input.value).catch(() => null);

  // The modal can be dismissed part way through a run, so bring it back.
  if (showing === null) {
    await openSearchModal();
  } else if (showing === query) {
    // An unchanged value raises no input event, so a repeat needs a reset.
    await setSearchTerm("");
    await sleep(300);
  }

  await setSearchTerm(query);

  const maxWaitMs = 20000;
  const pollMs = 60;
  let previous = null;

  for (let waited = 0; waited < maxWaitMs; waited += pollMs) {
    await sleep(pollMs);
    const state = await readModal();
    if (!state) continue;

    // Both outcomes name the term they belong to, so neither can be mistaken
    // for the previous query's leftovers.
    if (state.text.includes(`No results for '${query}'`)) return [];
    if (!state.text.includes(`Showing results for '${query}'`)) continue;

    // Rows render empty as skeletons while the results load.
    const loaded =
      state.rows.length > 0 && state.rows.every((row) => row.name && row.ticker);
    if (!loaded) {
      previous = null;
      continue;
    }

    // Accept only once the same rows survive a second look, so rows still
    // showing for the previous term cannot be read as this one's.
    const signature = JSON.stringify(state.rows);
    if (previous === signature) return state.rows;
    previous = signature;
  }

  return [];
}

await openSearchModal();

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  lastPayload = null;
  const rows = await searchIsin(query);
  const types = lastPayload?.query === query ? lastPayload.types : null;

  for (const row of rows) {
    const key = `${query}:${row.ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ticker: row.ticker,
      name: row.name,
      type: types?.get(row.ticker) || "ETF",
      raw: `${row.name} ${row.ticker}`,
      isin: query,
    });
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
