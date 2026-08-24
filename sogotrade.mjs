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
  pages.find((candidate) => candidate.url().includes("trading.sogotrade.com")) ||
  (await browser.newPage());

if (!page.url().includes("trading.sogotrade.com")) {
  await page.goto("https://trading.sogotrade.com/", {
    waitUntil: "domcontentloaded",
  });
}
await page.bringToFront();

const frame = page.mainFrame();
const symbolInputSelector =
  "#ctl00_ctl00_FormContent_Content_PlaceOrder_StockSymbol";
const quoteSymbolSelector =
  "#ctl00_ctl00_FormContent_Content_StockQuote1_LabelSymbol";
const quoteNameSelector =
  "#ctl00_ctl00_FormContent_Content_StockQuote1_LabelCompanyName";

page.on("dialog", async (dialog) => {
  await dialog.dismiss();
});

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/sogotrade-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["SPY", "EWZ", "IAU"];
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

const outputPath = "parsed_json/sogotrade-parsed.json";
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

async function scrapeInstrument(query) {
  await frame.waitForSelector(symbolInputSelector, {
    visible: true,
    timeout: 8000,
  });

  // Use SogoTrade's own symbol API. Manipulating the legacy autocomplete or
  // Go button can leave its private symbol state out of sync with the textbox.
  await frame.evaluate((ticker) => {
    window.stockInfoHelper.setSymbol(ticker, { updateShares: false });
  }, query);

  // SogoTrade updates the ticker label before the company name. Let the
  // legacy AJAX callback settle so fields from two symbols are not combined.
  await sleep(250);

  const maxWaitMs = 3000;
  const pollMs = 150;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    const loaded = await frame.evaluate(
      (symbolSelector, nameSelector) => ({
        ticker: (
          document.querySelector(symbolSelector)?.textContent || ""
        ).trim().toUpperCase(),
        name: (document.querySelector(nameSelector)?.textContent || "").trim(),
      }),
      quoteSymbolSelector,
      quoteNameSelector
    );

    if (loaded.ticker === query && loaded.name) {
      return frame.evaluate(
        (symbolSelector, nameSelector) => {
          const normalize = (value) =>
            (value || "").replace(/\s+/g, " ").trim();
          const ticker = normalize(
            document.querySelector(symbolSelector)?.textContent
          ).toUpperCase();
          const name = normalize(
            document.querySelector(nameSelector)?.textContent
          );
          const quotePanel = document.querySelector(
            "#ctl00_ctl00_FormContent_Content_StockQuote1"
          );
          if (!ticker || !name) return null;

          return {
            ticker,
            name,
            // SogoTrade is a US broker quoting US listings in dollars.
            currency: "USD",
            type: "ETF",
            raw: normalize(quotePanel?.innerText || `${ticker} ${name}`),
          };
        },
        quoteSymbolSelector,
        quoteNameSelector
      );
    }

    await sleep(pollMs);
    elapsed += pollMs;
  }

  return null;
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const parsed = await scrapeInstrument(query);
  if (parsed && parsed.ticker === query) {
    const isin = resolveIsin(tickerCandidates, parsed.ticker, parsed.name);
    if ((tickerCandidates.get(parsed.ticker) || []).length === 0 || isin) {
      const key = `${query}:${parsed.ticker}`.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          query,
          ...parsed,
          isin,
        });
      }
    }
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
