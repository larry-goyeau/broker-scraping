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

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").replace(/[\s/]+/g, ".").trim();
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
const US_VENUES = ["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"];

const MARKET_VENUES = {
  US: new Set(US_VENUES),
  AU: new Set(["ASX"]),
  HK: new Set(["HKEX"]),
  SH: new Set(["SSE"]),
  SZ: new Set(["SZSE"]),
  BJ: new Set(["BSE"]),
  SI: new Set(["SGX"]),
};

function resolveListing(tickerCandidates, ticker, scrapedName, type, market, exchange) {
  const kind = type === "STOCK" ? "STOCK" : type === "CRYPTO" ? "" : "ETF";
  const all = tickerCandidates.get(ticker) || [];
  const filtered = all.filter(
    (candidate) => !kind || !candidate.kind || candidate.kind === kind || type === "ETN" || type === "ETC"
  );
  let candidates = filtered.length > 0 ? filtered : all;
  const venues = MARKET_VENUES[market];
  if (venues) {
    const inMarket = (list) =>
      list.filter((candidate) => [...candidate.exchanges].some((code) => venues.has(code)));
    const local = inMarket(candidates);
    const fromAll = inMarket(all);
    if (local.length > 0) candidates = local;
    else if (fromAll.length > 0) candidates = fromAll;
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const only = candidates[0];
    return { ...only, ...scoreCandidate(scrapedName, only) };
  }

  const sameVenue = exchange
    ? candidates.filter((candidate) => candidate.exchanges.has(exchange))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;
  const scored = shortlist.map((candidate) => ({
    ...candidate,
    ...scoreCandidate(scrapedName, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  return winners.length === 1 ? winners[0] : null;
}

const EXCHANGES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  AMEX: "AMEX",
  ARCA: "AMEX",
  "NYSE ARCA": "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  OTC: "OTC",
  SEHK: "HKEX",
  HKEX: "HKEX",
  ASX: "ASX",
  SGX: "SGX",
  SH: "SSE",
  SZ: "SZSE",
  BJ: "BSE",
  SSE: "SSE",
  SZSE: "SZSE",
  BSE: "BSE",
};

function chinaVenueFromTicker(symbol) {
  const code = String(symbol || "").replace(/\.(SS|SZ|SH|BJ)$/i, "");
  if (/^(6|9)\d{5}$/.test(code) || /^688\d{3}$/.test(code)) return "SSE";
  if (/^[03]\d{5}$/.test(code) || /^1[35]\d{4}$/.test(code)) return "SZSE";
  if (/^(8|4)\d{5}$/.test(code)) return "BSE";
  return "";
}

function marketOf(item) {
  const listed = normalize(item.market).toUpperCase();
  if (listed === "US" || listed === "AU" || listed === "HK" || listed === "SI") return listed;
  if (listed === "SH" || listed === "SSE") return "SH";
  if (listed === "SZ" || listed === "SZSE") return "SZ";
  if (listed === "BJ" || listed === "BSE") return "BJ";
  if (/\.AU$/i.test(item.symbol)) return "AU";
  if (/\.SI$/i.test(item.symbol)) return "SI";
  return listed || "US";
}

function currencyOf(market) {
  if (market === "AU") return "AUD";
  if (market === "HK") return "HKD";
  if (market === "SH" || market === "SZ" || market === "BJ") return "CNY";
  if (market === "SI") return "SGD";
  return "USD";
}

function tickerFromSymbol(symbol, market) {
  const text = normalizeTicker(symbol);
  if (!text) return "";
  if (market === "AU" || text.endsWith(".AU")) return text.replace(/\.AU$/i, "") || text;
  if (market === "SI" || text.endsWith(".SI")) return text.replace(/\.SI$/i, "") || text;
  if (market === "HK") return text.replace(/^0+/, "") || "0";
  return text;
}

function padHk(ticker) {
  const digits = String(ticker || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(5, "0");
}

function isStub(item) {
  const name = normalize(item.nameCN || item.name);
  const symbol = normalize(item.symbol);
  return !item.exchange && !(item.latestPrice > 0) && (!name || name === symbol);
}

function isJunk(symbol, name, market) {
  if (!symbol || symbol.startsWith(".")) return true;
  if (/\b(WARRANTS?|RIGHTS?|CBBC|INLINE WARRANT|MINI LONG|MINI SHORT|IMINI|TURBO|KNOCK)\b/i.test(name)) {
    return true;
  }
  if (market === "AU") {
    const local = symbol.replace(/\.AU$/i, "");
    if (local.length > 5) return true;
  }
  return false;
}

function listingType(name, etf, matchKind) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  const withoutParens = name.replace(/\([^)]*\)/g, " ");
  if (/\bETCs?\b/i.test(withoutParens) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) {
    return "ETC";
  }
  if (etf === 1 || matchKind === "ETF" || /\bETFs?\b|\bUCITS\b/i.test(name)) return "ETF";
  return "STOCK";
}

function venueOf(item, match, market) {
  if (market === "AU") return "ASX";
  if (market === "HK") return "HKEX";
  if (market === "SH") return "SSE";
  if (market === "SZ") return "SZSE";
  if (market === "BJ") return "BSE";
  if (market === "SI") return "SGX";

  const named = EXCHANGES[normalize(item.exchange).toUpperCase()];
  if (market === "US") {
    if (match?.exchanges) {
      for (const code of US_VENUES) {
        if (match.exchanges.has(code)) return code;
      }
    }
    if (named && US_VENUES.includes(named)) return named;
    return "NYSE";
  }
  return named || chinaVenueFromTicker(item.symbol) || "";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over. `--start=` resumes the HK walk.
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

const outputPath = new URL("tiger-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) {
          seen.add(`${entry.ticker}:${entry.exchange || ""}:${entry.type || ""}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output.
  }
}

const HQ = "https://hq.skytigris.cn";
const PAGE_SIZE = 200;
const CONCURRENCY = 8;

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("itiger.com") && !candidate.url().includes("adsrvr")) ||
  (await browser.newPage());

if (!page.url().includes("itiger.com")) {
  await page.goto("https://www.itiger.com/quote/us/all-stocks", { waitUntil: "domcontentloaded" });
}

let token = "";
let region = "SGP";
let deviceId = "web-tiger";
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  const url = event.request.url || "";
  if (!url.includes("hq.skytigris.cn")) return;
  const auth = event.request.headers?.Authorization || event.request.headers?.authorization;
  if (auth) token = auth;
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get("region")) region = parsed.searchParams.get("region");
    if (parsed.searchParams.get("deviceId")) deviceId = parsed.searchParams.get("deviceId");
  } catch {
    // Ignore a malformed capture.
  }
});

async function freshToken() {
  if (token) return token;
  console.error("reading a fresh Tiger quote token");
  await page.goto("https://www.itiger.com/quote/us/all-stocks", {
    waitUntil: "networkidle2",
    timeout: 60000,
  }).catch(() => {});
  for (let waited = 0; waited < 15000 && !token; waited += 250) await sleep(250);
  return token;
}

if (!(await freshToken())) {
  await browser.disconnect();
  throw new Error("Tiger never handed out a quote token. Is www.itiger.com open?");
}

function queryString(params = {}) {
  return new URLSearchParams({
    region,
    lang: "en_US",
    deviceId,
    appVer: "7.75.9",
    appName: "web",
    vendor: "web",
    platform: "web",
    ...params,
  }).toString();
}

async function hq(path, params = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await sleep(400 * attempt);
    const auth = await freshToken();
    let response;
    try {
      response = await fetch(`${HQ}${path}?${queryString(params)}`, {
        headers: {
          Authorization: auth,
          Accept: "application/json",
          "X-Requested-With": "xhr",
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      if (token === auth) token = "";
      continue;
    }
    if (response.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!response.ok) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return null;
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

function emit(item) {
  const market = marketOf(item);
  if (market === "SI") {
    skip("sgx");
    return;
  }

  const symbol = normalize(item.symbol).toUpperCase();
  const name = normalize(item.nameCN || item.name);
  if (isJunk(symbol, name, market)) {
    skip("warrant");
    return;
  }

  const ticker = tickerFromSymbol(symbol, market);
  if (!ticker) {
    skip("no ticker");
    return;
  }
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker) && !onlyTickers.has(normalizeTicker(symbol))) {
    return;
  }

  const guessed = listingType(name, item.etf, "");
  const exchangeHint =
    market === "AU" ? "ASX" : market === "HK" ? "HKEX" : market === "SH" ? "SSE" : market === "SZ" ? "SZSE" : "";
  let match = resolveListing(tickerCandidates, ticker, name, guessed, market, exchangeHint);
  if (!match) match = resolveListing(tickerCandidates, ticker, name, guessed, market, "");
  const type = listingType(name, item.etf, match?.kind);
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) return;
  if (type === "STOCK" && !wantStocks) return;

  const exchange = venueOf(item, match, market);
  const currency = currencyOf(market);
  if (!exchange) {
    skip("no exchange");
    return;
  }
  if (!currency) {
    skip("no currency");
    return;
  }

  if (!match && !keepUnlisted) {
    unlisted += 1;
    return;
  }

  const key = `${ticker}:${exchange}:${type}`.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name: name || match?.names?.[0] || ticker,
    exchange,
    currency,
    type,
    raw: [symbol, name, exchange, currency].filter(Boolean).join(" "),
    isin: match?.isin || "",
  });
}

async function quoteBoard(path, label) {
  const first = await hq(path, {
    delay: "false",
    size: String(PAGE_SIZE),
    order: "desc",
    page: "0",
    compare: "changeRate",
  });
  const block = first?.items?.[0];
  if (!block) {
    console.error(`${label}: no board`);
    return;
  }

  const total = block.totalCount || 0;
  const totalPages = Math.max(1, block.totalPage || Math.ceil(total / PAGE_SIZE));
  console.error(`${label}: ${total} quotes`);
  for (const row of block.data || []) emit(row);

  for (let pageNumber = 1; pageNumber < totalPages; pageNumber += 1) {
    const next = await hq(path, {
      delay: "false",
      size: String(PAGE_SIZE),
      order: "desc",
      page: String(pageNumber),
      compare: "changeRate",
    });
    const rows = next?.items?.[0]?.data || [];
    for (const row of rows) emit(row);
    if (pageNumber === 1 || pageNumber % 10 === 0 || pageNumber + 1 >= totalPages) {
      console.error(`  [${pageNumber + 1}/${totalPages}] ${results.length} matched`);
    }
    if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
  }
}

async function detail(path) {
  const json = await hq(path);
  const item = json?.items?.[0];
  if (!item || isStub(item)) return null;
  return item;
}

async function mapPool(items, worker) {
  for (let offset = 0; offset < items.length; offset += CONCURRENCY) {
    const batch = items.slice(offset, offset + CONCURRENCY);
    await Promise.all(batch.map((item, index) => worker(item, offset + index)));
    if (offset === 0 || (offset + CONCURRENCY) % 200 === 0 || offset + CONCURRENCY >= items.length) {
      console.error(`[${Math.min(offset + CONCURRENCY, items.length)}/${items.length}] ${results.length} matched`);
    }
    if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
  }
}

if (cryptoOnly) {
  console.error("Tiger Trade in Australia has no spot crypto shelf");
} else if (onlyTickers.size > 0) {
  await mapPool([...onlyTickers], async (ticker) => {
    const jobs = [
      `/stock_info/detail/${encodeURIComponent(ticker)}`,
      `/austock/stock_info/detail/${encodeURIComponent(`${ticker}.AU`)}`,
      `/hkstock/stock_info/detail/${padHk(ticker)}`,
      `/astock/stock_info/detail/${encodeURIComponent(ticker)}`,
    ];
    for (const path of jobs) {
      const item = await detail(path);
      if (item) emit(item);
    }
  });
} else {
  if (wantStocks || wantEtfs) {
    await quoteBoard("/market/quote/ALL", "US");
    await quoteBoard("/austock/market/quote/ALL", "ASX");
    await quoteBoard("/astock/market/quote/ALL", "China A");
  }

  // The HK all-stocks board only hands the guest token 20 names. The rest
  // of SEHK is still on /hkstock/stock_info/detail, so the catalogues walk
  // that path the way XTB walks fund ISINs.
  const hkTickers = [];
  const hkSeen = new Set();
  for (const [ticker, candidates] of tickerCandidates) {
    if (!candidates.some((candidate) => candidate.exchanges.has("HKEX"))) continue;
    if (hkSeen.has(ticker)) continue;
    hkSeen.add(ticker);
    hkTickers.push(ticker);
  }
  const jobs = hkTickers.slice(startIndex - 1);
  console.error(`${jobs.length} HKEX tickers still to confirm`);
  await mapPool(jobs, async (ticker) => {
    const item = await detail(`/hkstock/stock_info/detail/${padHk(ticker)}`);
    if (item) emit(item);
    else skip("hk stub");
  });
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
const byCurrency = new Map();
for (const row of results) byCurrency.set(row.currency, (byCurrency.get(row.currency) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"}; ` +
    `${[...byCurrency].map(([currency, count]) => `${count} ${currency}`).join(", ") || "no currency"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await browser.disconnect();
