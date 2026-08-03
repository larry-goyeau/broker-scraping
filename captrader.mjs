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

function loadTickerCandidatesFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const candidate = {
      isin: toIsin(columns[isinIndex]),
      name: columns.slice(isinIndex + 1).join(",").trim(),
    };
    const candidates = map.get(ticker) || [];
    if (!candidates.some((existing) => existing.isin === candidate.isin)) {
      candidates.push(candidate);
      map.set(ticker, candidates);
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated companies, so counting them
// would let "Gold Finder Resources Ltd" pass for "New Gold Issuer Ltd."
const GENERIC_TOKENS = new Set([
  "LTD",
  "LIMITED",
  "PLC",
  "INC",
  "CORP",
  "CORPORATION",
  "LLC",
  "GMBH",
  "THE",
  "CO",
]);

function nameTokens(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

// IBKR abbreviates fund names to fit a fixed width ("ISH S&P500 UT SEC UCIT
// ETF"), so tokens are compared by prefix rather than equality.
function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return 0;

  const used = new Set();
  let matched = 0;
  for (const token of scraped) {
    const index = candidate.findIndex(
      (other, position) => !used.has(position) && tokensMatch(token, other)
    );
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }

  return matched / Math.min(scraped.length, candidate.length);
}

// A ticker on IBKR can belong to several unrelated instruments (GLD is both
// SPDR Gold Shares and Gold Finder Resources), so a listing only earns the
// CSV's ISIN when its name genuinely matches.
const MIN_NAME_SCORE = 0.5;

function resolveIsin(tickerCandidates, ticker, scrapedName) {
  const candidates = tickerCandidates.get(ticker) || [];

  let bestIsin = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = nameScore(scrapedName, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      bestIsin = candidate.isin;
    }
  }

  return bestScore >= MIN_NAME_SCORE ? bestIsin : null;
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
  pages.find((candidate) => candidate.url().includes("clientam.com")) ||
  (await browser.newPage());

if (!page.url().includes("clientam.com")) {
  await page.goto("https://www.clientam.com/portal/", {
    waitUntil: "domcontentloaded",
  });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/captrader-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["GLD", "EWY", "IUUS"];
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
const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = "parsed_json/captrader-parsed.json";
const results = [];
const seen = new Set();

const entryKey = (query, row) =>
  `${query}:${row.ticker}:${row.exchange}:${row.name}`.toUpperCase();

// When resuming, load already-saved entries so earlier progress is preserved.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entryKey(entry.query, entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const searchInputSelector = "#cp-ib-bar-sl-input";

// Submitting the search detaches the field while the results panel renders.
async function ensureSearchInput() {
  await page.waitForSelector(searchInputSelector, { visible: true, timeout: 30000 });
}

await ensureSearchInput();

async function setInputValue(value) {
  await page.evaluate(
    (selector, text) => {
      const input = document.querySelector(selector);
      if (!input) return;
      // The portal tracks the field through its own value setter, so assigning
      // `input.value` directly would leave its model unchanged.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    searchInputSelector,
    value
  );
}

// Typing runs a fuzzy prefix search (`pattern: true`) that also matches other
// symbols; submitting the query runs an exact-symbol search. Both hit the same
// endpoint, so they are told apart by the request body.
function waitForSearchResponse(query, { exact }, timeoutMs) {
  return page
    .waitForResponse(
      (response) => {
        if (!response.url().includes("/iserver/secdef/search")) return false;
        try {
          const body = JSON.parse(response.request().postData() || "{}");
          if (body.symbol !== query) return false;
          return exact ? !body.pattern : Boolean(body.pattern);
        } catch {
          return false;
        }
      },
      { timeout: timeoutMs }
    )
    .catch(() => null);
}

async function submitQuery(query) {
  const focused = await page.evaluate((selector) => {
    const input = document.querySelector(selector);
    if (!input) return false;
    input.focus();
    return document.activeElement === input;
  }, searchInputSelector);
  if (!focused) return false;

  await page.keyboard.press("Enter");
  return true;
}

// Runs the exact-symbol lookup the portal performs when the query is submitted.
async function fetchExactListings(query) {
  await ensureSearchInput();

  // The portal ignores a term matching the one it last searched, so a rerun of
  // the query still in the box needs a different lookup to reset that state.
  // Blanking the field does not count, since an empty term is never searched.
  const alreadyShowing = await page.evaluate(
    (selector, value) => document.querySelector(selector)?.value === value,
    searchInputSelector,
    query
  );
  if (alreadyShowing) {
    const primer = query.length > 1 ? query.slice(0, -1) : `${query}Z`;
    const primerPending = waitForSearchResponse(primer, { exact: false }, 8000);
    await setInputValue(primer);
    await primerPending;
  }

  const suggestionsPending = waitForSearchResponse(query, { exact: false }, 15000);
  await setInputValue(query);
  // The query is only submittable once the suggestion lookup has answered.
  if (!(await suggestionsPending)) return null;

  const exactPending = waitForSearchResponse(query, { exact: true }, 15000);
  if (!(await submitQuery(query))) return null;

  const response = await exactPending;
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function scrapeRowsForQuery(query) {
  let payload = await fetchExactListings(query);
  if (!payload) payload = await fetchExactListings(query);

  if (!payload) {
    console.error(`  no search response for ${query}`);
    return [];
  }
  // An unknown symbol answers `{ error: "No symbol found" }`.
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((entry) => (entry?.symbol || "").toUpperCase() === query)
    .filter((entry) =>
      (entry.sections || []).some((section) => section?.secType === "STK")
    )
    .map((entry) => {
      const exchange = (entry.description || "").trim();
      const heading = (entry.companyHeader || entry.companyName || "").trim();
      // The exact search suffixes the listing venue onto the company name
      // ("SPDR GOLD SHARES - ARCA"), which the fuzzy search leaves off.
      const suffix = ` - ${exchange}`;
      const name =
        exchange && heading.endsWith(suffix)
          ? heading.slice(0, -suffix.length).trim()
          : heading;
      if (!name) return null;

      return {
        ticker: (entry.symbol || "").toUpperCase(),
        name,
        exchange,
        type: "ETF",
        raw: heading,
      };
    })
    .filter(Boolean);
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const rows = await scrapeRowsForQuery(query);
  for (const row of rows) {
    const isin = resolveIsin(tickerCandidates, query, row.name);
    // Same ticker, different company: not the fund we asked about.
    if (!isin) continue;

    const key = entryKey(query, row);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ...row,
      isin,
    });
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
