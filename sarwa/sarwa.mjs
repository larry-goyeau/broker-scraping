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
  return afterExchange;
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

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// Sarwa names the venue the way the tape does. ARCA funds settle on AMEX
// in the catalogues, the same way Alpaca and Robinhood map them.
const EXCHANGE_NAMES = {
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
};

function loadTickerCandidatesFromCsv(csvPath, kind, into = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return into;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = normalize(isinIndex >= 1 ? columns[isinIndex - 1] : columns[1]).toUpperCase();
    const name = (isinIndex >= 0 ? columns.slice(isinIndex + 1) : columns.slice(3)).join(",").trim();
    if (!name) continue;

    const candidates = into.get(ticker) || [];
    into.set(ticker, candidates);

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

  return into;
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

// Sarwa only carries US listings, so the US share class trading under the
// ticker is the instrument on offer. Where a ticker covers several of them,
// the venue tells them apart before the name has to.
function resolveListing(tickerCandidates, ticker, name, exchange) {
  const usCandidates = (tickerCandidates.get(ticker) || []).filter((candidate) =>
    candidate.isin.startsWith("US")
  );
  if (usCandidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[exchange] || exchange;
  const sameVenue = venue
    ? usCandidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : usCandidates;

  const scored = shortlist.map((candidate) => ({
    isin: candidate.isin,
    kind: candidate.kind,
    ...scoreCandidate(name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((entry) => entry.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((entry) => entry.score === bestScore);
  return winners.length === 1 ? winners[0] : null;
}

function listingType(attributes) {
  const kind = String(attributes.type || "").toLowerCase();
  if (kind === "crypto") return "CRYPTO";
  const text = attributes.name || "";
  if (/\bETNs?\b/i.test(text)) return "ETN";
  if (/\bETCs?\b/i.test(text) && !/\bETFs?\b/i.test(text)) return "ETC";
  if (kind === "etf") return "ETF";
  return "STOCK";
}

function assetTicker(attributes) {
  if (String(attributes.type || "").toLowerCase() === "crypto") {
    return normalizeTicker(attributes.friendly_symbol || attributes.symbol);
  }
  return normalizeTicker(attributes.symbol || attributes.friendly_symbol);
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const fundsByTicker = wantEtfs ? loadTickerCandidatesFromCsv(etfsCsvPath, "ETF") : new Map();
const stocksByTicker = wantStocks ? loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK") : new Map();
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const outputPath = new URL("sarwa-parsed.json", import.meta.url);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const TRADE_URL = "https://www.sarwa.co/trade";
const pages = await browser.pages();
const page =
  pages.find((candidate) => /sarwa\.co/i.test(candidate.url())) || (await browser.newPage());
await page.bringToFront();
if (!/sarwa\.co/i.test(page.url())) {
  await page.goto(TRADE_URL, { waitUntil: "domcontentloaded" });
}

const ASSETS_URL = "https://apiv2.sarwa.co/api/v1/assets?paginate=false";

// The app signs its calls with a token that lasts a quarter of an hour, so it
// is read off the app's own traffic rather than minted here.
let token = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("apiv2.sarwa.co")) return;
  const sent = event.request.headers || {};
  token = sent.Authorization || sent.authorization || token;
});

async function captureToken() {
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    const input = await page
      .waitForSelector('input[placeholder*="Search" i], input[type="search"], input', { timeout: 20000 })
      .catch(() => null);

    if (input) {
      await input.click({ clickCount: 3 }).catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await input.type("VOO", { delay: 70 }).catch(() => {});
    }

    for (let waited = 0; waited < 20000 && !token; waited += 250) await sleep(250);
    if (token) return true;

    await page.goto(TRADE_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(4000);
  }
  return Boolean(token);
}

if (!(await captureToken())) {
  await browser.disconnect();
  throw new Error("Could not read Sarwa's API token. Is www.sarwa.co/trade signed in?");
}

async function loadAssets() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await page.evaluate(
      async (url, authorization) => {
        try {
          const response = await fetch(url, {
            headers: { Authorization: authorization, Accept: "application/json" },
          });
          if (!response.ok) return { status: response.status };
          const payload = await response.json();
          return { status: 200, data: payload?.data || [] };
        } catch (error) {
          return { status: 0, error: String(error) };
        }
      },
      ASSETS_URL,
      token
    );

    if (answer?.status === 200) return answer.data;

    const stale = token;
    for (let waited = 0; waited < 20000 && token === stale; waited += 250) await sleep(250);
    if (token === stale) await captureToken();
  }

  throw new Error("Sarwa never returned its instrument list.");
}

const assets = await loadAssets();
console.error(`${assets.length} instruments in Sarwa's offering`);

const results = [];
const seen = new Set();
let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const asset of assets) {
  const attributes = asset?.attributes || {};
  const exchangeCode = String(attributes.exchange || "").toUpperCase();

  // ASCX leftover perps (BTCUSD.P), not the cash book.
  if (exchangeCode === "ASCX" || /\.P$/.test(String(attributes.symbol || ""))) {
    skip("perp");
    continue;
  }

  const type = listingType(attributes);
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;
  if (type === "CRYPTO" && !wantCrypto) continue;

  const ticker = assetTicker(attributes);
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

  const quoted = normalize(attributes.name);
  let match = null;
  if (type === "CRYPTO") {
    if (!cryptoTickers.has(ticker) && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
  } else {
    const catalogue = type === "STOCK" ? stocksByTicker : fundsByTicker;
    match = resolveListing(catalogue, ticker, quoted, exchangeCode);
    if (!match && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
  }

  const exchange = type === "CRYPTO" ? "CRYPTO" : EXCHANGE_NAMES[exchangeCode] || exchangeCode || null;
  const name = quoted || match?.name || ticker;
  const isin = match?.isin || "";
  const key = `${isin || ticker}:${exchange}:${ticker}:USD:${type}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency: "USD",
    type,
    raw: [attributes.symbol || ticker, name, attributes.exchange].filter(Boolean).join(" "),
    isin,
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
