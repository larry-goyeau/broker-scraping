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

    const isin = toIsin(columns[isinIndex]);
    const exchange = (columns[1] || "").trim().toUpperCase();
    const candidates = map.get(ticker) || [];

    // One fund lists on many venues under one ISIN, and which venue it is
    // decides where the listing belongs, so they are all kept.
    const existing = candidates.find((row) => row.isin === isin);
    if (existing) {
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({
        isin,
        name: columns.slice(isinIndex + 1).join(",").trim(),
        exchanges: new Set(exchange ? [exchange] : []),
      });
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

// A handful of funds trade under the same ticker on both sides of the shelf —
// IVV, VEU, IXJ, ESPO — and their Australian and American lines carry near
// identical names but different ISINs. Whichever market the listing belongs to
// decides which CSV lines may answer for it.
const MARKET_EXCHANGES = {
  US: new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "CBOE", "BZX", "IEX"]),
  AU: new Set(["ASX", "CXA", "CHIA"]),
  GBP: new Set(["LSE"]),
};

function resolveListing(tickerCandidates, ticker, scrapedName, market) {
  const all = tickerCandidates.get(ticker) || [];
  if (all.length === 0) return null;

  const allowed = MARKET_EXCHANGES[market];
  const sameMarket = allowed
    ? all.filter((row) => [...row.exchanges].some((venue) => allowed.has(venue)))
    : [];
  const candidates = sameMarket.length > 0 ? sameMarket : all;

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

  return bestScore > 0 ? bestCandidate : null;
}

// EasyEquities says only US, AU or GBP; the matched CSV line knows the venue,
// and the first allowed one wins since the sets are written in the order a
// listing is most likely to belong.
function venueFor(candidate, market) {
  const allowed = MARKET_EXCHANGES[market];
  if (!allowed || !candidate) return market;

  for (const venue of allowed) {
    if (candidate.exchanges.has(venue)) return venue;
  }
  return market;
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

// The page is only there to lend its signed-in session. EasyEquities holds its
// token in memory rather than in storage, so it is read off the app's own
// traffic; loading the page is what makes it talk.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("invest-now.apps.easyequities.io")) ||
  (await browser.newPage());

const APP_URL = "https://invest-now.apps.easyequities.io/instrument/diy/etfsexpanded";
const API = "https://rest.synatic.openeasy.io/easyequities/investnow";

let token = "";
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  const auth = event.request.headers?.Authorization || event.request.headers?.authorization;
  if (auth && auth.startsWith("Bearer ")) token = auth.slice(7);
});

async function captureToken() {
  token = "";
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  for (let waited = 0; waited < 40000 && !token; waited += 250) await sleep(250);
  // Signing in bounces through the identity service and back, and that last
  // hop would cut short any call started in between.
  if (token) await sleep(5000);
  return Boolean(token);
}

if (!(await captureToken())) {
  throw new Error(`Could not read the EasyEquities token. Is ${APP_URL} signed in?`);
}

// Renewing the token means loading the page again, which cuts short every
// request already in flight from it. One renewal at a time, and everyone else
// waits for it rather than starting a second one.
let renewal = null;

function renewToken() {
  if (!renewal) renewal = captureToken().finally(() => (renewal = null));
  return renewal;
}

// A ticker at a time over the whole CSV is a long run, so requests are spaced
// out rather than fired as fast as the pool allows.
const MIN_INTERVAL_MS = 160;
let nextSlot = 0;

async function pace() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await sleep(slot - now);
}

async function api(path, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (renewal) await renewal;
    await pace();

    let answer;
    try {
      answer = await page.evaluate(
        async (url, auth, payload) => {
          try {
            const response = await fetch(url, {
              method: payload ? "POST" : "GET",
              headers: {
                Authorization: `Bearer ${auth}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: payload ? JSON.stringify(payload) : undefined,
            });
            const text = await response.text();
            try {
              return { status: response.status, json: JSON.parse(text) };
            } catch {
              return { status: response.status };
            }
          } catch (error) {
            return { status: 0, error: String(error) };
          }
        },
        `${API}${path}`,
        token,
        body || null
      );
    } catch {
      // The page navigated under us while renewing; try again once it settles.
      await sleep(1000);
      continue;
    }

    if (answer.status === 200) return answer.json;
    if (answer.status === 401 || answer.status === 403) await renewToken();
    else await sleep(1000 * (attempt + 1));
  }

  return null;
}

// Instruments name their accounts by number, and this is what turns 16 into
// AUD — the account whose absence blocks a purchase.
async function loadAccountNames() {
  const payload = await api("/trading_currencies");
  const names = new Map();
  for (const row of payload?.tradingCurrencies || []) {
    const label = (row.tradingCurrencyShortName || "").toUpperCase();
    if (label) names.set(row.tradingCurrencyID, label);
  }
  return names;
}

// The catalogue endpoint pages unreliably — overlapping pages, a hard cap of 48
// rows, and funds that never surface at all — so each ticker is asked for by
// name instead, which answers exactly.
async function searchTicker(ticker) {
  const payload = await api("/search", {
    searchValue: ticker.toLowerCase(),
    account_filter: "ALL",
    category: "etfsexpanded",
    page: 1,
  });

  return (payload?.instruments || []).filter(
    (row) => String(row.ticker || "").toUpperCase() === ticker
  );
}

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

const outputPath = new URL("../parsed_json/easyequities-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) {
          seen.add(`${entry.query}:${entry.exchange}:${entry.ticker}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

function save() {
  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

const accountNames = await loadAccountNames();
console.error(`${accountNames.size} accounts named, ${queries.length} tickers to check`);

let done = 0;

async function handle(query) {
  const rows = await searchTicker(query);

  for (const row of rows) {
    const ticker = String(row.ticker || "").toUpperCase();
    const name = String(row.name || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) continue;

    // "EQU.AU.NDQ" names the market between the prefix and the ticker, which is
    // as precise as EasyEquities gets: US, AU or GBP.
    const market = String(row.contractCode || "").split(".")[1]?.toUpperCase() || "";

    const match = resolveListing(tickerCandidates, ticker, name, market);
    if ((tickerCandidates.get(ticker) || []).length > 0 && !match) continue;

    const exchange = venueFor(match, market);
    const isin = match?.isin || null;

    const key = `${query}:${exchange}:${ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const accounts = (row.accountFilters || [])
      .map((id) => accountNames.get(id) || String(id))
      .filter(Boolean);

    results.push({
      query,
      ticker,
      exchange,
      name,
      type: /\bETC\b/i.test(name) ? "ETC" : /\bETN\b/i.test(name) ? "ETN" : "ETF",
      accounts,
      raw: `${ticker} ${name} ${exchange}`,
      isin,
    });
  }
}

// A handful in flight keeps the run moving while the pacing above decides the
// actual rate.
const queue = queries
  .map((query, index) => ({ query, index }))
  .filter((item) => item.index + 1 >= startIndex);
const total = queue.length;

const workers = Array.from({ length: 4 }, async () => {
  for (;;) {
    const item = queue.shift();
    if (!item) return;

    await handle(item.query);
    done += 1;
    if (done % 250 === 0) {
      console.error(`  ${done}/${total} checked, ${results.length} listings`);
      save();
    }
  }
});
await Promise.all(workers);

save();

const tally = new Map();
for (const row of results) {
  for (const account of row.accounts) tally.set(account, (tally.get(account) || 0) + 1);
}
console.error(
  `${results.length} listings kept; by account ` +
    [...tally.entries()].sort((left, right) => right[1] - left[1]).map(([name, count]) => `${name}:${count}`).join(" ")
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
