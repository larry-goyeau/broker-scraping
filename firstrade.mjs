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
// would let a same-ticker stock pass for the fund being looked up.
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

// Fund names are shortened inconsistently between sources ("Small Cap" against
// "Small-Ca"), so tokens are compared by prefix rather than equality.
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

// A ticker in the CSV can point at several ISINs (the same symbol is reused
// across venues and by unrelated funds), so a listing only earns an ISIN when
// its name genuinely matches.
const MIN_NAME_SCORE = 0.5;

function resolveIsin(tickerCandidates, ticker, scrapedName) {
  const candidates = tickerCandidates.get(ticker) || [];

  let bestIsin = null;
  let bestScore = 0;
  let runnerUpScore = 0;
  for (const candidate of candidates) {
    const score = nameScore(scrapedName, candidate.name);
    if (score > bestScore) {
      runnerUpScore = bestScore;
      bestScore = score;
      bestIsin = candidate.isin;
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  if (bestScore < MIN_NAME_SCORE) return null;
  // A tie means the name does not tell the funds sharing this ticker apart.
  if (bestScore === runnerUpScore) return null;
  return bestIsin;
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
  pages.find((candidate) => candidate.url().includes("firstrade.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/firstrade-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["GLD", "EWZ", "SPY"];
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

const outputPath = "parsed_json/firstrade-parsed.json";
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

function readInstrument() {
  return page.evaluate(() => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

    const bodyText = document.body.innerText || "";
    if (/please enter a valid symbol/i.test(bodyText)) {
      return { unknownSymbol: true };
    }

    const heading = document.querySelector("h1");
    const name = normalize(heading?.textContent);
    // The symbol and its listing venue sit in the row directly below the name.
    const metadata = heading?.nextElementSibling;
    const spans = metadata ? [...metadata.querySelectorAll(":scope > span")] : [];

    return {
      unknownSymbol: false,
      name,
      ticker: normalize(spans[0]?.textContent).toUpperCase(),
      exchange: normalize(spans[1]?.textContent),
    };
  });
}

// The heading occasionally carries the issuer's trust name ("ISHARES TRUST")
// instead of the fund name, which is too generic to match a single ISIN. The
// fundamentals endpoint backing the page keeps the real fund name.
async function fetchFundName(query) {
  const name = await page.evaluate(async (symbol) => {
    try {
      const response = await fetch(
        `/app/api/fundamental?symbol=${encodeURIComponent(symbol)}&sharesCorrection=true`,
        { credentials: "include" }
      );
      const payload = await response.json();
      return payload?.description || payload?.analystReport?.securityName || "";
    } catch {
      return "";
    }
  }, query);

  // Registered-trademark signs come back double-encoded from that endpoint.
  return name.replace(/\u00c2(?=[\u00ae\u00a9\u2122])/g, "").replace(/\s+/g, " ").trim();
}

async function scrapeInstrument(query) {
  const url = `https://invest.firstrade.com/app/stocks-etf/${encodeURIComponent(
    query.toLowerCase()
  )}/overview`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const maxWaitMs = 15000;
  const pollMs = 200;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    const state = await readInstrument();
    if (state.unknownSymbol) return null;
    if (state.ticker && state.name) return state;

    await sleep(pollMs);
    elapsed += pollMs;
  }

  return null;
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const parsed = await scrapeInstrument(query);
  // Guard against a page that resolved to some other symbol.
  if (parsed && parsed.ticker === query) {
    let name = parsed.name;
    let isin = resolveIsin(tickerCandidates, query, name);

    if (!isin) {
      const fundName = await fetchFundName(query);
      const fundIsin = fundName ? resolveIsin(tickerCandidates, query, fundName) : null;
      if (fundIsin) {
        name = fundName;
        isin = fundIsin;
      }
    }

    const key = `${query}:${parsed.ticker}`.toUpperCase();
    // Same ticker, different fund: not the one we asked about.
    if (isin && !seen.has(key)) {
      seen.add(key);
      results.push({
        query,
        ticker: parsed.ticker,
        name,
        exchange: parsed.exchange,
        // Firstrade lists US venues only, so every line quotes in dollars.
        currency: "USD",
        type: "ETF",
        raw: `${parsed.ticker} ${name} - ${parsed.exchange}`,
        isin,
      });
    }
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
