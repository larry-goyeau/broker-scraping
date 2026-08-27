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

// Robinhood names a listing after the venue's MIC, so NYSE Arca comes through
// as ARCX and NYSE American as XASE, both of which the CSV files under the
// exchange that owns them. This is the mapping Alpaca's venues agreed with.
const EXCHANGE_NAMES = {
  ARCX: "AMEX",
  XASE: "AMEX",
  BATS: "CBOE",
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  IEXG: "IEX",
  OTCM: "OTC",
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

// A US ticker names one fund, so when Robinhood's venue is also where the CSV
// lists that ticker, the venue alone settles it and the fund's verbose legal
// name need not be matched. Only when no US venue corroborates (a ticker shared
// across borders, e.g. NYSE Zoetis against a Canadian BMO ETF) does the name
// have to agree before an ISIN is trusted.
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

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  // No venue corroboration means the ticker match alone could be a coincidence,
  // so the name must carry it.
  if (sameVenue.length === 0 && bestScore < MIN_NAME_SCORE) return null;

  if (scored.length === 1) return scored[0];

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  // A tie the name cannot break leaves the share classes indistinguishable.
  return winners.length === 1 ? winners[0] : null;
}

// `--refresh` re-walks Robinhood's catalogue instead of reusing the cached
// 24-Hour Market snapshot from a previous run.
const refresh = process.argv.slice(2).includes("--refresh");
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

const outputPath = "parsed_json/robinhood-parsed.json";
// Walking 300+ pages costs a couple of minutes, so the harvested 24-Hour Market
// list is cached and only the (fast) association step reruns unless --refresh.
const cachePath = "parsed_json/.robinhood-24h-cache.json";

async function fetchPage(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (response.ok) return await response.json();
    } catch {
      // Fall through to the pause and try again.
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(`gave up fetching ${url}`);
}

// Robinhood's EU app offers exactly its 24-Hour Market: exchange-traded products
// flagged all_day_tradability. Walking the full ETP catalogue and keeping that
// flag reproduces the EU-tradable universe straight from the source of truth,
// rather than guessing it ticker by ticker from the CSV.
async function loadUniverse() {
  if (!refresh && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      if (Array.isArray(cached) && cached.length > 0) return cached;
    } catch {
      // Ignore a corrupt cache and rebuild it.
    }
  }

  const items = [];
  let url = "https://api.robinhood.com/instruments/?type=etp";
  let pages = 0;
  while (url) {
    const data = await fetchPage(url);
    pages += 1;
    for (const row of data.results || []) {
      if (row.type !== "etp" || row.state !== "active" || row.all_day_tradability !== "tradable") continue;
      const mic = String(row.market || "").split("/").filter(Boolean).pop() || "";
      if (!EXCHANGE_NAMES[mic]) continue;
      items.push({
        ticker: String(row.symbol || "").toUpperCase(),
        name: (row.simple_name || row.name || "").replace(/\s+/g, " ").trim(),
        mic,
      });
    }
    url = data.next;
    if (pages % 25 === 0) console.error(`  ${pages} pages, ${items.length} kept`);
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(items, null, 2));
  return items;
}

const universe = await loadUniverse();
console.error(`${universe.length} instruments in Robinhood's 24-Hour Market (EU-tradable)`);

// Each 24-Hour Market instrument is paired with the closest etfs.csv row on
// ticker, venue and name; when the CSV carries no such ticker there is no honest
// association, so the ISIN is left blank rather than forced onto a stranger.
const results = [];
let matched = 0;
let unmatched = 0;

for (const instrument of universe) {
  if (onlyTickers.size > 0 && !onlyTickers.has(instrument.ticker)) continue;

  const associated = resolveIsin(tickerCandidates, {
    ticker: instrument.ticker,
    name: instrument.name,
    exchange: instrument.mic,
  });

  const entry = {
    ticker: instrument.ticker,
    name: instrument.name,
    exchange: EXCHANGE_NAMES[instrument.mic],
    // The 24-hour market is a US venue list, quoted in dollars.
    currency: "USD",
    type: "ETF",
    raw: [instrument.ticker, instrument.name, instrument.mic].filter(Boolean).join(" "),
    isin: associated ? associated.isin : "",
  };
  if (associated) {
    entry.csvName = associated.name;
    matched += 1;
  } else {
    unmatched += 1;
  }
  results.push(entry);
}

results.sort((left, right) => left.ticker.localeCompare(right.ticker));

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(
  `${results.length} EU-tradable ETPs | ${matched} associated to etfs.csv | ${unmatched} with no CSV match`
);
console.log(JSON.stringify(results, null, 2));

