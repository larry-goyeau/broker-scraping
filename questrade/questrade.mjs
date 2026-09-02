import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  // Canadian symbols keep their dots (`AAWH.U`, `AAA.P`); only the `TSX:` prefix
  // is a file convention, not part of the ticker Questrade files.
  return firstColumn.includes(":") ? firstColumn.split(":").pop().trim() : firstColumn;
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// One ISIN is often listed on several venues under differently worded names
// ("iShares Core MSCI EAFE ETF" and "ISHARES TRUST CORE MSCI EAFE ETF"), so
// every spelling is kept and the closest one decides the match.
function loadTickerCandidatesFromCsv(csvPath, kind, into = new Map()) {
  if (!fs.existsSync(csvPath)) return into;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const exchange =
      isinIndex >= 2 ? (columns[isinIndex - 1] || "").trim().toUpperCase() : "";

    const candidates = into.get(ticker) || [];
    into.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    const candidate = existing || { isin, kind, names: [], exchanges: [] };
    if (!existing) candidates.push(candidate);

    if (!candidate.names.includes(name)) candidate.names.push(name);
    if (exchange && !candidate.exchanges.includes(exchange)) {
      candidate.exchanges.push(exchange);
    }
  }

  return into;
}

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

  return matched / Math.max(scraped.length, candidate.length);
}

function nameVariants(name) {
  const parts = (name || "").split(/\s+-\s*|\s*-\s+/).map((part) => part.trim());
  return [name, ...parts.filter((part) => nameTokens(part).length >= 2)];
}

function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    for (const variant of nameVariants(name)) {
      const score = nameScore(scrapedName, variant);
      if (score > best.score) best = { score, name: variant };
    }
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

function resolveIsin(tickerCandidates, ticker, scrapedName, csvExchange, allowedKinds) {
  const pool = (tickerCandidates.get(ticker) || []).filter((candidate) =>
    allowedKinds ? allowedKinds.has(candidate.kind) : true
  );

  // The board's venue is tried first: `AAPL.TO` is the Canadian depositary
  // receipt, and scoring the name against the American common share would
  // otherwise win just by being the shorter wording.
  const onVenue = csvExchange
    ? pool.filter((candidate) => candidate.exchanges.includes(csvExchange))
    : [];
  const fromVenue = onVenue.length > 0 ? onVenue : pool;

  const scored = fromVenue.map((candidate) => ({
    isin: candidate.isin,
    kind: candidate.kind,
    exchanges: candidate.exchanges,
    ...scoreCandidate(scrapedName, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  let shortlist = scored.filter((candidate) => candidate.score === bestScore);
  if (shortlist.length === 1) return shortlist[0];

  const scrapedLength = nameTokens(scrapedName).length;
  const distance = (candidate) => Math.abs(nameTokens(candidate.name).length - scrapedLength);
  const tightest = Math.min(...shortlist.map(distance));
  shortlist = shortlist.filter((candidate) => distance(candidate) === tightest);
  if (shortlist.length === 1) return shortlist[0];

  return null;
}

// MyPortal files American names as they are and stamps a Canadian listing with
// a suffix: `.TO` on TSX (and on most Aequitas NEO lines), `.VN` on TSXV —
// not the `.V` the classic IQ API used — and `.CN` on the CSE, which the
// quote itself then names `CNSX`.
const LISTING_SUFFIX = /\.(TO|VN|CN|NE)$/;
const SUFFIX_FOR_CSV = {
  TSX: ".TO",
  NEO: ".TO",
  TSXV: ".VN",
  CSE: ".CN",
};

function questradeSymbol(ticker, csvExchange) {
  const suffix = SUFFIX_FOR_CSV[csvExchange] || "";
  if (!suffix) return ticker;
  return ticker.endsWith(suffix) ? ticker : `${ticker}${suffix}`;
}

function csvTicker(symbol) {
  return String(symbol || "").toUpperCase().replace(LISTING_SUFFIX, "");
}

// Where Questrade quotes a listing, in the CSV's own vocabulary. Arca funds
// are filed as AMEX and Cboe BZX as CBOE, the way the lists already write them.
const EXCHANGE_NAMES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  AMEX: "AMEX",
  "NYSE AMERICAN": "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  TSX: "TSX",
  TSXV: "TSXV",
  "AEQUITAS NEO": "NEO",
  NEO: "NEO",
  CNSX: "CSE",
  CSE: "CSE",
  "PINK SHEETS": "OTC",
  OTC: "OTC",
};

const MARKET_EXCHANGES = new Set(Object.values(EXCHANGE_NAMES));

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://myportal.questrade.com/investing/summary";

const pages = await browser.pages();
const page =
  pages.find((candidate) => /questrade\.com/i.test(candidate.url())) ||
  (await browser.newPage());
await page.bringToFront().catch(() => {});

const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return new URL(fallback, import.meta.url);
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// `--csv=PATH` the fund list (defaults to etfs.csv) and `--stocks-csv=PATH`
// the share list (defaults to stocks.csv). Questrade's self-directed book is
// Canada and the United States; there is no spot crypto on this login, and
// no PTP / US-residents-only flag. `--funds-only` / `--etfs-only` answer for
// the funds alone; `--stocks-only` for the shares.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");

const tickerCandidates = new Map();
if (!stocksOnly) loadTickerCandidatesFromCsv(csvPath, "ETF", tickerCandidates);
if (!fundsOnly) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

const outputPath = new URL("questrade-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
const entryKey = (ticker) => String(ticker || "").toUpperCase();

// A previous run is kept so a mapping fix can fill the gaps without quoting
// the whole book again. Delete questrade-parsed.json to start over.
if (fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entryKey(entry.ticker));
      }
    }
  } catch {
    results.length = 0;
    seen.clear();
  }
}

const wanted = new Map();
for (const [ticker, candidates] of tickerCandidates) {
  for (const candidate of candidates) {
    for (const exchange of candidate.exchanges) {
      if (!MARKET_EXCHANGES.has(exchange)) continue;
      const symbol = questradeSymbol(ticker, exchange);
      if (
        onlyTickers.size > 0 &&
        !onlyTickers.has(ticker) &&
        !onlyTickers.has(symbol)
      ) {
        continue;
      }
      if (!wanted.has(symbol)) wanted.set(symbol, ticker);
    }
  }
}

console.error(
  `${wanted.size} Canada/US symbols to quote` +
    (onlyTickers.size ? ` (filtered)` : "") +
    (seen.size ? `, ${seen.size} already saved` : "")
);

let token = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("api.questrade.com/v1/market-data/")) return;
  const sent = event.request.headers || {};
  const authorization = sent.Authorization || sent.authorization || "";
  if (authorization.startsWith("Bearer ")) token = authorization;
});

async function captureToken() {
  token = null;
  if (!/questrade\.com/i.test(page.url())) {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  } else {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  }
  for (let waited = 0; waited < 20000 && !token; waited += 250) await sleep(250);
  if (token) return true;
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  for (let waited = 0; waited < 15000 && !token; waited += 250) await sleep(250);
  return Boolean(token);
}

if (!(await captureToken())) {
  throw new Error(
    "Could not read Questrade's API token. Is myportal.questrade.com signed in?"
  );
}

const QUOTE_BATCH = 20;

async function quoteBatch(symbols) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await page.evaluate(async (authorization, batch) => {
      return Promise.all(
        batch.map(async (symbol) => {
          try {
            const response = await fetch(
              `https://api.questrade.com/v1/market-data/${encodeURIComponent(symbol)}/quote`,
              {
                headers: {
                  Authorization: authorization,
                  Accept: "application/json, text/plain, */*",
                },
              }
            );
            if (response.status === 401) return { symbol, status: 401, json: null };
            if (!response.ok) return { symbol, status: response.status, json: null };
            return { symbol, status: 200, json: await response.json() };
          } catch {
            return { symbol, status: 0, json: null };
          }
        })
      );
    }, token, symbols);

    if (answer.some((row) => row.status === 401)) {
      await captureToken();
      continue;
    }
    return answer;
  }
  return symbols.map((symbol) => ({ symbol, status: 0, json: null }));
}

const skipped = new Map();
const bump = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);

const symbols = [...wanted.keys()]
  .filter((symbol) => !seen.has(entryKey(symbol)))
  .sort((left, right) => left.localeCompare(right));

for (let offset = 0; offset < symbols.length; offset += QUOTE_BATCH) {
  const batch = symbols.slice(offset, offset + QUOTE_BATCH);
  const quoted = await quoteBatch(batch);

  for (const [batchIndex, row] of quoted.entries()) {
    if (offset + batchIndex + 1 < startIndex) continue;

    if (seen.has(entryKey(row.symbol))) continue;

    if (row.status !== 200 || !row.json) {
      bump(row.status === 400 ? "not quoted" : "not available on this account");
      continue;
    }

    const data = row.json;
    if (data.isTradable === false) {
      bump("not tradable");
      continue;
    }
    if (data.isQuotable === false) {
      bump("not quotable");
      continue;
    }

    const listing = String(data.listingMarket || "").trim();
    if (/index/i.test(listing) || /index/i.test(data.securityType || "")) {
      bump("index");
      continue;
    }

    const csvExchange = EXCHANGE_NAMES[listing.toUpperCase()];
    if (!csvExchange) {
      bump(`unknown venue (${listing || "none"})`);
      continue;
    }

    const name = String(data.description || "").replace(/\s+/g, " ").trim();
    const ticker = String(data.symbol || row.symbol).toUpperCase();
    const bare = csvTicker(ticker);
    const allowedKinds = fundsOnly
      ? new Set(["ETF"])
      : stocksOnly
        ? new Set(["STOCK"])
        : undefined;
    const matched = resolveIsin(tickerCandidates, bare, name, csvExchange, allowedKinds);
    if (!matched) {
      bump("no ISIN");
      continue;
    }

    seen.add(entryKey(ticker));
    results.push({
      query: ticker,
      ticker,
      name,
      exchange: csvExchange,
      currency: String(data.currency || "").toUpperCase() || null,
      type: matched.kind,
      raw: [ticker, name, listing].filter(Boolean).join(" "),
      isin: matched.isin,
    });
  }

  const quotedThrough = Math.min(offset + batch.length, symbols.length);
  if (quotedThrough % 500 === 0 || quotedThrough === symbols.length) {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.error(
      `  ${results.length} matched (${quotedThrough}/${symbols.length} quoted)`
    );
  }
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
for (const [reason, count] of [...skipped].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(count).padStart(5)} ${reason}`);
}

console.log(JSON.stringify(results, null, 2));

await client.detach().catch(() => {});
await browser.disconnect();
