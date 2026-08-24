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

// XTB result rows render as: "<name> <TYPE> <SYMBOL>, <issuer>, <details...>"
// e.g. "Edge MSCI USA Val Fctr ETF IUVD.UK, iShares, UCITS, DIST, USD".
const XTB_TYPE_RE =
  /\b(ETF|ETC|CFD|STOCK|ACTION|INDEX|INDICES|CRYPTO|FOREX|COMMODITY|COMMODITIES|BOND|FUND)\b/i;

function parseXtbRow(text) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (/aucun r[ée]sultat|no results|couldn['’]t find/i.test(compact)) return null;

  const typeMatch = compact.match(XTB_TYPE_RE);
  if (!typeMatch) return null;

  const name = compact.slice(0, typeMatch.index).trim();
  if (name.length < 2) return null;

  const rest = compact.slice(typeMatch.index + typeMatch[0].length).trim();
  // The symbol is the first token of the subtitle (before the first comma).
  const symbolMatch = rest.match(/^([A-Z0-9][A-Z0-9._-]{0,14})\b/i);
  if (!symbolMatch) return null;

  const symbol = symbolMatch[1].toUpperCase();
  const suffixIndex = symbol.lastIndexOf(".");
  const ticker = suffixIndex > 0 ? symbol.slice(0, suffixIndex) : symbol;
  const exchange = suffixIndex > 0 ? symbol.slice(suffixIndex + 1) : null;
  const type = typeMatch[1].toUpperCase();

  // The subtitle closes on the trading currency, which is what separates the
  // two lines of one fund: "... UCITS, ACC, EUR" against "... ACC, USD".
  const lastPart = rest.split(",").pop()?.trim().toUpperCase() || "";
  const currency = /^(?:[A-Z]{3}|GBX)$/.test(lastPart) ? lastPart : null;

  return {
    ticker,
    exchange,
    currency,
    name,
    type,
    raw: compact,
  };
}

const SEARCH_INPUT_SELECTOR =
  'input[data-testid="instrument-search-input-field"], input[placeholder*="parmi les instruments" i]';

// XTB renders instrument search in nested open shadow roots. Normal
// querySelector/page.$ calls cannot reach it.
async function findDeepElement(page, selector) {
  const handle = await page.evaluateHandle((cssSelector) => {
    const roots = [document];
    while (roots.length > 0) {
      const root = roots.shift();
      const match = root.querySelector(cssSelector);
      if (match) {
        const rect = match.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return match;
      }
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    return null;
  }, selector);

  const element = handle.asElement();
  if (!element) await handle.dispose();
  return element;
}

async function ensureXtbSearchInput(page) {
  let searchInput = await findDeepElement(page, SEARCH_INPUT_SELECTOR);
  if (searchInput) return searchInput;

  // Open the full Instruments dialog from the Market Watch search trigger.
  await page.evaluate(() => {
    const roots = [document];
    while (roots.length > 0) {
      const root = roots.shift();
      const trigger = root.querySelector(".instrument-search-trigger");
      if (trigger) {
        trigger.click();
        return;
      }
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
  });

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    await sleep(200);
    searchInput = await findDeepElement(page, SEARCH_INPUT_SELECTOR);
    if (searchInput) return searchInput;
  }

  throw new Error("Could not locate the XTB Instruments dialog search input.");
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((p) => /xtb\.com|xstation/i.test(p.url())) || (await browser.newPage());

if (!/xtb\.com|xstation/i.test(page.url())) {
  await page.goto("https://xstation5.xtb.com/", { waitUntil: "domcontentloaded" });
}

await page.bringToFront();
let searchInput = await ensureXtbSearchInput(page);

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/xtb-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);
// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
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

async function scrapeRowsForQuery(query) {
  // Re-acquire the input each time: the search dialog can re-render between
  // queries, which would leave us holding a stale (detached) handle.
  searchInput = (await findDeepElement(page, SEARCH_INPUT_SELECTOR)) ||
    (await ensureXtbSearchInput(page));

  // Clear with the native value setter and notify Angular. Keyboard selection
  // is unreliable in this web component and previously appended every query.
  await searchInput.evaluate((input) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    valueSetter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  });
  await searchInput.type(query, { delay: 40 });

  const collectRows = () =>
    page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const roots = [document];
      const texts = [];

      while (roots.length > 0) {
        const root = roots.shift();
        for (const row of root.querySelectorAll(
          '[data-testid="instruments-list-item"]'
        )) {
          const text = norm(row.innerText || row.textContent);
          if (text) texts.push(text);
        }
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }

      return [...new Set(texts)];
    });

  // Results stream in after typing; wait until the row count is stable for a
  // couple consecutive polls, or a "no results" state appears.
  const maxWaitMs = 4000;
  const pollMs = 250;
  const stableNeeded = 3;
  let elapsed = 0;
  let lastCount = -1;
  let stableHits = 0;
  let rowTexts = [];

  while (elapsed < maxWaitMs) {
    await sleep(pollMs);
    elapsed += pollMs;

    rowTexts = await collectRows();
    if (rowTexts.length === lastCount && rowTexts.length > 0) {
      stableHits += 1;
      if (stableHits >= stableNeeded) break;
    } else {
      stableHits = 0;
      lastCount = rowTexts.length;
    }
  }

  return rowTexts;
}

const results = [];
const seen = new Set();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync("parsed_json/xtb-parsed.json")) {
  try {
    const existing = JSON.parse(fs.readFileSync("parsed_json/xtb-parsed.json", "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        const key =
          entry?.ticker
            ? `${entry.query}:TICKER:${entry.ticker.toUpperCase()}`
            : entry?.raw
              ? `${entry.query}:RAW:${entry.raw.toUpperCase()}`
              : null;
        if (key) seen.add(key);
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);
  const rowTexts = await scrapeRowsForQuery(query);
  for (const text of rowTexts) {
    const parsed = parseXtbRow(text);
    if (!parsed) continue;

    const key = parsed.ticker
      ? `${query}:TICKER:${parsed.ticker.toUpperCase()}`
      : `${query}:RAW:${(parsed.raw || "").toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ...parsed,
      isin: query,
    });
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync("parsed_json/xtb-parsed.json", JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
