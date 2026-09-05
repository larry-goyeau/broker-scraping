import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  // The ticket accepts the class share with a dot (BRK.B). A slash is the
  // same spelling and is folded onto it.
  return (afterExchange || "").replace(/\//g, ".").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
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

// TradeUP names the venue the way the tape does. ARCA funds sit on AMEX in
// the catalogues; Hong Kong comes through as SEHK.
const EXCHANGE_NAMES = {
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  SEHK: "HKEX",
  HKEX: "HKEX",
};

const HK_EXCHANGES = new Set(["HKEX", "SEHK"]);
const MARKET_EXCHANGES = new Set(["AMEX", "CBOE", "NASDAQ", "NYSE", "BATS", "ARCA", "HKEX"]);

// Hong Kong is quoted in five digits, so 2800 is asked for as 02800.
function platformSymbol(ticker, exchange) {
  if (HK_EXCHANGES.has(exchange) && /^[0-9]{1,5}$/.test(ticker)) return ticker.padStart(5, "0");
  return ticker;
}

function loadTickerCandidatesFromCsv(csvPath, kind, map = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = normalize(isinIndex >= 1 ? columns[isinIndex - 1] : columns[1]).toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
      if (!existing.kind) existing.kind = kind;
    } else {
      candidates.push({
        isin,
        kind,
        names: [name],
        exchanges: new Set(exchange ? [exchange] : []),
      });
    }
  }

  return map;
}

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE",
  "CO", "TRUST", "CLASS", "ETF", "ETC", "ETN", "ETP", "UCITS", "FUND", "SHARES",
  "ISHARES",
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

function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// TradeUP carries a single listing per ticker on each of its markets, so the
// instrument trading under the ticker asked for is the one the CSV lists
// there. Hong Kong names arrive abbreviated to a dozen-odd characters.
function resolveListing(tickerCandidates, asset, type) {
  const kind = type === "STOCK" ? "STOCK" : "ETF";
  let candidates = (tickerCandidates.get(asset.ticker) || []).filter(
    (candidate) => !candidate.kind || candidate.kind === kind
  );
  if (candidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[asset.exchange] || asset.exchange;
  const sameVenue = venue
    ? candidates.filter((candidate) =>
        [...candidate.exchanges].some((exchange) => (EXCHANGE_NAMES[exchange] || exchange) === venue)
      )
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    ...candidate,
    ...scoreCandidate(asset.name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  return winners.length === 1 ? winners[0] : null;
}

// TradeUP marks funds with etf:1. Searching BTC opens the Grayscale trust,
// not a coin, so GDAX-style pairs are not asked for. A share and a tracker
// that share a ticker are told apart by that flag (AMZN the company is 0).
function listingType(item, ticker) {
  const name = normalize(item.nameCN);
  if (item.etf) {
    if (/\bETNs?\b/i.test(name)) return "ETN";
    if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) return "ETC";
    return "ETF";
  }

  const candidates = tickerCandidates.get(ticker) || [];
  const hasStock = candidates.some((candidate) => candidate.kind === "STOCK");
  const hasFund = candidates.some((candidate) => candidate.kind === "ETF");
  if (hasFund && !hasStock) return "ETF";
  return "STOCK";
}

function venueOf(raw) {
  const code = normalize(raw).toUpperCase();
  return EXCHANGE_NAMES[code] || "";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;

const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const queries = [];
const queried = new Set();
for (const [ticker, candidates] of tickerCandidates) {
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

  for (const exchange of new Set(candidates.flatMap((candidate) => [...candidate.exchanges]))) {
    if (!MARKET_EXCHANGES.has(exchange)) continue;
    const symbol = platformSymbol(ticker, exchange);
    if (queried.has(symbol)) continue;
    queried.add(symbol);
    queries.push({ symbol, ticker });
  }
}

const outputPath = new URL("tradeup-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) {
          seen.add(`${entry.ticker}:${entry.type || ""}:${entry.exchange || ""}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://web.tradeup.com/quote/SPY/chart";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("web.tradeup.com")) ||
  (await browser.newPage());
if (!page.url().includes("web.tradeup.com")) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}

let token = null;
let query = "";
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("hq.tradeup.com")) return;
  const sent = event.request.headers || {};
  const authorization = sent.Authorization || sent.authorization;
  if (!authorization) return;

  token = authorization;
  const params = new URLSearchParams(new URL(event.request.url).search);
  for (const key of ["withCnEtf", "withPlate", "market", "limit", "configIndices", "manual"]) {
    params.delete(key);
  }
  query = `?${params.toString()}`;
});

async function captureSession() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    for (let waited = 0; waited < 15000 && !token; waited += 250) await sleep(250);
    if (token) return true;
  }
  return Boolean(token);
}

if (!(await captureSession())) {
  throw new Error("Could not read TradeUP's API token. Is web.tradeup.com signed in?");
}

const BATCH_SIZE = 500;

async function lookup(symbols) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await page.evaluate(
      async (url, authorization, list) => {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { Authorization: authorization, "Content-Type": "application/json" },
            body: JSON.stringify({ items: list.map((symbol) => ({ symbol })) }),
          });
          if (!response.ok) return { status: response.status };
          const payload = await response.json();
          return { status: 200, items: payload?.items || [] };
        } catch (error) {
          return { status: 0, error: String(error) };
        }
      },
      `https://hq.tradeup.com/stock_info/detail/global${query}`,
      token,
      symbols
    );

    if (answer?.status === 200) return answer.items;

    const stale = token;
    for (let waited = 0; waited < 20000 && token === stale; waited += 250) await sleep(250);
    if (token === stale) await captureSession();
  }

  return [];
}

const bySymbol = new Map(queries.map((entry) => [entry.symbol, entry.ticker]));
const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

console.error(`${queries.length} symbols to ask about`);

let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (let offset = 0; offset < queries.length; offset += BATCH_SIZE) {
  if (offset + BATCH_SIZE < startIndex) continue;

  const batch = queries.slice(offset, offset + BATCH_SIZE);
  const items = await lookup(batch.map((entry) => entry.symbol));
  if (items.length === 0) {
    skip("no answer");
    continue;
  }

  for (const item of items) {
    const symbol = normalize(item?.symbol);
    if (!symbol) continue;
    if (!item.exchange) {
      skip("not carried");
      continue;
    }

    const ticker = bySymbol.get(symbol) || normalizeTicker(symbol);
    const type = listingType(item, ticker);
    if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
    if (type === "STOCK" && !wantStocks) continue;

    const name = normalize(item.nameCN);
    const exchange = venueOf(item.exchange);
    if (!exchange) {
      skip("foreign tape");
      continue;
    }

    const match = resolveListing(tickerCandidates, { ticker, name, exchange: item.exchange }, type);
    if (!match && !keepUnlisted) {
      unlisted += 1;
      continue;
    }

    const key = `${ticker}:${type}:${exchange}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const currency =
      normalize(item.tradeCurrency).toUpperCase() || (HK_EXCHANGES.has(item.exchange) ? "HKD" : "USD");

    results.push({
      query: ticker,
      ticker,
      name: name && name !== symbol ? name : match?.name || ticker,
      exchange,
      currency,
      type,
      raw: [ticker, name, exchange, currency].filter(Boolean).join(" "),
      isin: match?.isin || "",
    });
  }

  if (offset === 0 || (offset + BATCH_SIZE) % 2000 === 0 || offset + BATCH_SIZE >= queries.length) {
    console.error(`[${Math.min(offset + BATCH_SIZE, queries.length)}/${queries.length}] ${results.length} matched`);
  }
  if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

save();

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await client.detach();
await browser.disconnect();
