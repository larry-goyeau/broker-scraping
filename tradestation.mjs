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

// The page is only there so we can lift the bearer token its GraphQL calls
// already send. The lookups themselves go to api.tradestation.com from here.
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
    throw new Error(
      "Could not read TradeStation's API token. Is the session still signed in?"
    );
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

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/tradestation-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["SPY", "ACWI", "VTI"];
const cliQueries = positionalArgs.map(normalizeTicker).filter(Boolean);

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
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

const outputPath = "parsed_json/tradestation-parsed.json";
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

const BATCH_SIZE = 100;

function save() {
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.error(`${queries.length} tickers to check`);

let silences = 0;

for (let offset = startIndex - 1; offset < queries.length; offset += BATCH_SIZE) {
  const batch = queries.slice(offset, offset + BATCH_SIZE);
  for (const [index, query] of batch.entries()) {
    console.error(`[${offset + index + 1}/${queries.length}] ${query}`);
  }

  const rows = await getSymbols(batch);
  if (rows === null) {
    silences += 1;
    console.error(
      `[${offset + 1}-${offset + batch.length}] no answer`
    );
    if (silences >= 3) {
      throw new Error("TradeStation stopped answering. Is the session still signed in?");
    }
    continue;
  }
  silences = 0;

  const byName = new Map();
  for (const row of rows) {
    const ticker = (row.Name || "").toUpperCase();
    if (ticker) byName.set(ticker, row);
  }

  for (const query of batch) {
    const data = byName.get(query);
    if (!data || data.Error || !data.Description) continue;

    const ticker = (data.Name || "").toUpperCase();
    if (ticker !== query) continue;

    const name = (data.Description || "").replace(/\s+/g, " ").trim();

    // A name can match by coincidence: the list files AMZN as a 1x Amazon
    // tracker ETP, and matching on "Amazon" lands on Amazon the company.
    // TradeStation files both as AssetType "Stock", so the legal suffix is
    // what gives a collision away — a fund's description does not end in Inc.
    if (
      /\b(INC|CORP|CORPORATION|LTD|LIMITED|LLC|LP)\.?\b/i.test(name) &&
      !/\bFIXED INC\b/i.test(name) &&
      !/\b(ETF|ETN|ETC|ETP|UCITS)\b/i.test(name)
    ) {
      console.error(`  ${ticker} is ${name} here, not a fund — skipped`);
      continue;
    }

    const isin = resolveIsin(tickerCandidates, ticker, name);
    if ((tickerCandidates.get(ticker) || []).length > 0 && !isin) continue;

    const key = `${query}:${ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const exchange = (data.Exchange || "").replace(/\s+/g, " ").trim().toUpperCase();

    results.push({
      query,
      ticker,
      name,
      exchange: exchange || null,
      currency: (data.Currency || "").toUpperCase() || null,
      type: "ETF",
      raw: [ticker, name, exchange, data.Currency].filter(Boolean).join(" "),
      isin,
    });
  }

  save();
}

save();
console.log(JSON.stringify(results, null, 2));

await client.detach();
await browser.disconnect();
