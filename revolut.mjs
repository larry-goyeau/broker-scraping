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

function loadTickersFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  return fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .map((line) => normalizeTicker(line))
    .filter(Boolean);
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
  if (candidates.length === 1) return candidates[0].isin;

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

  return bestCandidate.isin;
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
  pages.find((candidate) => candidate.url().includes("invest.revolut.com")) ||
  (await browser.newPage());

if (!page.url().includes("invest.revolut.com")) {
  await page.goto("https://invest.revolut.com/", {
    waitUntil: "domcontentloaded",
  });
}
await page.bringToFront();

async function ensureSearchInput() {
  const selector =
    '[role="dialog"][aria-label="Asset list modal window"] input[type="search"][aria-label="Search"]';
  let input = await page.$(selector);
  if (input) return input;

  const trigger = await page.$('button[aria-label="Browse assets"]');
  if (!trigger) throw new Error("Could not find Revolut's Browse assets button.");
  await trigger.click();
  input = await page.waitForSelector(selector, { visible: true, timeout: 8000 });
  return input;
}

async function selectEtpFilter() {
  await page.evaluate(() => {
    const dialog = document.querySelector(
      '[role="dialog"][aria-label="Asset list modal window"]'
    );
    const button = [...(dialog?.querySelectorAll("button") || [])].find(
      (candidate) => (candidate.innerText || "").trim() === "ETPs"
    );
    if (button && !button.hasAttribute("data-active")) button.click();
  });
  await sleep(200);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/revolut-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IUSZ", "EWY", "ACWI"];
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

const outputPath = "parsed_json/revolut-parsed.json";
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
  let searchInput = await ensureSearchInput();
  await selectEtpFilter();
  searchInput = await ensureSearchInput();

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

  const collectRows = () =>
    page.evaluate(() => {
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
      const dialog = document.querySelector(
        '[role="dialog"][aria-label="Asset list modal window"]'
      );

      return [...(dialog?.querySelectorAll("tbody tr") || [])]
        .map((row) => {
          const tickerCell = row.querySelector('td[data-column-id="ticker"]');
          const typeCell = row.querySelector('td[data-column-id="type"]');
          const type = normalize(typeCell?.innerText || typeCell?.textContent).toUpperCase();
          const tickerAndName = normalize(
            tickerCell?.innerText || tickerCell?.textContent
          );
          const ticker = tickerAndName.split(/\s+/)[0]?.toUpperCase() || "";
          const name = tickerAndName.slice(ticker.length).trim();

          if (!ticker || !name || !/^(ETF|ETC|ETN|ETP)$/.test(type)) return null;
          return {
            ticker,
            name,
            type,
            raw: normalize(row.innerText || row.textContent),
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

    // Revolut clears the old rows after its debounced search completes.
    if (elapsed >= 800 && emptyPolls >= 3) return [];
  }

  return [];
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const rows = await scrapeRowsForQuery(query);
  for (const row of rows) {
    const key = `${query}:${row.ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ...row,
      isin: resolveIsin(tickerCandidates, row.ticker, row.name),
    });
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
