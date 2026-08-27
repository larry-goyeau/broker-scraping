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

// TradeZero names venues after the feed each one reports on: PACF is NYSE Arca,
// NQNM and NQSC the two tiers of Nasdaq, NQPK and PINK the over-the-counter
// sheets. The mapping onto the CSV's own vocabulary was the one it agreed with
// on every one of the 399 funds a ticker alone identified in a first sweep.
const EXCHANGE_NAMES = {
  AMEX: "AMEX",
  PACF: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  NQNM: "NASDAQ",
  NQSC: "NASDAQ",
  NYSE: "NYSE",
  IEX: "IEX",
  NQPK: "OTC",
  PINK: "OTC",
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

// American tickers belong to one instrument apiece, so the fund trading under
// the ticker asked for is the one the CSV lists there. Where a ticker covers
// several share classes, the venue TradeZero quotes it on tells them apart
// before the name has to, which matters because the over-the-counter sheets
// come through with the name left blank.
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

const APP_URL = "https://tz1.tradezero.com/";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("tradezero.com")) || (await browser.newPage());
if (!page.url().includes("tradezero.com")) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to parsed_json/tradezero-parsed.json.
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

const outputPath = new URL("../parsed_json/tradezero-parsed.json", import.meta.url);
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

// TradeZero trades America, the over-the-counter sheets included, so only the
// listings the CSV puts there are worth asking about.
const MARKET_EXCHANGES = new Set(["AMEX", "CBOE", "NASDAQ", "NYSE", "BATS", "ARCA", "OTC"]);

const queries = [];
for (const [ticker, candidates] of tickerCandidates) {
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;
  const exchanges = new Set(candidates.flatMap((candidate) => [...candidate.exchanges]));
  if (![...exchanges].some((exchange) => MARKET_EXCHANGES.has(exchange))) continue;
  queries.push(ticker);
}
console.error(`${queries.length} tickers to look up`);

// The app signs its calls with a token it renews on its own, so it is read off
// the app's own traffic rather than minted here.
let token = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("tradezero.com")) return;
  const sent = event.request.headers || {};
  token = sent.Authorization || sent.authorization || token;
});

// The app polls its own feeds every few seconds, so a token turns up on its own
// once the platform is open; nudging the symbol box hurries it along.
async function captureToken() {
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    const input = await page.$("input.symbol-lookup-input, input[placeholder='Search' i], input");
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

if (!(await captureToken())) {
  throw new Error("Could not read TradeZero's API token. Is tz1.tradezero.com signed in?");
}

// The symbology search takes one ticker at a time but tolerates twenty at once,
// which brings the American offer down to a couple of minutes.
const CONCURRENCY = 20;
const BATCH_SIZE = 400;

async function lookup(tickers) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answers = await page.evaluate(
      async (list, authorization, concurrency) => {
        const found = {};
        let cursor = 0;
        async function worker() {
          while (cursor < list.length) {
            const ticker = list[cursor++];
            const url = `https://api.tradezero.com/v1/symbology/api/search?Query=${encodeURIComponent(
              ticker
            )}&Page=1&NumOfResults=25&LuceneQuery=false`;
            try {
              const response = await fetch(url, { headers: { Authorization: authorization } });
              if (!response.ok) {
                found[ticker] = { status: response.status };
                continue;
              }
              found[ticker] = { status: 200, rows: await response.json() };
            } catch (error) {
              found[ticker] = { status: 0 };
            }
          }
        }
        await Promise.all(Array.from({ length: concurrency }, worker));
        return found;
      },
      tickers,
      token,
      CONCURRENCY
    );

    const refused = Object.values(answers).filter((answer) => answer.status === 401).length;
    if (refused === 0) return answers;

    // The token turns over on its own; wait for the app to mint a new one
    // before asking again.
    const stale = token;
    for (let waited = 0; waited < 30000 && token === stale; waited += 250) await sleep(250);
    if (token === stale) await captureToken();
  }

  return {};
}

let notCarried = 0;
let elsewhere = 0;

for (let index = 0; index < queries.length; index += BATCH_SIZE) {
  if (index + BATCH_SIZE < startIndex) continue;

  const batch = queries.slice(index, index + BATCH_SIZE);
  const answers = await lookup(batch);

  for (const ticker of batch) {
    if (seen.has(ticker)) continue;

    // The search ranks an exact ticker first but answers on names too, so the
    // row that carries the ticker asked for is the only one that counts.
    const row = (answers[ticker]?.rows || []).find(
      (candidate) => String(candidate.ticker || "").toUpperCase() === ticker
    );
    if (!row) {
      notCarried += 1;
      continue;
    }

    // Options and futures ride the same symbology; only cash listings are funds.
    const exchange = String(row.exchange || "").trim().toUpperCase();
    if (row.securityType !== "Stock" || !EXCHANGE_NAMES[exchange]) {
      elsewhere += 1;
      continue;
    }

    const asset = {
      ticker,
      name: (row.name || "").replace(/\s+/g, " ").trim(),
      exchange,
    };

    const candidate = resolveIsin(tickerCandidates, asset);
    if (!candidate) continue;

    seen.add(ticker);
    results.push({
      query: ticker,
      ticker,
      // The over-the-counter sheets carry no name at all, so the CSV's wording
      // stands in for those.
      name: asset.name || candidate.name,
      exchange: EXCHANGE_NAMES[exchange],
      // The universe is restricted to US exchanges and the OTC sheets, so
      // every line quotes in dollars.
      currency: "USD",
      type: "ETF",
      raw: [ticker, asset.name, exchange].filter(Boolean).join(" "),
      isin: candidate.isin,
    });
  }

  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.error(`  ${Math.min(index + BATCH_SIZE, queries.length)}/${queries.length} looked up, ${results.length} matched`);
}

console.error(
  `${results.length} funds matched, ${notCarried} tickers not carried, ${elsewhere} not cash listings`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
