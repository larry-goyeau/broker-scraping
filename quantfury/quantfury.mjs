import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  // Quantfury suffixes some symbols with a venue tag (TLT.OQ); the CSV carries
  // its own (.GB/.USD). Strip both so one bare ticker keys the two sides.
  return (afterExchange || "").split(/[./]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// The CSV rows are `ticker,exchange,isin,name`; one ISIN recurs across venues
// under differently worded names, so every spelling and venue is kept and the
// closest wording decides a match.
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
  "TRUST",
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

// Quantfury names a listing by its operator (NYSE, NASDAQ, B3), quoting even
// NYSE Arca funds as "NYSE"; the CSV files US funds across AMEX/NYSE/NASDAQ, so
// each operator expands to the venues it can cover and the fund settles it.
const EXCHANGE_VENUES = {
  NYSE: ["AMEX", "NYSE", "NASDAQ", "CBOE", "ARCA", "BATS", "IEX", "OTC"],
  NASDAQ: ["NASDAQ", "AMEX", "NYSE", "CBOE", "ARCA", "BATS", "IEX", "OTC"],
  B3: ["BMFBOVESPA", "BOVESPA", "BIVA"],
};

const VENUE_CURRENCIES = {
  NYSE: "USD",
  NASDAQ: "USD",
  B3: "BRL",
};

// A shared ticker is not a shared fund. When the venue Quantfury quotes agrees
// with where the CSV carries the ticker, the venue settles it and a verbose
// legal name need not be re-derived; without that agreement the name must carry
// the match so a cross-border ticker clash cannot slip through.
function resolveIsin(tickerCandidates, ticker, name, venues) {
  const candidates = tickerCandidates.get(ticker) || [];
  if (candidates.length === 0) return null;

  const allowed = new Set(venues || []);
  const sameVenue =
    allowed.size > 0
      ? candidates.filter((candidate) => [...candidate.exchanges].some((exchange) => allowed.has(exchange)))
      : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    candidate,
    isin: candidate.isin,
    ...scoreCandidate(name, candidate),
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
    [...winner.candidate.exchanges][0] ||
    "";
  return { isin: winner.isin, name: winner.name, exchange };
}

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const outputPath = new URL("quantfury-parsed.json", import.meta.url);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("quantfury.com")) || (await browser.newPage());
await page.bringToFront();

// Quantfury's catalogue lives behind Cloudflare and a session bearer the app
// mints per load, so the request is captured from its own traffic and replayed
// from the page context; a plain server-side fetch is turned away.
const client = await page.target().createCDPSession();
await client.send("Network.enable");

let apiHeaders = null;
client.on("Network.requestWillBeSent", (event) => {
  const headers = event.request.headers || {};
  const token = headers.Authorization || headers.authorization;
  if (
    event.request.method === "GET" &&
    /trdngbcknd\.com\/v13\//.test(event.request.url) &&
    token &&
    (headers["Custom-DeviceId"] || headers["custom-deviceid"])
  ) {
    apiHeaders = headers;
  }
});

if (!page.url().includes("trading.quantfury.com")) {
  await page.goto("https://trading.quantfury.com/", { waitUntil: "domcontentloaded" });
} else {
  await page.reload({ waitUntil: "domcontentloaded" });
}

// Wait for the app to make an authenticated backend call so its bearer and
// device headers can be borrowed.
for (let waited = 0; waited < 30000 && !apiHeaders; waited += 300) {
  await sleep(300);
}
if (!apiHeaders) {
  await browser.disconnect();
  throw new Error("could not capture Quantfury session headers (is the app logged in?)");
}

const replayHeaders = Object.fromEntries(
  Object.entries(apiHeaders).filter(([key]) => !key.startsWith(":") && !/^(host|content-length|referer)$/i.test(key))
);

// afterDate=0 turns the incremental sync into a full dump of the catalogue.
const response = await page.evaluate(async (headers) => {
  const res = await fetch("https://i1.trdngbcknd.com/v13/instruments?afterDate=0", { headers });
  const text = await res.text();
  return { status: res.status, text };
}, replayHeaders);

await browser.disconnect();

if (response.status !== 200) {
  throw new Error(`instruments endpoint returned ${response.status}`);
}

const catalogue = JSON.parse(response.text).data.updated || [];
// t === 6 is Quantfury's ETF type, the same convention eToro uses; every ETF it
// carries -- offered to non-US clients as a CFD on the US listing or not -- is
// tagged this way, so the type alone gathers the lot.
const ETF_TYPE = 6;
const etfs = catalogue.filter((instrument) => instrument.t === ETF_TYPE);
console.error(`${etfs.length} ETFs in Quantfury's catalogue`);

const results = [];
let unmatched = 0;

for (const instrument of etfs) {
  const ticker = normalizeTicker(instrument.snd || instrument.sn || "");
  if (!ticker) continue;
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

  const name = (instrument.n || instrument.hn || "").replace(/\s+/g, " ").trim();
  const venue = (instrument.en || "").toUpperCase();
  const venues = EXCHANGE_VENUES[venue] || (instrument.eci === "US" ? EXCHANGE_VENUES.NYSE : []);

  const match = resolveIsin(tickerCandidates, ticker, name, venues);
  if (!match) {
    unmatched += 1;
    continue;
  }

  results.push({
    ticker,
    name,
    exchange: match.exchange || venue,
    // The operator says the currency: São Paulo trades in reais, the American
    // venues in dollars.
    currency: VENUE_CURRENCIES[venue] || (instrument.eci === "US" ? "USD" : null),
    type: "ETF",
    raw: [instrument.sn, name, venue].filter(Boolean).join(" "),
    isin: match.isin,
  });
}

results.sort((left, right) => left.ticker.localeCompare(right.ticker));

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(`${results.length} ETFs matched to ${csvPath} | ${unmatched} with no CSV match`);
console.log(JSON.stringify(results, null, 2));
