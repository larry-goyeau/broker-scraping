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
  "CO", "TRUST", "CLASS", "ETF", "ETC", "ETN", "ETP", "UCITS", "FUND", "SHARES",
  "ISHARES",
]);

function nameTokens(value) {
  return new Set(
    normalize(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token))
  );
}

function resolveListing(tickerCandidates, ticker, scrapedName, type) {
  const kind = type === "STOCK" ? "STOCK" : "ETF";
  let candidates = (tickerCandidates.get(ticker) || []).filter(
    (candidate) => !candidate.kind || candidate.kind === kind
  );
  const us = candidates.filter((candidate) => candidate.isin.startsWith("US"));
  if (us.length > 0) candidates = us;
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const scrapedTokens = nameTokens(scrapedName);
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = Math.max(
      0,
      ...candidate.names.map((name) => [...scrapedTokens].filter((token) => nameTokens(name).has(token)).length)
    );
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore > 0 ? best : null;
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

// TradeStation files shares and funds as AssetType Stock. GDAX pairs such
// as BCHUSD are forex quotes: searching BCH opens Banco de Chile, not the
// coin. An empty sector used to mark a fund, but BCH the ADS has no sector
// either, so a ticker that only the share list carries stays a share.
function listingType(row, ticker) {
  const asset = normalize(row.AssetType).toLowerCase();
  const name = normalize(row.Description || row.Name);
  if (asset && asset !== "stock") return "";

  if (/\bETNs?\b/i.test(name)) return "ETN";
  // "ETC 6 Meridian…" is Exchange Traded Concepts, the issuer, not a commodity ETC.
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) return "ETC";
  if (/\bETFs?\b|\bETPs?\b|\bUCITS\b/i.test(name)) return "ETF";
  if (
    /\bTRUST\b/i.test(name) &&
    !/\b(REIT|REALTY|INVESTMENT TRUST)\b/i.test(name) &&
    !/\b(INC|CORP|CORPORATION|LTD|LIMITED|LLC|ADS)\.?\b/i.test(name)
  ) {
    return "ETF";
  }

  const candidates = tickerCandidates.get(ticker) || [];
  const hasStock = candidates.some((candidate) => candidate.kind === "STOCK");
  const hasFund = candidates.some((candidate) => candidate.kind === "ETF");
  if (hasStock && !hasFund) return "STOCK";
  if (hasFund && !hasStock) return "ETF";

  const sectors = (row.Sectors || []).map((sector) => normalize(sector.Name)).filter(Boolean);
  const sector = sectors[0] || "";
  if (sector && sector !== "NC" && sector !== "Other") return "STOCK";
  if (/\b(INC|CORP|CORPORATION|LTD|LIMITED|LLC|ADS)\.?\b/i.test(name)) return "STOCK";
  return "ETF";
}

const EXCHANGES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  ARCX: "AMEX",
  ARCA: "AMEX",
  AMEX: "AMEX",
  ASE: "AMEX",
  BATS: "CBOE",
  BZX: "CBOE",
  CBOE: "CBOE",
  OTC: "OTC",
  OTCQX: "OTC",
  OTCQB: "OTC",
  PINX: "OTC",
  PINK: "OTC",
};

const US_VENUES = new Set(["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"]);

function venueOf(raw, match) {
  const code = normalize(raw).toUpperCase();
  if (EXCHANGES[code]) return EXCHANGES[code];
  if (/^OTC/.test(code) || /PINK|PINX/.test(code)) return "OTC";
  const fromCatalogue = [...(match?.exchanges || [])].find((exchange) =>
    US_VENUES.has(EXCHANGES[exchange] || exchange)
  );
  if (fromCatalogue) return EXCHANGES[fromCatalogue] || fromCatalogue;
  return "";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const catalogueQueries = [...tickerCandidates.entries()]
  .filter(([, candidates]) => candidates.some((candidate) => candidate.isin.startsWith("US")))
  .map(([ticker]) => ticker);

const queries = uniqueQueries(onlyTickers.size > 0 ? [...onlyTickers] : catalogueQueries);

const outputPath = new URL("tradestation-parsed.json", import.meta.url);
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

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("my.tradestation.com")) ||
  (await browser.newPage());

if (!page.url().includes("my.tradestation.com")) {
  await page.goto("https://my.tradestation.com/portfolio/research?symbol=SPY", {
    waitUntil: "domcontentloaded",
  });
  await sleep(3000);
}

const client = await page.createCDPSession();
await client.send("Network.enable");

let token = "";
client.on("Network.requestWillBeSent", (event) => {
  if (!/api\.tradestation\.com/i.test(event.request.url)) return;
  const auth = event.request.headers.Authorization || event.request.headers.authorization;
  if (auth) token = auth.replace(/^Bearer\s+/i, "");
});

async function waitForToken() {
  const started = Date.now();
  while (!token && Date.now() - started < 2500) await sleep(200);
  if (token) return token;

  await page.goto("https://my.tradestation.com/portfolio/research?symbol=SPY", {
    waitUntil: "domcontentloaded",
  });
  const again = Date.now();
  while (!token && Date.now() - again < 15000) await sleep(200);
  if (!token) {
    throw new Error("Could not read TradeStation's API token. Is the session still signed in?");
  }
  return token;
}

await waitForToken();

const SYMBOLS_QUERY = `query FetchSymbolAssetType($symbols: [String!]!) {
  getSymbols(symbols: $symbols) {
    AssetType
    Name
    Description
    Exchange
    Currency
    Error
    Sectors { Name }
  }
}`;

async function getSymbols(symbols) {
  const request = async (bearer) => {
    const response = await fetch("https://api.tradestation.com/graphql/v1/live/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        operationName: "FetchSymbolAssetType",
        query: SYMBOLS_QUERY,
        variables: { symbols },
      }),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  };

  let answer = await request(token);
  if (answer.status === 401) {
    token = "";
    await page.reload({ waitUntil: "domcontentloaded" });
    answer = await request(await waitForToken());
  }

  if (!Array.isArray(answer.json?.data?.getSymbols)) return null;
  return answer.json.data.getSymbols;
}

const BATCH_SIZE = 100;
const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

console.error(`${queries.length} tickers to check`);

let silences = 0;
let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (let offset = startIndex - 1; offset < queries.length; offset += BATCH_SIZE) {
  const batch = queries.slice(offset, offset + BATCH_SIZE);
  const rows = await getSymbols(batch);
  if (rows === null) {
    silences += 1;
    if (silences >= 3) {
      throw new Error("TradeStation stopped answering. Is the session still signed in?");
    }
    continue;
  }
  silences = 0;

  const byName = new Map();
  for (const row of rows) {
    const symbol = normalizeTicker(row.Name);
    if (symbol) byName.set(symbol, row);
  }

  for (const query of batch) {
    const data = byName.get(query);
    if (!data || data.Error || !data.Description) {
      skip("not carried");
      continue;
    }

    const ticker = normalizeTicker(data.Name);
    if (!ticker) {
      skip("no ticker");
      continue;
    }
    if (ticker !== query) {
      skip("alias");
      continue;
    }

    const type = listingType(data, ticker);
    if (!type) {
      skip(String(data.AssetType || "unknown").toLowerCase() || "unknown");
      continue;
    }
    if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
    if (type === "STOCK" && !wantStocks) continue;

    const name = normalize(data.Description);
    const match = resolveListing(tickerCandidates, ticker, name, type);
    if (!match && !keepUnlisted) {
      unlisted += 1;
      continue;
    }

    const exchange = venueOf(data.Exchange, match);
    if (!US_VENUES.has(exchange)) {
      skip("foreign tape");
      continue;
    }

    const key = `${ticker}:${type}:${exchange}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency: normalize(data.Currency).toUpperCase() || "USD",
      type,
      raw: [ticker, name, exchange, data.Currency].filter(Boolean).join(" "),
      isin: match?.isin || "",
    });
  }

  if (offset === 0 || (offset + BATCH_SIZE) % 500 === 0 || offset + BATCH_SIZE >= queries.length) {
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
