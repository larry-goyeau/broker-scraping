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
  return (afterExchange || "").replace(/\//g, ".").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  if (/X{4,}/.test(text) || text === "US_ISIN") return "";
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

function loadByIsin(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin) continue;
    const name = normalize(columns.slice(3).join(","));
    const exchange = normalize(columns[1]).toUpperCase();
    if (!index.has(isin)) {
      index.set(isin, { kind, names: name ? [name] : [], exchange });
    }
  }
  return index;
}

function loadCryptoTickers(csvPath) {
  const tickers = new Set();
  if (!csvPath || !fs.existsSync(csvPath)) return tickers;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const ticker = normalizeTicker(line.split(",")[0]);
    if (ticker) tickers.add(ticker);
  }
  return tickers;
}

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE",
  "CO", "TRUST", "CLASS", "ETF", "UCITS", "COMMON", "STOCK", "SHARES",
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

// Thndr routes its US listings through Alpaca and, for an account that has not
// been cleared for US trading, hands back a masked ISIN. The fund or share on
// offer under a ticker is settled against the CSV by that ticker alone, US
// share classes only, with the name deciding when a ticker has carried more
// than one over time.
function resolveByTicker(tickerCandidates, ticker, name, kind) {
  const usCandidates = (tickerCandidates.get(ticker) || []).filter(
    (candidate) => candidate.isin.startsWith("US") && (!kind || !candidate.kind || candidate.kind === kind)
  );
  if (usCandidates.length === 0) return null;

  const scored = usCandidates.map((candidate) => ({
    isin: candidate.isin,
    kind: candidate.kind,
    exchanges: candidate.exchanges,
    ...scoreCandidate(name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const shortlist = scored.filter((candidate) => candidate.score === bestScore);
  return shortlist.length === 1 ? shortlist[0] : null;
}

function listingType(name, kind) {
  if (kind === "CRYPTO") return "CRYPTO";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";
  if (kind === "ETF" || /\bETFs?\b/i.test(name)) return "ETF";
  return "STOCK";
}

const EXCHANGES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  OTC: "OTC",
  EGX: "EGX",
  CASE: "EGX",
};

const US_VENUES = new Set(["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"]);

function venueOf(match, asset) {
  if (asset.market === "egypt") return "EGX";
  if (match?.exchanges?.size) {
    for (const exchange of match.exchanges) {
      const mapped = EXCHANGES[exchange] || exchange;
      if (US_VENUES.has(mapped)) return mapped;
    }
  }
  if (asset.is_otc) return "OTC";
  return "NYSE";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over. `--max-pages=N` caps a walk
// for a quick test.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));
const maxPages = numberArg("max-pages", 0) || Infinity;

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);
const byIsin = new Map();
if (wantEtfs) loadByIsin(etfsCsvPath, "ETF", byIsin);
if (wantStocks) loadByIsin(stocksCsvPath, "STOCK", byIsin);
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const outputPath = new URL("thndr-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(`${entry.ticker}:${entry.exchange || ""}`.toUpperCase());
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

const INVEST_URL = "https://web.thndr.app/invest";
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("web.thndr.app")) ||
  (await browser.newPage());
if (!page.url().includes("web.thndr.app")) {
  await page.goto(INVEST_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

const ASSETS_BASE = "https://prod.thndr.app/assets-service";

let token = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("thndr.app")) return;
  const sent = event.request.headers || {};
  const authorization = sent.Authorization || sent.authorization;
  if (authorization && authorization.startsWith("Bearer")) token = authorization;
});

async function captureToken() {
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    const input = await page
      .waitForSelector('input[type="search"], input[placeholder*="ymbol" i], input[placeholder*="earch" i], input', {
        timeout: 20000,
      })
      .catch(() => null);

    if (input) {
      await input.click({ clickCount: 3 }).catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await input.type("SPY", { delay: 90 }).catch(() => {});
    }

    for (let waited = 0; waited < 20000 && !token; waited += 250) await sleep(250);
    if (token) return true;

    await page.goto(INVEST_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(4000);
  }
  return Boolean(token);
}

if (!(await captureToken())) {
  await browser.disconnect();
  throw new Error("Could not read Thndr's API token. Is web.thndr.app/invest signed in?");
}

async function fetchPage(market, pageNumber) {
  return page.evaluate(
    async (base, authorization, marketName, pageNo) => {
      try {
        const response = await fetch(`${base}/assets?market=${marketName}&page=${pageNo}`, {
          headers: { Authorization: authorization, Accept: "application/json" },
        });
        if (!response.ok) return { status: response.status };
        const payload = await response.json();
        const rows = Array.isArray(payload?.results) ? payload.results : [];
        return {
          status: 200,
          count: payload?.count ?? null,
          assets: rows.map((row) => ({
            symbol: String(row?.symbol || "").toUpperCase(),
            name: String(row?.name || "").replace(/\s+/g, " ").trim(),
            assetClass: row?.asset_class || "",
            market: row?.market || marketName,
            currency: row?.currency || "",
            isin: row?.isin || "",
            visible: row?.is_visible !== false,
            tradable: row?.is_tradable !== false,
            delisting: Boolean(row?.delisting_date) || row?.is_marked_for_delisting === true,
            is_otc: row?.is_otc === true,
            is_right: row?.is_right === true,
          })),
        };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    ASSETS_BASE,
    token,
    market,
    pageNumber
  );
}

async function fetchPageResilient(market, pageNumber) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const answer = await fetchPage(market, pageNumber);
    if (answer?.status === 200) return answer;

    if (answer?.status === 401) {
      const stale = token;
      for (let waited = 0; waited < 15000 && token === stale; waited += 250) await sleep(250);
      if (token === stale) await captureToken();
    } else {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

async function loadMarket(market) {
  const firstPage = await fetchPageResilient(market, 1);
  if (!firstPage) throw new Error(`Thndr never returned its ${market} list.`);

  const total = firstPage.count || firstPage.assets.length;
  const pageSize = firstPage.assets.length || 10;
  const lastPage = Math.min(Math.ceil(total / pageSize) || 1, maxPages);

  const assets = [...firstPage.assets];
  const CONCURRENCY = 10;
  let next = 2;

  async function worker() {
    while (true) {
      const pageNumber = next;
      next += 1;
      if (pageNumber > lastPage) return;
      const answer = await fetchPageResilient(market, pageNumber);
      if (answer?.assets) assets.push(...answer.assets);
      if (pageNumber % 100 === 0) console.error(`  ${market} page ${pageNumber}/${lastPage}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.error(`  ${market}: ${assets.length} instruments`);
  return assets;
}

console.error("reading Thndr's instrument list");
const assets = [...(await loadMarket("us")), ...(await loadMarket("egypt"))];
console.error(`${assets.length} instruments in Thndr's offering`);

const skipped = new Map();
let unlisted = 0;

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const asset of assets) {
  const ticker = normalizeTicker(asset.symbol);
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;
  if (asset.delisting) {
    skip("delisted");
    continue;
  }
  if (!asset.visible || !asset.tradable) {
    skip("not tradable");
    continue;
  }
  if (asset.is_right) {
    skip("right");
    continue;
  }

  const className = String(asset.assetClass || "").toUpperCase();
  if (className === "FUND") {
    skip("mutual fund");
    continue;
  }
  if (className === "INDEX") {
    skip("index");
    continue;
  }

  const isin = toIsin(asset.isin);
  const listedByIsin = isin ? byIsin.get(isin) : null;
  const etfMatch = wantEtfs ? resolveByTicker(tickerCandidates, ticker, asset.name, "ETF") : null;
  const stockMatch = wantStocks ? resolveByTicker(tickerCandidates, ticker, asset.name, "STOCK") : null;

  let match = listedByIsin
    ? { isin, kind: listedByIsin.kind, exchanges: new Set(listedByIsin.exchange ? [listedByIsin.exchange] : []) }
    : null;
  if (!match) {
    if (etfMatch && stockMatch) {
      match = /\bET[FNC]s?\b/i.test(asset.name) ? etfMatch : stockMatch;
    } else {
      match = etfMatch || stockMatch;
    }
  }

  const type = listingType(asset.name, match?.kind || (className === "CRYPTO" ? "CRYPTO" : "STOCK"));
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;
  if (type === "CRYPTO") {
    if (!wantCrypto) continue;
    if (!cryptoTickers.has(ticker) && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
  } else if (!match && !keepUnlisted) {
    unlisted += 1;
    continue;
  }

  const exchange = type === "CRYPTO" ? "CRYPTO" : venueOf(match, asset);
  const currency = normalize(asset.currency).toUpperCase() || (asset.market === "egypt" ? "EGP" : "USD");
  const key = `${ticker}:${exchange || ""}:${currency}:${type}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name: asset.name || match?.name || ticker,
    exchange,
    currency,
    type,
    raw: [ticker, asset.name, asset.market].filter(Boolean).join(" "),
    isin: match?.isin || isin || "",
  });
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await browser.disconnect();
