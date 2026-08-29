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

// The page is only there to lend its signed-in session to the calls below.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("trading.sogotrade.com")) ||
  (await browser.newPage());

if (!page.url().includes("trading.sogotrade.com")) {
  await page.goto("https://trading.sogotrade.com/", {
    waitUntil: "domcontentloaded",
  });
  await sleep(3000);
}

// The trading page raises alerts of its own, and an open dialog would freeze
// every call made through it.
page.on("dialog", async (dialog) => {
  await dialog.dismiss();
});

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to sogotrade-parsed.json.
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

const outputPath = new URL("sogotrade-parsed.json", import.meta.url);
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

// The service behind the trading page's own symbol box. It takes a list of
// items in one call, which is what lets a whole run be a handful of calls
// rather than a page interaction per ticker.
const BATCH_SIZE = 500;

async function fetchFundamentals(symbols) {
  const answer = await page.evaluate(async (batch) => {
    try {
      const response = await fetch(
        "/Sogo.Shared.Services.dll/Snapshot.asmx/RequestSnapshot",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            items: batch.map((symbol) => `/SymbolFundamental|${symbol}`),
          }),
        }
      );
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, error: text.slice(0, 200) };
      }
    } catch (error) {
      return { error: String(error) };
    }
  }, symbols);

  // A signed-out session is served the login page instead of an answer, so
  // anything that is not the expected envelope counts as no answer at all.
  if (!answer.json?.d) return null;

  const fundamentals = new Map();
  for (const symbol of symbols) {
    const data = answer.json.d[`/SymbolFundamental|${symbol}`];
    // A symbol SogoTrade does not carry says so: "Underlying provider
    // returned null".
    if (!data || data.CreationIssue || !data.Name) continue;
    fundamentals.set(symbol, data);
  }
  return fundamentals;
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.error(`${queries.length} tickers to check`);

let silences = 0;

for (let offset = startIndex - 1; offset < queries.length; offset += BATCH_SIZE) {
  const batch = queries.slice(offset, offset + BATCH_SIZE);

  const fundamentals = await fetchFundamentals(batch);
  if (fundamentals === null) {
    silences += 1;
    console.error(`[${offset + 1}-${offset + batch.length}] no answer`);
    if (silences >= 3) {
      throw new Error("SogoTrade stopped answering. Is the session still signed in?");
    }
    continue;
  }
  silences = 0;

  for (const [batchIndex, query] of batch.entries()) {
    console.error(`[${offset + batchIndex + 1}/${queries.length}] ${query}`);

    const data = fundamentals.get(query);
    if (!data) continue;

    const ticker = (data.Symbol || query).toUpperCase();
    if (ticker !== query) continue;

    const name = (data.Name || "").replace(/\s+/g, " ").trim();

    // The list is keyed by ticker, and a US ticker often belongs to a
    // different fund than the one the list files under it. Keeping only rows
    // whose name matches a candidate is what stops those from being mixed up.
    const isin = resolveIsin(tickerCandidates, ticker, name);
    if ((tickerCandidates.get(ticker) || []).length > 0 && !isin) continue;

    // A name can match by coincidence: the list files AMZN as a 1x Amazon
    // tracker ETP, and matching on "Amazon" lands on Amazon the company. Funds
    // are left unclassified here ("" or "NC") or filed vaguely as "Other",
    // while an operating company gets a real sector, so that is the one thing
    // in the answer that gives a collision away.
    const sector = (data.Sector || "").trim();
    if (sector && sector !== "NC" && sector !== "Other") {
      console.error(`  ${ticker} is ${name} here, not a fund — skipped`);
      continue;
    }

    const key = `${query}:${ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const exchange = (data.Exchange || "").replace(/\s+/g, " ").trim().toUpperCase();

    results.push({
      query,
      ticker,
      name,
      exchange: exchange || null,
      // SogoTrade is a US broker and every venue it quotes here (NASDAQ, NYSE,
      // NYSE ARCA, the OTC tiers) prices in dollars; nothing in the answer
      // states it.
      currency: "USD",
      type: "ETF",
      raw: [ticker, name, exchange].filter(Boolean).join(" "),
      isin,
    });
  }

  // Persist progress after every batch so an interruption keeps prior work.
  save();
}

save();
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
