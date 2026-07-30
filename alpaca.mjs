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
  pages.find((candidate) => candidate.url().includes("app.alpaca.markets")) ||
  (await browser.newPage());

if (!page.url().includes("app.alpaca.markets")) {
  await page.goto("https://app.alpaca.markets/", {
    waitUntil: "domcontentloaded",
  });
}
await page.bringToFront();

async function findMainSearchInput() {
  const inputs = await page.$$('input[placeholder="Search by symbol..."]');
  let best = null;
  let bestBox = null;

  for (const input of inputs) {
    const box = await input.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      await input.dispose();
      continue;
    }

    // The global search is the uppermost matching input; the order form also
    // contains a narrower input with the same placeholder.
    if (!bestBox || box.y < bestBox.y) {
      if (best) await best.dispose();
      best = input;
      bestBox = box;
    } else {
      await input.dispose();
    }
  }

  if (!best) throw new Error("Could not find Alpaca's main symbol search input.");
  return best;
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/alpaca-parsed.json.
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

const outputPath = "parsed_json/alpaca-parsed.json";
const results = [];
const seen = new Set();

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

async function scrapeRowsForQuery(query) {
  let searchInput = await findMainSearchInput();

  // Clear the controlled React input and notify the application.
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
  await searchInput.type(query, { delay: 30 });
  await searchInput.dispose();

  const collectRows = () =>
    page.evaluate(() => {
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

      return [...document.querySelectorAll('[data-asset-item="true"]')]
        .map((item) => {
          const button = item.querySelector("button");
          if (!button) return null;

          const tickerElement = [...button.querySelectorAll("*")].find((element) => {
            const text = normalize(element.textContent).toUpperCase();
            return (
              element.children.length === 0 &&
              element.classList.contains("text-sm") &&
              element.classList.contains("font-semibold") &&
              /^[A-Z][A-Z0-9.-]{0,14}$/.test(text)
            );
          });
          const ticker = normalize(tickerElement?.textContent).toUpperCase();
          const name = normalize(button.lastElementChild?.textContent);
          if (!ticker || !name) return null;

          return {
            ticker,
            name,
            type: "ETF",
            raw: normalize(button.innerText || button.textContent),
          };
        })
        .filter(Boolean);
    });

  const maxWaitMs = 3000;
  const pollMs = 200;
  let elapsed = 0;
  let emptyPolls = 0;

  while (elapsed < maxWaitMs) {
    await sleep(pollMs);
    elapsed += pollMs;

    const rows = await collectRows();
    const matches = rows.filter((row) => row.ticker === query);
    if (matches.length > 0) return matches;

    if (rows.length === 0) emptyPolls += 1;
    else emptyPolls = 0;

    if (elapsed >= 800 && emptyPolls >= 3) return [];
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

    const key = `${query}:${row.ticker}`.toUpperCase();
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
