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
  return (afterExchange || "").split("/")[0].trim();
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

function nameTokens(value) {
  const ignored = new Set([
    "ISHARES",
    "ETF",
    "ETC",
    "ETN",
    "ETP",
    "UCITS",
    "PLC",
    "FUND",
    "SHARES",
  ]);

  return new Set(
    (value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length > 1 && !ignored.has(token))
  );
}

function resolveIsin(tickerCandidates, ticker, scrapedName) {
  const candidates = tickerCandidates.get(ticker) || [];
  if (candidates.length === 0) return null;

  const scrapedTokens = nameTokens(scrapedName);
  let bestCandidate = candidates[0];
  let bestScore = -1;

  for (const candidate of candidates) {
    const candidateTokens = nameTokens(candidate.name);
    const score = [...scrapedTokens].filter((token) => candidateTokens.has(token)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestScore > 0 ? bestCandidate.isin : null;
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
  pages.find((candidate) => candidate.url().includes("easyequities.io")) ||
  (await browser.newPage());

if (!page.url().includes("easyequities.io")) {
  await page.goto(
    "https://invest-now.apps.easyequities.io/instrument/diy/etfsexpanded",
    { waitUntil: "domcontentloaded" }
  );
}
await page.bringToFront();

const searchInputSelector =
  'input[placeholder="Search all available instruments..."][aria-label="Search"]';
await page.waitForSelector(
  'app-bundle-card img.invest-card-img[src*="/logos/EQU."]',
  { visible: true, timeout: 10000 }
);

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress saved to parsed_json/easyequities-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IAU", "SPY", "ACWI"];
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

const outputPath = "parsed_json/easyequities-parsed.json";
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) {
          seen.add(`${entry.query}:${entry.market}:${entry.ticker}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

async function collectCards() {
  return page.evaluate(() => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

    return [...document.querySelectorAll("app-bundle-card")]
      .map((card) => {
        const logo = card.querySelector(
          'img.invest-card-img[src*="/logos/EQU."]'
        );
        if (!logo) return null;

        let filename = "";
        try {
          filename = decodeURIComponent(new URL(logo.src).pathname.split("/").pop());
        } catch {
          return null;
        }

        const symbolMatch = filename.match(/^EQU\.([A-Z]+)\.(.+)\.png$/i);
        if (!symbolMatch) return null;

        const market = symbolMatch[1].toUpperCase();
        const ticker = symbolMatch[2].toUpperCase();

        // The visible name is rendered inside the logo image, but Angular also
        // supplies the same name in this hidden fallback span.
        const name = normalize(
          card.querySelector("span.invest-card-img")?.textContent
        );
        if (!ticker || !name) return null;

        const type = /\bETC\b/i.test(name)
          ? "ETC"
          : /\bETN\b/i.test(name)
            ? "ETN"
            : "ETF";

        return {
          ticker,
          market,
          name,
          type,
          raw: `${ticker} ${name} ${market}`,
        };
      })
      .filter(Boolean);
  });
}

async function scrapeRowsForQuery(query) {
  const searchInput = await page.waitForSelector(searchInputSelector, {
    visible: true,
    timeout: 8000,
  });

  const normalizedQuery = query.toLowerCase();
  const searchResponse = page
    .waitForResponse(
      (response) => {
        const request = response.request();
        if (
          request.method() !== "POST" ||
          !request.url().includes("/easyequities/investnow/search")
        ) {
          return false;
        }

        try {
          const payload = JSON.parse(request.postData() || "{}");
          return payload.searchValue === normalizedQuery;
        } catch {
          return false;
        }
      },
      { timeout: 5000 }
    )
    .catch(() => null);

  await searchInput.evaluate((input, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    valueSetter.call(input, value);
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, normalizedQuery);

  // Wait for this query's API response, not merely for any (possibly stale)
  // card to be present.
  await searchResponse;

  const maxWaitMs = 1200;
  const pollMs = 100;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    await sleep(pollMs);
    elapsed += pollMs;

    const cards = await collectCards();
    const matches = cards.filter((card) => card.ticker === query);
    if (matches.length > 0) return matches;
  }

  return [];
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const rows = await scrapeRowsForQuery(query);
  for (const row of rows) {
    const isin = resolveIsin(tickerCandidates, row.ticker, row.name);
    if ((tickerCandidates.get(row.ticker) || []).length > 0 && !isin) continue;

    const key = `${query}:${row.market}:${row.ticker}`.toUpperCase();
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
