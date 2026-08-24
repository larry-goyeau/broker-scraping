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

// Sarwa names the venue the way the tape does. The mapping onto the CSV's own
// vocabulary was the one it agreed with on 4,722 of the 4,727 funds a ticker
// alone identified, the five exceptions being funds that have changed venue.
const EXCHANGE_NAMES = {
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
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

// Sarwa only carries US listings, so the US share class trading under the
// ticker is the fund on offer. Where a ticker covers several of them, the
// venue Sarwa quotes it on tells them apart before the name has to, which
// matters because notes are named after their issuer ("Barclays ETN+ Select
// MLP ETN").
function resolveIsin(tickerCandidates, asset) {
  const usCandidates = (tickerCandidates.get(asset.ticker) || []).filter((candidate) =>
    candidate.isin.startsWith("US")
  );
  if (usCandidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[asset.exchange];
  const sameVenue = venue
    ? usCandidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const candidates = sameVenue.length > 0 ? sameVenue : usCandidates;

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(asset.name, candidate),
  }));

  // A lone US fund under a ticker Sarwa offers is that fund, whatever either
  // side calls it.
  if (scored.length === 1) return scored[0];

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

const TRADE_URL = "https://www.sarwa.co/trade";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("sarwa.co")) || (await browser.newPage());
if (!page.url().includes("sarwa.co")) {
  await page.goto(TRADE_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to parsed_json/sarwa-parsed.json.
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
  return "etfs.csv";
})();

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

const outputPath = "parsed_json/sarwa-parsed.json";
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

// Nothing is signed until the app has something to ask, so the search box is
// given a symbol to look up.
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
  throw new Error("Could not read Sarwa's API token. Is www.sarwa.co/trade signed in?");
}

// Sarwa hands over everything it trades in one answer, so the offer is read
// whole instead of a search per ticker.
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

    // The token turns over every fifteen minutes; the app renews it on its own.
    const stale = token;
    for (let waited = 0; waited < 20000 && token === stale; waited += 250) await sleep(250);
    if (token === stale) await captureToken();
  }

  throw new Error("Sarwa never returned its instrument list.");
}

const assets = await loadAssets();
console.error(`${assets.length} instruments offered`);

// Sarwa files notes and commodity trusts as funds too, which is what the CSV
// counts them as; everything else it lists is a share or a coin.
const etfs = [];
for (const asset of assets) {
  const attributes = asset?.attributes || {};
  if ((attributes.type || "").toLowerCase() !== "etf") continue;

  const ticker = (attributes.symbol || attributes.friendly_symbol || "").toUpperCase();
  if (!ticker) continue;
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

  etfs.push({
    ticker,
    name: (attributes.name || "").replace(/\s+/g, " ").trim(),
    exchange: (attributes.exchange || "").toUpperCase(),
  });
}

console.error(`${etfs.length} of them are funds, matching them to the CSV`);

for (const [index, etf] of etfs.entries()) {
  if (index + 1 < startIndex) continue;
  if (seen.has(etf.ticker)) continue;

  const candidate = resolveIsin(tickerCandidates, etf);
  if (!candidate) continue;
  seen.add(etf.ticker);

  results.push({
    query: etf.ticker,
    ticker: etf.ticker,
    name: etf.name || candidate.name,
    exchange: EXCHANGE_NAMES[etf.exchange] || etf.exchange || null,
    // Sarwa Trade offers US listings only, so every line quotes in dollars.
    currency: "USD",
    type: "ETF",
    raw: [etf.ticker, etf.name, etf.exchange].filter(Boolean).join(" "),
    isin: candidate.isin,
  });
}

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(`${results.length} funds matched`);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
