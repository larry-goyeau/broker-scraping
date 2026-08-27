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

// Captrader introduces the account onto IBKR's Client Portal, served from
// clientam.com just like MEXEM and WH SelfInvest, so the same portal bridge is
// used. The page is only there to lend its session to the calls.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("clientam.com")) ||
  (await browser.newPage());
await page.bringToFront();

if (!page.url().includes("clientam.com")) {
  await page.goto("https://www.clientam.com/portal/", {
    waitUntil: "domcontentloaded",
  });
  await sleep(5000);
}

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

const outputPath = new URL("../parsed_json/captrader-parsed.json", import.meta.url);
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

const API = "/portal.proxy/v1/portal";

async function api(path, options = {}) {
  return page.evaluate(
    async (base, p, opts) => {
      const response = await fetch(`${base}/${p}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: opts.method || "GET",
        body: opts.body || undefined,
      });
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, error: text.slice(0, 200) };
      }
    },
    API,
    path,
    options
  );
}

// Keeps the Client Portal bridge awake; without it, later calls start failing.
async function tickle() {
  await api("tickle").catch(() => null);
}

// The search the portal runs when a query is submitted rather than merely
// typed: `pattern: false` asks for the symbol itself instead of everything
// starting with it, which is what keeps unrelated companies out.
async function searchSymbol(query) {
  const answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol: query, pattern: false, referrer: "" }),
  });
  // An unknown symbol answers `{ error: "No symbol found" }`.
  return Array.isArray(answer.json) ? answer.json : null;
}

// The search says nothing about the currency, which is what separates the two
// London lines of one fund. The contract details do.
async function readInfo(conid) {
  if (!conid) return null;
  const answer = await api(`iserver/secdef/info?conid=${conid}`);
  return answer.json && !answer.json.error ? answer.json : null;
}

async function scrapeRowsForQuery(query) {
  let payload = await searchSymbol(query);
  if (!payload) payload = await searchSymbol(query);
  if (!payload) return [];

  const hits = payload
    .filter((entry) => (entry?.symbol || "").toUpperCase() === query)
    .filter((entry) =>
      (entry.sections || []).some((section) => section?.secType === "STK")
    );

  const rows = [];
  for (const entry of hits) {
    const exchange = (entry.description || "").trim();
    const heading = (entry.companyHeader || entry.companyName || "").trim();
    // The exact search suffixes the listing venue onto the company name
    // ("SPDR GOLD SHARES - ARCA"), which the fuzzy search leaves off.
    const suffix = ` - ${exchange}`;
    const name =
      exchange && heading.endsWith(suffix)
        ? heading.slice(0, -suffix.length).trim()
        : heading;
    if (!name) continue;

    const info = (await readInfo(entry.conid)) || {};

    rows.push({
      ticker: (entry.symbol || "").toUpperCase(),
      name,
      exchange,
      currency: info.currency || null,
      type: "ETF",
      raw: heading,
    });
  }

  return rows;
}

console.error(`${queries.length} tickers to check`);

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  if (queryIndex % 20 === 0) await tickle();
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

  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
