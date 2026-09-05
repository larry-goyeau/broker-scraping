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
// same ticker and is folded onto the dot so both CSV and ChoiceTrade agree.
function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").replace(/\//g, ".").trim();
}

// QuoteMedia writes NYSE preferreds with an extra dot (ABR.P.D) where the CSV
// and the tape use ABR.PD / ABR/PD. Folding them together is what lets the
// quote land on the catalogue row.
function foldTicker(value) {
  return normalizeTicker(value).replace(/\.P\./g, ".P");
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

const US_VENUES = new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "CBOE", "OTC", "IEX", "NYSEARCA"]);

// QuoteMedia's tape codes, mapped onto the CSV's own vocabulary. ARCA funds
// are filed under AMEX there, BATS under CBOE, the Nasdaq tapes under NASDAQ.
const EXCHANGE_NAMES = {
  NGS: "NASDAQ",
  NSD: "NASDAQ",
  NGM: "NASDAQ",
  NSC: "NASDAQ",
  NMS: "NASDAQ",
  NSM: "NASDAQ",
  NAS: "NASDAQ",
  NASDAQ: "NASDAQ",
  NIM: "NASDAQ",
  SC: "NASDAQ",
  NYE: "NYSE",
  NYS: "NYSE",
  NYSE: "NYSE",
  ARCA: "AMEX",
  PSE: "AMEX",
  ASE: "AMEX",
  AMX: "AMEX",
  AMEX: "AMEX",
  NYA: "AMEX",
  BATS: "CBOE",
  BZX: "CBOE",
  CBOE: "CBOE",
  IEX: "IEX",
  OTCQB: "OTC",
  OTCQX: "OTC",
  OTCBB: "OTC",
  OTCM: "OTC",
  OTCID: "OTC",
  OTO: "OTC",
  PINX: "OTC",
  PINL: "OTC",
  PINK: "OTC",
  PK: "OTC",
  PSGM: "OTC",
  EXPM: "OTC",
  OTC: "OTC",
  GREY: "OTC",
};

const QUOTE_VENUES = {
  NASDAQ: ["NASDAQ"],
  NYSE: ["NYSE"],
  AMEX: ["AMEX", "ARCA", "CBOE", "BATS"],
  CBOE: ["CBOE", "BATS", "AMEX"],
  OTC: ["OTC"],
  IEX: ["IEX"],
};

function quotedExchange(value) {
  const raw = normalize(value).toUpperCase();
  return EXCHANGE_NAMES[raw] || "";
}

// ticker,exchange,isin,name. One ticker answers for several listings, and the
// venue the quote names is what picks among them. Funds are loaded first so a
// ticker both lists happen to carry is remembered as the fund it is when the
// quote itself does not say (closed-end names often come back as equity).
function loadCatalogue(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const exchange = normalize(columns[1]).toUpperCase();
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean) || "";
    const name = normalize(columns.slice(3).join(","));
    if (!ticker || !isin) continue;

    const candidates = index.get(ticker) || [];
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
      index.set(ticker, candidates);
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

function looksGeneric(name) {
  const text = name.toLowerCase();
  if (text.length < 4) return true;
  return /^(common units|ishares trust|proshares trust|spdr series trust|n\/a)\b/.test(text);
}

function resolveListing(tickerCandidates, ticker, scrapedName, quoteExchange) {
  const candidates = tickerCandidates.get(ticker) || [];
  if (candidates.length === 0) return null;

  const allowed = new Set(QUOTE_VENUES[quoteExchange] || []);
  const sameVenue =
    allowed.size > 0
      ? candidates.filter((candidate) => [...candidate.exchanges].some((exchange) => allowed.has(exchange)))
      : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  if (shortlist.length === 1 && (looksGeneric(scrapedName) || sameVenue.length === 1)) {
    const winner = shortlist[0];
    const exchange =
      [...winner.exchanges].find((code) => allowed.has(code)) || quoteExchange || "";
    return { isin: winner.isin, name: winner.names[0] || scrapedName, exchange, kind: winner.kind };
  }

  const scored = shortlist.map((candidate) => ({
    candidate,
    isin: candidate.isin,
    kind: candidate.kind,
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
    [...winner.candidate.exchanges].find((code) => allowed.has(code)) || quoteExchange || "";
  return { isin: winner.isin, name: winner.name, exchange, kind: winner.kind };
}

function listingType(quote, name, kind) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  const datatype = String(quote.datatype || "").toLowerCase();
  if (datatype === "etf" || kind === "ETF") return "ETF";
  return "STOCK";
}

const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const keepEverything = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));
const walkLimit = numberArg("limit", 0);
const lanes = Math.max(1, numberArg("concurrency", 4));
const batchSize = Math.max(1, numberArg("batch", 80));

const wantEtfs = !stocksOnly;
const wantStocks = !etfsOnly;

const tickerCandidates = new Map();
if (wantEtfs) loadCatalogue(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadCatalogue(stocksCsvPath, "STOCK", tickerCandidates);

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

// The page is only there to lend its signed-in session. Quotes are the same
// QuoteMedia feed the quote box uses (`/quotes/get`), which takes a comma
// list, so a walk of the US book is a few hundred calls rather than one per
// ticker. There is no coin book: BTC answers Grayscale's ETF, not a pair.
const pages = await browser.pages();
let page =
  pages.find((candidate) => /trade\.choicetrade\.com/i.test(candidate.url())) ||
  (await browser.newPage());
await page.bringToFront();

if (!/trade\.choicetrade\.com/i.test(page.url())) {
  await page.goto("https://trade.choicetrade.com/home/positions", {
    waitUntil: "domcontentloaded",
  });
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
      page = pagesNow.find((candidate) => /choicetrade/i.test(candidate.url())) || page;
    }
  }
}

async function fetchQuotes(symbols) {
  return inPage(async (batch) => {
    try {
      const response = await fetch(`/quotes/get?symbol=${encodeURIComponent(batch.join(","))}`, {
        credentials: "include",
      });
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
}

const outputPath = new URL("choicetrade-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
const doneQueries = new Set();

function entryKey(row) {
  return `${row.exchange}:${row.ticker}:${row.isin || row.query}`.toUpperCase();
}

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    for (const entry of Array.isArray(existing) ? existing : []) {
      if (!entry?.ticker || seen.has(entryKey(entry))) continue;
      seen.add(entryKey(entry));
      results.push(entry);
      if (entry.query) doneQueries.add(String(entry.query).toUpperCase());
    }
    if (results.length) console.error(`${results.length} listings already saved`);
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

const pending = walk.filter((ticker) => !doneQueries.has(ticker));
const batches = [];
for (let offset = 0; offset < pending.length; offset += batchSize) {
  batches.push(pending.slice(offset, offset + batchSize));
}

console.error(`${pending.length} tickers to check (${batches.length} batches)`);

let silences = 0;
let unknown = 0;
let unmatched = 0;
let foreign = 0;
let done = 0;

async function handleBatch(batch) {
  const answer = await fetchQuotes(batch);
  if (answer.status === 401 || !answer.json?.results) {
    silences += 1;
    console.error("  no answer");
    if (silences >= 5) {
      throw new Error("ChoiceTrade stopped answering. Is trade.choicetrade.com still signed in?");
    }
    return;
  }
  silences = 0;

  const bySymbol = new Map();
  for (const row of Array.isArray(answer.json.results.quote) ? answer.json.results.quote : []) {
    const ticker = normalizeTicker(row?.key?.symbol || row?.symbolstring || "");
    if (!ticker) continue;
    bySymbol.set(ticker, row);
    bySymbol.set(foldTicker(ticker), row);
  }

  for (const query of batch) {
    done += 1;
    const quote = bySymbol.get(query) || bySymbol.get(foldTicker(query));
    const datatype = String(quote?.datatype || "").toLowerCase();
    const rawExchange = normalize(quote?.key?.exchange || "");
    if (!quote || datatype === "n/a" || !rawExchange || String(quote.key?.symbol || "").startsWith("^")) {
      unknown += 1;
      continue;
    }

    const ticker = normalizeTicker(quote.key.symbol);
    if (foldTicker(ticker) !== foldTicker(query)) continue;

    const name = normalize(quote.equityinfo?.longname || quote.equityinfo?.shortname || "");
    const exchange = quotedExchange(rawExchange);
    if (!exchange) {
      foreign += 1;
      continue;
    }

    const match = resolveListing(tickerCandidates, query, name, exchange);
    if (!match && !keepEverything) {
      unmatched += 1;
      continue;
    }

    const type = listingType(quote, name || match?.name || "", match?.kind || "");
    if (type === "ETF" && !wantEtfs) continue;
    if (type === "STOCK" && !wantStocks) continue;
    if ((type === "ETN" || type === "ETC") && !wantEtfs) continue;

    const row = {
      query,
      ticker: query,
      name: looksGeneric(name) && match?.name ? match.name : name || match?.name || ticker,
      exchange: US_VENUES.has(match?.exchange) ? match.exchange : exchange,
      currency: "USD",
      type,
      raw: [ticker, name || match?.name, rawExchange].filter(Boolean).join(" "),
      isin: match?.isin || "",
    };

    const key = entryKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(row);
  }
}

let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(lanes, batches.length) }, async () => {
    while (cursor < batches.length) {
      const index = cursor++;
      const batch = batches[index];
      console.error(`[${index * batchSize + 1}/${pending.length}] ${batch[0]}…${batch[batch.length - 1]}`);
      await handleBatch(batch);
      save();
    }
  })
);

save();

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listed (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    `; ${unknown} not quoted, ${unmatched} with no catalogue match, ${foreign} off a non-US venue`
);

await browser.disconnect();
