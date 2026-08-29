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

// Tradier reports the listing venue as the single letter used on the tape. The
// mapping below is the one the CSV agreed with on 4,609 of 4,613 listings that
// a ticker alone identified, the four exceptions being funds that have since
// moved venue.
const EXCHANGE_NAMES = {
  A: "AMEX",
  N: "NYSE",
  P: "AMEX",
  Q: "NASDAQ",
  V: "NASDAQ",
  Z: "CBOE",
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

// Tradier only carries US listings, so the US share class trading under the
// ticker is the fund on offer. Where a ticker covers several of them, the
// venue Tradier quotes it on tells them apart before the name has to.
function resolveIsin(tickerCandidates, security) {
  const usCandidates = (tickerCandidates.get(security.ticker) || []).filter((candidate) =>
    candidate.isin.startsWith("US")
  );
  if (usCandidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[security.exchange];
  const sameVenue = venue
    ? usCandidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const candidates = sameVenue.length > 0 ? sameVenue : usCandidates;

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(security.name, candidate),
  }));

  // A lone US listing under the ticker is the fund, whatever it is called: the
  // lookup abbreviates names past recognition ("Ptshs Bs Sp 500 Ex-hlth Etf").
  if (scored.length === 1 && security.confirmed) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const shortlist = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return shortlist.length === 1 ? shortlist[0] : null;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("tradier.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to tradier-parsed.json.
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

const outputPath = new URL("tradier-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entry.ticker.toUpperCase());
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const RESEARCH_URL = "https://web.tradier.com/research/SPY";
const LOOKUP_URL = "https://api.tradier.com/v1/markets/lookup";

// The web app reads its market data off Tradier's public API with a token it
// only hands out to itself, so the token is taken off the wire as the app
// starts rather than asking the page for it.
async function captureToken() {
  const client = await page.createCDPSession();
  await client.send("Network.enable");

  let authorization = null;
  client.on("Network.requestWillBeSent", (event) => {
    if (!event.request.url.startsWith("https://api.tradier.com/")) return;
    const sent = event.request.headers || {};
    authorization = sent.Authorization || sent.authorization || authorization;
  });

  await page.goto(RESEARCH_URL, { waitUntil: "domcontentloaded" });
  for (let waited = 0; waited < 60000 && !authorization; waited += 250) await sleep(250);
  await client.detach().catch(() => {});

  if (!authorization) {
    throw new Error("Could not read Tradier's API token. Is web.tradier.com signed in?");
  }
  return authorization;
}

const token = await captureToken();

// An empty query returns everything Tradier lists of the asked-for kinds, so
// the whole offer arrives in one call instead of a search per ticker.
function lookup(types) {
  return page.evaluate(
    async (url, authorization, kinds) => {
      const response = await fetch(`${url}?q=&types=${kinds}`, {
        headers: { Authorization: authorization, Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`lookup ${kinds} answered ${response.status}`);

      const payload = await response.json();
      const securities = payload?.securities?.security;
      return Array.isArray(securities) ? securities : securities ? [securities] : [];
    },
    LOOKUP_URL,
    token,
    types
  );
}

const listed = [...(await lookup("etf")), ...(await lookup("stock"))];

// Indices come back whichever kind is asked for, and they are not tradable.
// The exchange-traded notes and commodity trusts the CSV counts as funds are
// filed under "stock", so they are kept and left to the CSV to confirm.
const securities = [];
const listedTickers = new Set();
for (const security of listed) {
  const type = (security?.type || "").toLowerCase();
  if (type !== "etf" && type !== "stock") continue;

  const ticker = (security.symbol || "").toUpperCase();
  const name = (security.description || "").replace(/\s+/g, " ").trim();
  if (!ticker || listedTickers.has(ticker)) continue;
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;
  listedTickers.add(ticker);

  securities.push({
    ticker,
    name,
    exchange: (security.exchange || "").toUpperCase(),
    // Only the funds Tradier itself files as such can be taken on trust; the
    // rest have to be named by the CSV to count as a fund at all.
    confirmed: type === "etf",
  });
}

console.error(`${securities.length} instruments listed, matching them to the CSV`);

for (const [index, security] of securities.entries()) {
  if (index + 1 < startIndex) continue;
  if (seen.has(security.ticker)) continue;

  const candidate = resolveIsin(tickerCandidates, security);
  if (!candidate) continue;
  seen.add(security.ticker);

  const venue = EXCHANGE_NAMES[security.exchange] || security.exchange;
  results.push({
    query: security.ticker,
    ticker: security.ticker,
    name: security.name || candidate.name,
    exchange: venue || null,
    // Tradier serves US venues only, so every line quotes in dollars.
    currency: "USD",
    type: "ETF",
    raw: [security.ticker, security.name, security.exchange].filter(Boolean).join(" "),
    isin: candidate.isin,
  });
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(`${results.length} funds matched`);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
