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
  return (afterExchange || "").split(/[/]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// Alpaca names a listing after the venue it is quoted on, so NYSE Arca comes
// through as ARCA and Cboe BZX as BATS, both of which the CSV files under the
// exchange that owns them.
const EXCHANGE_NAMES = {
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  OTC: "OTC",
};

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
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
    const exchange = (columns[isinIndex - 1] || "").trim().toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({ isin, names: [name], exchanges: new Set(exchange ? [exchange] : []) });
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated funds, so counting them would
// let a same-ticker instrument pass for the one being looked up.
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
  "COMMON",
  "STOCK",
  "SHARES",
  "CLASS",
]);

function nameTokens(value) {
  return (value || "")
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

  // Dividing by the longer name keeps a terser wording from outscoring the fund
  // actually named just by leaving words out.
  return matched / Math.max(scraped.length, candidate.length);
}

// Picks the wording of a candidate that reads closest to what was scraped.
function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// An American ticker belongs to one instrument apiece, so the fund Alpaca
// quotes under it is the one the CSV files on that same venue. Where a ticker
// covers several share classes the venue tells them apart before the name has
// to, and the name only has to settle what is left.
function resolveIsin(tickerCandidates, asset) {
  const candidates = tickerCandidates.get(asset.ticker) || [];
  if (candidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[asset.exchange];
  const sameVenue = venue
    ? candidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(asset.name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return winners.length === 1 ? winners[0] : null;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://app.alpaca.markets/trade/SPY";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("app.alpaca.markets")) ||
  (await browser.newPage());
if (!page.url().includes("app.alpaca.markets")) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to parsed_json/alpaca-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

const outputPath = new URL("../parsed_json/alpaca-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query) seen.add(entry.query);
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

// Alpaca trades America alone, so a ticker the CSV only lists abroad is a
// namesake of an American share rather than the fund being looked for.
const MARKET_EXCHANGES = new Set(Object.values(EXCHANGE_NAMES));

const wanted = new Set();
for (const [ticker, candidates] of tickerCandidates) {
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;
  const exchanges = new Set(candidates.flatMap((candidate) => [...candidate.exchanges]));
  if (![...exchanges].some((exchange) => MARKET_EXCHANGES.has(exchange))) continue;
  wanted.add(ticker);
}
console.error(`${wanted.size} American tickers to look for`);

// The app signs its calls with a token it renews on its own, so it is read off
// the app's own traffic rather than minted here.
let token = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("alpaca.markets")) return;
  const sent = event.request.headers || {};
  const authorization = sent.Authorization || sent.authorization || "";
  if (authorization.startsWith("Bearer ")) token = authorization;
});

// The platform polls its own feeds every few seconds, so a token turns up on
// its own once a trading page is open; a reload hurries it along.
async function captureToken() {
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    for (let waited = 0; waited < 20000 && !token; waited += 250) await sleep(250);
    if (token) return true;

    await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(3000);
  }
  return Boolean(token);
}

if (!(await captureToken())) {
  throw new Error("Could not read Alpaca's API token. Is app.alpaca.markets signed in?");
}

// The whole American offer comes down in one answer, so there is nothing to
// page through and nothing to search for.
async function loadAssets() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await page.evaluate(async (authorization) => {
      try {
        const response = await fetch(
          "https://app.alpaca.markets/api/v1/assets?status=active&asset_class=us_equity",
          { headers: { Authorization: authorization } }
        );
        if (!response.ok) return { status: response.status };
        return { status: 200, rows: await response.json() };
      } catch (error) {
        return { status: 0 };
      }
    }, token);

    if (answer.status === 200 && Array.isArray(answer.rows)) return answer.rows;

    // The token turns over on its own; wait for the app to mint a new one
    // before asking again.
    const stale = token;
    for (let waited = 0; waited < 30000 && token === stale; waited += 250) await sleep(250);
    if (token === stale) {
      token = null;
      await captureToken();
    }
  }

  return [];
}

const assets = await loadAssets();
if (assets.length === 0) {
  throw new Error("Alpaca returned no assets.");
}
console.error(`${assets.length} listings in Alpaca's book`);

// Alpaca keeps delisted and broker-blocked shares in the book under the active
// status, and marks what an account may actually place an order on.
const onTicker = assets
  .filter((asset) => EXCHANGE_NAMES[String(asset.exchange || "").toUpperCase()])
  .filter((asset) => wanted.has(String(asset.symbol || "").toUpperCase()));
const listings = onTicker
  .filter((asset) => asset.tradable)
  .sort((left, right) => left.symbol.localeCompare(right.symbol));
const refused = onTicker.length - listings.length;
console.error(`${listings.length} of them carry a ticker the CSV lists in America`);

let unmatched = 0;

for (const [index, asset] of listings.entries()) {
  if (index + 1 < startIndex) continue;

  const ticker = String(asset.symbol).toUpperCase();
  if (seen.has(ticker)) continue;

  const exchange = String(asset.exchange).toUpperCase();
  const name = String(asset.name || "").replace(/\s+/g, " ").trim();

  const candidate = resolveIsin(tickerCandidates, { ticker, name, exchange });
  if (!candidate) {
    // Alpaca's book is stocks and funds alike, so a name that reads nothing
    // like the fund on that ticker is a share that happens to share it.
    unmatched += 1;
    continue;
  }

  seen.add(ticker);
  results.push({
    query: ticker,
    ticker,
    name: name || candidate.name,
    exchange: EXCHANGE_NAMES[exchange],
    // The assets endpoint is asked for US equities only, so every line quotes
    // in dollars.
    currency: "USD",
    type: "ETF",
    raw: [ticker, name, exchange].filter(Boolean).join(" "),
    isin: candidate.isin,
  });
}

fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(`${results.length} funds matched, ${unmatched} listings not the fund on that ticker, ${refused} refused`);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
