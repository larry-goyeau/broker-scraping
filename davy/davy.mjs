import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function normalize(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

// The kind travels with the ISIN because myDavy files a fair few UCITS ETFs
// under its shares tab, so its own label cannot be asked what a product is.
function loadIsinsFromCsv(csvPath, kind, queries = new Map()) {
  if (!fs.existsSync(csvPath)) return queries;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    // Supports both: ticker,isin,name and ticker,exchange,isin,name.
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin || queries.has(isin)) continue;

    queries.set(isin, kind);
  }
  return queries;
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return new URL(fallback, import.meta.url);
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// `--csv=PATH` overrides the fund list (defaults to etfs.csv) and
// `--stocks-csv=PATH` the share list (defaults to stocks.csv). `--etfs-only`
// and `--stocks-only` walk one catalogue alone.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");

// `--start=N` (1-indexed) resumes a run part-way through the walk, `--limit=N`
// stops it early, and `--fresh` is the only way to throw away what
// davy-parsed.json already holds.
const startIndex = numberArg("start", 1);
const limit = numberArg("limit", 0);
const fresh = hasFlag("fresh");

// Several lookups can be in flight at once without the portal complaining;
// the walk is long enough that this is the difference between hours and minutes.
const concurrency = numberArg("concurrency", 4);
const batchSize = concurrency * 10;

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliQueries = positionalArgs.map(toIsin).filter(Boolean);

// The funds are read first so that an ISIN both catalogues happen to carry is
// remembered as the fund it is.
const catalogue = new Map();
if (!stocksOnly) loadIsinsFromCsv(csvPath, "ETF", catalogue);
if (!etfsOnly) loadIsinsFromCsv(stocksCsvPath, "STOCK", catalogue);

const queries = cliQueries.length > 0 ? cliQueries : [...catalogue.keys()];
if (queries.length === 0) throw new Error("No ISINs to check. Is etfs.csv/stocks.csv in place?");

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session to the calls below.
async function davyPage() {
  const pages = await browser.pages();
  const found =
    pages.find((candidate) => candidate.url().includes("mydavy.ie")) || (await browser.newPage());

  if (!found.url().includes("mydavy.ie")) {
    await found.goto("https://www.mydavy.ie/trading.htm", { waitUntil: "domcontentloaded" });
    await sleep(3000);
  }
  return found;
}
let page = await davyPage();

// The portal reloads itself now and then, which tears down whatever call was in
// flight along with the context it was made from. Reconnecting and asking again
// is enough to carry on.
async function inPage(fn, ...args) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (error) {
      if (attempt >= 3) throw error;
      console.error(`  retrying: ${normalize(String(error?.message)).slice(0, 90)}`);
      await sleep(2000 * attempt);
      page = await davyPage();
    }
  }
}

// The price search the watchlist and the ticket share. Unlike the ticket's own
// tradeProductSearch, which answers for one tab at a time (`etfs`, `funds` or
// `shares`), this one answers for all three at once and says which shelf a
// listing came from, so a single call per ISIN covers the whole tradeable book.
const SEARCH_ALL = "https://www.mydavy.ie/api/search/allEquities";
const SEARCH_TAB = "https://www.mydavy.ie/api/search/tradeProductSearch";

// Answers are trimmed to ten rows and there is no way to ask for the next page.
const TRIM = 10;

async function fetchListings(isins) {
  return inPage(
    async (allUrl, tabUrl, trim, list, lanes) => {
      const get = async (url) => {
        const response = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json, text/plain, */*" },
        });
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      };

      const listingKey = (row) => `${row?.code}:${row?.exchange}:${row?.currency}`;
      const answers = {};
      const queue = [...list];

      const lane = async () => {
        while (queue.length > 0) {
          const isin = queue.shift();
          let rows = await get(`${allUrl}?searchText=${encodeURIComponent(isin)}`);

          // A full ten rows means the answer was trimmed. The trim is applied
          // per shelf, so asking each tab in turn recovers what was cut.
          if (Array.isArray(rows) && rows.length >= trim) {
            const merged = new Map(rows.map((row) => [listingKey(row), row]));
            for (const tradeType of ["etfs", "funds", "shares"]) {
              const tabRows = await get(
                `${tabUrl}?search=${encodeURIComponent(isin)}&selling=false&tradeType=${tradeType}`
              );
              for (const row of Array.isArray(tabRows) ? tabRows : []) {
                merged.set(listingKey(row), row);
              }
            }
            rows = [...merged.values()];
          }

          // Null stands for "no answer at all", which a signed-out session
          // gives by handing back the login page instead of an error.
          answers[isin] = Array.isArray(rows) ? rows : null;
        }
      };

      await Promise.all(Array.from({ length: lanes }, lane));
      return answers;
    },
    SEARCH_ALL,
    SEARCH_TAB,
    TRIM,
    isins,
    concurrency
  );
}

// What myDavy calls a shelf, said in the terms the other brokers are kept in.
// Only an ISIN passed on the command line reaches this, since anything from a
// catalogue is already known to be a fund or a share.
const SHELF_TYPES = { ETF: "ETF", SHARE: "STOCK", FUND: "FUND" };

function parseListing(entry, query, kind) {
  const isin = toIsin(entry?.isin);
  // The search reads names as well as ISINs, so unrelated rows come back too.
  if (isin !== query) return null;

  const name = normalize(entry?.name);
  if (!name) return null;

  // Sell-only lines are no answer to what a broker can be bought through.
  if (entry?.canBuy === false) return null;

  const code = normalize(entry?.code).toUpperCase();
  const shelf = normalize(entry?.assetType).toUpperCase();
  const exchange = normalize(entry?.exchange);
  const currency = normalize(entry?.currency).toUpperCase() || null;

  return {
    // Codes carry a venue suffix ("IWDA.L"), which the exchange already states.
    // Fund share classes have nothing in front of it and answer to their ISIN.
    ticker: code.split(".")[0] || isin,
    name,
    exchange,
    currency,
    type: kind || SHELF_TYPES[shelf] || "STOCK",
    raw: [name, code, isin, exchange, currency, shelf].filter(Boolean).join(" "),
  };
}

const outputPath = new URL("davy-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

function entryKey(row) {
  return `${row.isin}:${row.ticker}:${row.exchange}:${row.currency || ""}`.toUpperCase();
}

// A walk this long is expected to be picked up again, so what is already saved
// is kept unless the run explicitly asks for a clean sheet.
if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    for (const entry of Array.isArray(existing) ? existing : []) {
      if (!entry?.isin || !entry?.ticker) continue;
      if (seen.has(entryKey(entry))) continue;
      seen.add(entryKey(entry));
      results.push(entry);
    }
    console.error(`${results.length} listings already saved`);
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

const pending = queries.slice(startIndex - 1, limit ? startIndex - 1 + limit : undefined);
console.error(
  `${pending.length} ISINs to check (${queries.length} in the catalogues), ${concurrency} at a time`
);

let checked = 0;
let answered = 0;
let silences = 0;
let batches = 0;

for (let offset = 0; offset < pending.length; offset += batchSize) {
  const batch = pending.slice(offset, offset + batchSize);
  const answers = await fetchListings(batch);

  let silent = 0;
  for (const isin of batch) {
    const listings = answers[isin];
    checked += 1;
    if (listings === null || listings === undefined) {
      silent += 1;
      continue;
    }

    let added = 0;
    for (const entry of listings) {
      const row = parseListing(entry, isin, catalogue.get(isin));
      if (!row) continue;

      const listing = { query: isin, ...row, isin };
      if (seen.has(entryKey(listing))) continue;
      seen.add(entryKey(listing));
      results.push(listing);
      added += 1;
    }

    if (listings.length > 0) {
      answered += 1;
      console.error(`  ${isin} ${listings.length} listings${added ? "" : " (already known)"}`);
    }
  }

  // Only a session that has fallen over goes quiet for a whole batch.
  silences = silent === batch.length ? silences + 1 : 0;
  if (silences >= 3) {
    save();
    throw new Error("myDavy stopped answering. Is the session still signed in?");
  }

  batches += 1;
  if (batches % 10 === 0) save();

  const position = startIndex + checked - 1;
  console.error(
    `[${position}/${queries.length}] ${answered} ISINs listed, ${results.length} listings`
  );
}

save();

const byType = {};
for (const row of results) byType[row.type] = (byType[row.type] || 0) + 1;
console.error(
  `${results.length} listings for ${answered} of ${checked} ISINs (${Object.entries(byType)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ")})`
);

await browser.disconnect();
