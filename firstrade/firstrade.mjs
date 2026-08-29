import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

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

// The page is only there to lend its signed-in session to the calls below.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("firstrade.com")) ||
  (await browser.newPage());

if (!page.url().includes("firstrade.com")) {
  await page.goto("https://invest.firstrade.com/app/dashboard", {
    waitUntil: "domcontentloaded",
  });
  await sleep(3000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to firstrade-parsed.json.
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
  return new URL("../etfs.csv", import.meta.url);
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

const outputPath = new URL("firstrade-parsed.json", import.meta.url);
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

async function api(path) {
  return page.evaluate(async (target) => {
    try {
      const response = await fetch(target, {
        credentials: "include",
        headers: { Accept: "application/json, text/plain, */*" },
      });
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, error: text.slice(0, 160) };
      }
    } catch (error) {
      return { error: String(error) };
    }
  }, path);
}

// The quote the overview page is built from: it names the fund, states the
// listing venue and marks whether the symbol is an ETF, so the page itself
// never has to be rendered.
async function fetchQuote(query) {
  const answer = await api(`/app/api/quote?q=${encodeURIComponent(query)}`);
  const payload = answer.json;
  // A signed-out session is answered with the login page rather than an error,
  // so anything that is not JSON counts as no answer at all.
  if (!payload) return { silent: true };
  // An unknown symbol is refused with reference code 2071 under HTTP 200.
  if (payload.refCode === 2071 || payload.statusCode === 400) return { unknown: true };
  if (payload.statusCode || !payload.symbol) return { silent: true };
  return { quote: payload };
}

// The quote occasionally carries the issuer's trust name ("ISHARES TRUST")
// instead of the fund name, which is too generic to match a single ISIN. The
// fundamentals endpoint backing the same page keeps the real fund name.
async function fetchFundName(query) {
  const answer = await api(
    `/app/api/fundamental?symbol=${encodeURIComponent(query)}&sharesCorrection=true`
  );
  const payload = answer.json || {};
  const name = payload.description || payload.analystReport?.securityName || "";

  // Registered-trademark signs come back double-encoded from that endpoint.
  return normalize(name.replace(/\u00c2(?=[\u00ae\u00a9\u2122])/g, ""));
}

console.error(`${queries.length} tickers to check`);

let silences = 0;

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const answer = await fetchQuote(query);
  if (answer.silent) {
    silences += 1;
    console.error("  no answer");
    if (silences >= 5) {
      throw new Error("Firstrade stopped answering. Is the session still signed in?");
    }
    continue;
  }
  silences = 0;
  // Firstrade lists US venues only, so most of the CSV is not quoted here.
  if (answer.unknown) continue;

  const quote = answer.quote;
  const ticker = normalize(quote.symbol).toUpperCase();

  // Guard against a quote that resolved to some other symbol.
  if (ticker === query) {
    let name = normalize(quote.companyName);
    let isin = resolveIsin(tickerCandidates, query, name);

    if (!isin) {
      const fundName = await fetchFundName(query);
      const fundIsin = fundName ? resolveIsin(tickerCandidates, query, fundName) : null;
      if (fundIsin) {
        name = fundName;
        isin = fundIsin;
      }
    }

    const exchange = normalize(quote.exchange);
    const key = `${query}:${ticker}`.toUpperCase();
    // Same ticker, different fund: not the one we asked about.
    if (isin && !seen.has(key)) {
      seen.add(key);
      results.push({
        query,
        ticker,
        name,
        exchange,
        // Firstrade lists US venues only, so every line quotes in dollars: no
        // endpoint behind the app states a currency at all.
        currency: "USD",
        type: quote.isEtf ? "ETF" : "STOCK",
        raw: `${ticker} ${name} - ${exchange}`,
        isin,
      });
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
