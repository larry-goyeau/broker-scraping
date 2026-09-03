import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// Class shares keep the dot (BRK.B). A slash is the other spelling of the
// same ticker and is folded onto the dot so both CSV and Firstrade agree.
function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").replace(/\//g, ".").trim();
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

const US_VENUES = new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "CBOE", "OTC", "IEX", "NYSEARCA", "BZX"]);

// ticker,exchange,isin,name. One ticker answers for several listings, and the
// venue the quote names is what picks among them.
function loadCatalogue(csvPath, kind, index = { byTicker: new Map() }) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const exchange = normalize(columns[1]).toUpperCase();
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean) || "";
    const name = normalize(columns.slice(3).join(","));
    if (!ticker || !isin) continue;

    const candidates = index.byTicker.get(ticker) || [];
    const existing = candidates.find((row) => row.isin === isin);
    if (existing) {
      if (exchange) existing.exchanges.add(exchange);
      if (name && !existing.names.includes(name)) existing.names.push(name);
    } else {
      candidates.push({
        isin,
        kind,
        names: name ? [name] : [],
        exchanges: new Set(exchange ? [exchange] : []),
      });
      index.byTicker.set(ticker, candidates);
    }
  }

  return index;
}

function usTickersFromCsv(csvPath) {
  const tickers = [];
  if (!csvPath || !fs.existsSync(csvPath)) return tickers;

  const seen = new Set();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const exchange = normalize(columns[1]).toUpperCase();
    if (!ticker || !US_VENUES.has(exchange)) continue;
    if (!/^[A-Z0-9][A-Z0-9.\-]{0,5}$/.test(ticker)) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    tickers.push(ticker);
  }
  return tickers;
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
  "TRUST",
]);

function nameTokens(value) {
  return normalize(value)
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
  return matched / Math.max(scraped.length, candidate.length);
}

function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// Firstrade names Arca "NYSEARCA" and American "AMEX"; the CSV uses AMEX and
// ARCA for the same shelves.
const QUOTE_VENUES = {
  NASDAQ: ["NASDAQ"],
  NYSE: ["NYSE"],
  NYSEARCA: ["AMEX", "ARCA", "CBOE", "BATS"],
  AMEX: ["AMEX", "ARCA"],
  NYSEAMERICAN: ["AMEX"],
  BATS: ["CBOE", "BATS", "AMEX"],
  CBOE: ["CBOE", "BATS"],
  OTC: ["OTC"],
  OTCM: ["OTC"],
  OTCBB: ["OTC"],
  PINX: ["OTC"],
  IEX: ["IEX"],
};

const EXCHANGE_ALIAS = {
  NYSEARCA: "AMEX",
  NYSEAMERICAN: "AMEX",
  OTCM: "OTC",
  OTCBB: "OTC",
  PINX: "OTC",
};

function quotedExchange(value) {
  const raw = normalize(value).toUpperCase();
  return EXCHANGE_ALIAS[raw] || raw;
}

function resolveListing(tickerCandidates, ticker, scrapedName, quoteExchange) {
  const candidates = tickerCandidates.get(ticker) || [];
  if (candidates.length === 0) return null;

  const allowed = new Set(QUOTE_VENUES[normalize(quoteExchange).toUpperCase()] || []);
  const sameVenue =
    allowed.size > 0
      ? candidates.filter((candidate) => [...candidate.exchanges].some((exchange) => allowed.has(exchange)))
      : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    candidate,
    isin: candidate.isin,
    ...scoreCandidate(scrapedName, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((entry) => entry.score));
  if (sameVenue.length === 0 && bestScore < MIN_NAME_SCORE) return null;

  let winner;
  if (scored.length === 1) {
    winner = scored[0];
  } else {
    const winners = scored.filter((entry) => entry.score === bestScore);
    if (winners.length !== 1) return null;
    winner = winners[0];
  }

  const exchange =
    [...winner.candidate.exchanges].find((code) => allowed.has(code)) ||
    quotedExchange(quoteExchange) ||
    "";
  return { isin: winner.isin, name: winner.name, exchange };
}

// Benzinga sometimes files the logo under the ISIN itself. FIGIs (BBG…) share
// the same 12-character shape and live in the same slot, so they are refused.
function isinFromLogo(logo) {
  const url = typeof logo === "string" ? logo : logo?.dark || logo?.light || "";
  const match = String(url)
    .toUpperCase()
    .match(/\/IMAGE\/([A-Z]{2}[A-Z0-9]{10})(?:\/|\?|$)/);
  if (!match || match[1].startsWith("BBG")) return "";
  return toIsin(match[1]);
}

function listingType(quote, name) {
  if (Number(quote.secType) === 3) return "FUND";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (quote.isEtf) return "ETF";
  return "STOCK";
}

function looksGeneric(name) {
  const text = name.toLowerCase();
  if (text.length < 4) return true;
  return /^(common units|ishares trust|spdr series trust|n\/a)\b/.test(text);
}

const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");
const keepEverything = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));
const walkLimit = numberArg("limit", 0);
const lanes = Math.max(1, numberArg("concurrency", 8));

const wantEtfs = !stocksOnly;
const wantStocks = !etfsOnly;

const catalogues = {
  STOCK: wantStocks ? loadCatalogue(stocksCsvPath, "STOCK") : { byTicker: new Map() },
  ETF: wantEtfs ? loadCatalogue(etfsCsvPath, "ETF") : { byTicker: new Map() },
};

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliQueries = positionalArgs.map(normalizeTicker).filter(Boolean);

const queries = (() => {
  if (cliQueries.length > 0) return [...new Set(cliQueries)];
  const list = [];
  const seen = new Set();
  const add = (tickers) => {
    for (const ticker of tickers) {
      if (seen.has(ticker)) continue;
      seen.add(ticker);
      list.push(ticker);
    }
  };
  if (wantEtfs) add(usTickersFromCsv(etfsCsvPath));
  if (wantStocks) add(usTickersFromCsv(stocksCsvPath));
  return list;
})();

const walk = queries.slice(startIndex - 1, walkLimit > 0 ? startIndex - 1 + walkLimit : undefined);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session to the calls below.
const pages = await browser.pages();
let page =
  pages.find((candidate) => candidate.url().includes("firstrade.com")) || (await browser.newPage());

if (!page.url().includes("firstrade.com")) {
  await page.goto("https://invest.firstrade.com/app/dashboard", { waitUntil: "domcontentloaded" });
  await sleep(3000);
}

async function inPage(fn, ...args) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (error) {
      if (attempt >= 3) throw error;
      console.error(`  retrying: ${normalize(String(error?.message)).slice(0, 90)}`);
      await sleep(1000 * attempt);
      const pagesNow = await browser.pages();
      page = pagesNow.find((candidate) => candidate.url().includes("firstrade.com")) || page;
    }
  }
}

async function api(path, init = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const answer = await inPage(async (target, options) => {
      try {
        const response = await fetch(target, {
          method: options.method || "GET",
          credentials: "include",
          headers: {
            Accept: "application/json, text/plain, */*",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const text = await response.text();
        try {
          return { status: response.status, json: JSON.parse(text) };
        } catch {
          return { status: response.status, error: text.slice(0, 160) };
        }
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    }, path, init);

    if (answer.json) return answer.json;
    if (answer.status === 401 || answer.status === 403) {
      throw new Error("Firstrade session expired. Is the app still signed in?");
    }
    await sleep(1000 * (attempt + 1));
  }
  return null;
}

async function fetchQuote(query) {
  const payload = await api(`/app/api/quote?q=${encodeURIComponent(query)}`);
  if (!payload) return { silent: true };
  if (payload.refCode === 2071 || payload.statusCode === 400) return { unknown: true };
  if (payload.statusCode || !payload.symbol) return { silent: true };
  return { quote: payload };
}

// Quick Trade paints the red banner from this preview, not from the quote.
// 1563 is illiquid/penny (APXTU), 1551 a blanket refusal, 1527 Pink No
// Information (sell-only), 2135 the five-letter F foreign OTC sheet. Some
// sub-dime pink sheets refuse the buy with a message and no refCode. 1505
// is only buying power, so those names stay. `--all` keeps the blocked rows.
function isForeignFSheet(ticker) {
  return /^[A-Z]{4}F$/.test(ticker);
}

const BUYING_POWER_REF = 1505;
const OPENING_BLOCKED = /not accepted|no longer accepting|liquidation only/i;

async function fetchOpening(symbol, account) {
  return api("/app/api/order/stock", {
    method: "POST",
    body: {
      preview: true,
      stage: "N",
      account,
      transaction: "B",
      symbol,
      price_type: "2",
      limit_price: 0.01,
      duration: "0",
      instructions: "0",
      shares: 1,
    },
  });
}

function blockedOpening(ticker, payload) {
  if (isForeignFSheet(ticker)) return true;
  const ref = Number(payload?.refCode);
  if (ref === BUYING_POWER_REF) return false;
  if (ref) return true;
  return OPENING_BLOCKED.test(String(payload?.message || payload?.error || ""));
}

// The search box talks to /api/suggest-symbol. A name can still quote and
// even preview (CBSE after its 2025 CUSIP change) while this index returns
// nothing, which is why the UI only shows recent searches.
async function fetchSuggest(query) {
  const payload = await api(`/app/api/suggest-symbol?q=${encodeURIComponent(query)}`);
  return Array.isArray(payload) ? payload : null;
}

function inSymbolSearch(ticker, suggestions) {
  return suggestions.some((row) => normalizeTicker(row.symbol) === ticker);
}

// The quote occasionally carries the issuer's trust name ("ISHARES TRUST")
// instead of the fund name, which is too generic to match a single ISIN. The
// fundamentals endpoint backing the same page keeps the real fund name.
async function fetchFundName(query) {
  const payload = await api(`/app/api/fundamental?symbol=${encodeURIComponent(query)}&sharesCorrection=true`);
  const name = payload?.description || payload?.analystReport?.securityName || "";
  return normalize(name.replace(/\u00c2(?=[\u00ae\u00a9\u2122])/g, ""));
}

const outputPath = new URL("firstrade-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

function entryKey(row) {
  return `${row.exchange}:${row.ticker}:${row.isin || row.query}`.toUpperCase();
}

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    for (const entry of Array.isArray(existing) ? existing : []) {
      if (!entry?.ticker || seen.has(entryKey(entry))) continue;
      if (!keepEverything && isForeignFSheet(entry.ticker)) continue;
      seen.add(entryKey(entry));
      results.push(entry);
    }
    if (results.length) console.error(`${results.length} listings already saved`);
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

const accountsPayload = await api("/app/api/accounts");
const account =
  accountsPayload?.accounts?.find((entry) => entry.default)?.account ||
  accountsPayload?.accounts?.[0]?.account ||
  "";
if (!keepEverything && !account) {
  throw new Error("Firstrade returned no account to preview opening trades against.");
}

console.error(`${walk.length} tickers to check`);

let silences = 0;
let unmatched = 0;
let unknown = 0;
let blocked = 0;
let notInSearch = 0;
let done = 0;
const byType = {};

const queue = [...walk];

async function handle(query) {
  const answer = await fetchQuote(query);
  if (answer.silent) {
    silences += 1;
    if (silences >= 8) throw new Error("Firstrade stopped answering. Is the session still signed in?");
    return;
  }
  silences = 0;
  if (answer.unknown) {
    unknown += 1;
    return;
  }

  const quote = answer.quote;
  const ticker = normalizeTicker(quote.symbol);
  if (ticker !== query) return;

  let name = normalize(quote.companyName);
  const type = listingType(quote, name);
  if (type === "FUND" && !keepEverything) return;
  if (type === "ETF" && !wantEtfs) return;
  if (type === "STOCK" && !wantStocks) return;

  const kind = type === "STOCK" ? "STOCK" : "ETF";
  let isin = isinFromLogo(quote.logo);
  let match = resolveListing(catalogues[kind].byTicker, ticker, name, quote.exchange);
  if (!isin && match?.isin) isin = match.isin;

  if ((!isin || looksGeneric(name)) && (catalogues[kind].byTicker.get(ticker) || []).length > 0) {
    const fundName = await fetchFundName(query);
    if (fundName) {
      const fundMatch = resolveListing(catalogues[kind].byTicker, ticker, fundName, quote.exchange);
      if (fundMatch) {
        match = fundMatch;
        if (!isin) isin = fundMatch.isin;
      }
      if (looksGeneric(name)) name = fundName;
    }
  }

  if (!isin && match?.isin) isin = match.isin;

  if (!name) return;

  if (!isin && !keepEverything) {
    unmatched += 1;
    return;
  }

  if (!keepEverything) {
    const suggestions = await fetchSuggest(ticker);
    if (suggestions && !inSymbolSearch(ticker, suggestions)) {
      notInSearch += 1;
      return;
    }
    if (isForeignFSheet(ticker)) {
      blocked += 1;
      return;
    }
    const opening = await fetchOpening(ticker, account);
    if (opening && blockedOpening(ticker, opening)) {
      blocked += 1;
      return;
    }
  }

  const exchange = US_VENUES.has(match?.exchange) ? match.exchange : quotedExchange(quote.exchange);
  if (!exchange) return;
  const row = {
    query,
    ticker,
    name,
    exchange,
    currency: "USD",
    type,
    raw: `${ticker} ${name} - ${exchange}`.trim(),
    isin: isin || null,
  };

  if (seen.has(entryKey(row))) return;
  seen.add(entryKey(row));
  results.push(row);
  byType[type] = (byType[type] || 0) + 1;
}

const workers = Array.from({ length: lanes }, async () => {
  for (;;) {
    const query = queue.shift();
    if (!query) return;
    await handle(query);
    done += 1;
    if (done % 1000 === 0) {
      console.error(`  ${done}/${walk.length} checked, ${results.length} listings`);
      save();
    }
  }
});
await Promise.all(workers);

save();

const tally = {};
for (const row of results) tally[row.type] = (tally[row.type] || 0) + 1;
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin).filter(Boolean)).size} ISINs ` +
    `(${Object.entries(tally)
      .sort((left, right) => right[1] - left[1])
      .map(([type, count]) => `${count} ${type}`)
      .join(", ")}); ${unknown} not quoted, ${unmatched} with no catalogue match, ${notInSearch} not in search, ${blocked} not openable`
);

await browser.disconnect();
