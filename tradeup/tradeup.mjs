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

// TradeUP names the venue the way the tape does. The mapping onto the CSV's own
// vocabulary was the one it agreed with on 4,977 of the 5,003 funds a ticker
// alone identified, and every disagreement was a fund the CSV lists off a
// Mexican venue rather than a venue named differently.
const EXCHANGE_NAMES = {
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  SEHK: "HKEX",
};

// Hong Kong is quoted in five digits, so 2800 is asked for as 02800.
const HK_EXCHANGES = new Set(["HKEX", "SEHK"]);

function platformSymbol(ticker, exchange) {
  if (HK_EXCHANGES.has(exchange) && /^[0-9]{1,5}$/.test(ticker)) return ticker.padStart(5, "0");
  return ticker;
}

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

// TradeUP carries a single listing per ticker on each of its markets, so the
// fund trading under the ticker asked for is the one the CSV lists there. Where
// a ticker covers several share classes, the venue TradeUP quotes it on tells
// them apart before the name has to, which matters because Hong Kong comes over
// the feed abbreviated to a dozen-odd characters.
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

  // A lone fund under a ticker TradeUP quotes is that fund, whatever either
  // side calls it — the feed writes 2800 as "TRACKER FUND" where the CSV has
  // "Tracker Fund of Hong Kong".
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

const APP_URL = "https://web.tradeup.com/quote/SPY/chart";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("tradeup.com")) || (await browser.newPage());
if (!page.url().includes("tradeup.com")) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to tradeup-parsed.json.
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

const outputPath = new URL("tradeup-parsed.json", import.meta.url);
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

// TradeUP only trades America and Hong Kong, so only the listings the CSV puts
// on those markets are worth asking about.
const MARKET_EXCHANGES = new Set(["AMEX", "CBOE", "NASDAQ", "NYSE", "BATS", "ARCA", "HKEX"]);

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
console.error(`${queries.length} symbols to ask about`);

// The app signs its calls with a token it renews on its own, so the token and
// the device parameters that go with it are read off its own traffic.
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
  // The device and version parameters ride along on every call the app makes.
  const params = new URLSearchParams(new URL(event.request.url).search);
  for (const key of ["withCnEtf", "withPlate", "market", "limit", "configIndices", "manual"]) {
    params.delete(key);
  }
  query = `?${params.toString()}`;
});

// Nothing is signed until the app has something to ask, so the search box is
// given a symbol to look up.
async function captureSession() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const input = await page
      .waitForSelector('input[placeholder="Symbol" i], input.tt-input, input', { timeout: 20000 })
      .catch(() => null);

    if (input) {
      await input.click({ clickCount: 3 }).catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await input.type("SPY", { delay: 70 }).catch(() => {});
    }

    for (let waited = 0; waited < 20000 && !token; waited += 250) await sleep(250);
    if (token) return true;

    await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(5000);
  }
  return Boolean(token);
}

if (!(await captureSession())) {
  throw new Error("Could not read TradeUP's API token. Is web.tradeup.com signed in?");
}

// The quote endpoint answers five hundred symbols at a time, which covers the
// whole American offer in eleven calls.
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

    // The token turns over on its own; wait for the app to mint a new one
    // before trying the batch again.
    const stale = token;
    for (let waited = 0; waited < 20000 && token === stale; waited += 250) await sleep(250);
    if (token === stale) await captureSession();
  }

  return [];
}

const byTicker = new Map(queries.map((entry) => [entry.symbol, entry.ticker]));
let unknown = 0;
let notFunds = 0;

for (let index = 0; index < queries.length; index += BATCH_SIZE) {
  if (index + BATCH_SIZE < startIndex) continue;

  const batch = queries.slice(index, index + BATCH_SIZE);
  const items = await lookup(batch.map((entry) => entry.symbol));

  for (const item of items) {
    const symbol = String(item?.symbol || "");
    if (!symbol || seen.has(symbol)) continue;

    // A symbol TradeUP does not carry comes back as a shell with no venue on it.
    if (!item.exchange) {
      unknown += 1;
      continue;
    }

    const exchange = String(item.exchange).toUpperCase();
    const asset = {
      ticker: byTicker.get(symbol) || normalizeTicker(symbol),
      name: (item.nameCN || "").replace(/\s+/g, " ").trim(),
      exchange,
    };

    const candidate = resolveIsin(tickerCandidates, asset);
    if (!candidate) continue;

    // TradeUP marks each fund with the multiple of the index it tracks, so a
    // missing mark means it holds the symbol to be a share — its test symbols
    // and ordinary shares carry none. The mark is missing on some genuinely
    // new listings too, so it bars a symbol only when the names disagree as
    // well, which they do for the likes of "AMEX Test Symbol".
    if (!item.etf && candidate.score < MIN_NAME_SCORE) {
      notFunds += 1;
      continue;
    }

    seen.add(symbol);
    results.push({
      query: symbol,
      ticker: asset.ticker,
      // Hong Kong comes over the feed abbreviated past recognition, and now and
      // then as the bare number, so the CSV's wording stands in for it.
      name: asset.name && asset.name !== symbol ? asset.name : candidate.name,
      exchange: EXCHANGE_NAMES[exchange] || exchange,
      // Hong Kong quotes in its own dollar, the rest of the shelf in the US one.
      currency: HK_EXCHANGES.has(exchange) ? "HKD" : "USD",
      type: "ETF",
      raw: [symbol, asset.name, exchange].filter(Boolean).join(" "),
      isin: candidate.isin,
    });
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.error(
  `${results.length} funds matched, ${unknown} symbols not carried, ${notFunds} not funds`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
