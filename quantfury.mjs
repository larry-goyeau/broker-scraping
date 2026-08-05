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

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF TRUST" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides the match.
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
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
    } else {
      candidates.push({ isin, names: [name] });
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated companies, so counting them
// would let a same-ticker stock pass for the fund being looked up.
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

  // Dividing by the longer name keeps a terser cross-listing ("SPDR S&P 500
  // ETF") from outscoring the fund actually named ("State Street SPDR S&P 500
  // ETF") just by leaving words out.
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

// A ticker in the CSV can point at several ISINs (the same symbol is reused
// across venues and by unrelated funds), so a listing only earns an ISIN when
// its name genuinely matches.
const MIN_NAME_SCORE = 0.5;

// Quantfury trades US listings of these funds, so an instrument on a US venue
// settles a tie between share classes issued in different countries.
const US_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "CBOE", "IEX"]);

function isinCountryFor(exchange) {
  return US_EXCHANGES.has((exchange || "").toUpperCase()) ? "US" : null;
}

function resolveIsin(tickerCandidates, ticker, scrapedName, exchange) {
  const candidates = tickerCandidates.get(ticker) || [];

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(scrapedName, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  let shortlist = scored.filter((candidate) => candidate.score === bestScore);
  if (shortlist.length === 1) return shortlist[0].isin;

  // The same fund is often listed both as a US ETF and as a UCITS clone whose
  // name only adds words ("... UCITS ETF Accum A USD"), and both score alike.
  // The name carrying no extra words is the closer read of what was scraped.
  const scrapedLength = nameTokens(scrapedName).length;
  const distance = (candidate) => Math.abs(nameTokens(candidate.name).length - scrapedLength);
  const tightest = Math.min(...shortlist.map(distance));
  shortlist = shortlist.filter((candidate) => distance(candidate) === tightest);
  if (shortlist.length === 1) return shortlist[0].isin;

  // What is left are cross-listings sharing one name, told apart by where each
  // share class was issued.
  const country = isinCountryFor(exchange);
  const local = country
    ? shortlist.filter((candidate) => candidate.isin.startsWith(country))
    : [];
  if (local.length === 1) return local[0].isin;

  // Still tied: the name does not tell these funds apart.
  return null;
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

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("quantfury.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/quantfury-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["EWP", "SPY", "GLD"];
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

const outputPath = "parsed_json/quantfury-parsed.json";
const results = [];
const seen = new Set();

// When resuming, load already-saved entries so earlier progress is preserved.
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

if (!page.url().includes("trading.quantfury.com")) {
  await page.goto("https://trading.quantfury.com/", { waitUntil: "domcontentloaded" });
}
await page.waitForSelector("#portfolio_search", { timeout: 60000 });

// The whole search happens in the page: the list filters synchronously while
// handling the input event, so typing the term and reading the suggestions in
// one call can never observe the previous term's results.
function findListings(query) {
  return page.evaluate(async (wanted) => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

    const readSuggestions = () => {
      const buttons = [
        ...document.querySelectorAll('button[data-testid^="instrument_information_"]'),
      ];

      // Quantfury promotes a "popular" list when a term matches nothing, which
      // is how a miss is told apart from a hit.
      let popular = false;
      const rows = [];
      for (const button of buttons) {
        const shortName = button.querySelector("span[data-testid$='_short_name']");
        if ((shortName?.getAttribute("data-testid") || "").startsWith("popular_")) {
          popular = true;
          continue;
        }
        const spans = [...button.querySelectorAll("span")];
        rows.push({
          symbol: button.getAttribute("data-testid").replace("instrument_information_", ""),
          ticker: normalize(shortName?.textContent).toUpperCase(),
          name: normalize(spans[spans.length - 1]?.textContent),
        });
      }

      const scroller = buttons[0]?.closest("div[style*='overflow']");
      return {
        popular,
        rows,
        scroller,
        scrollHeight: scroller?.scrollHeight || 0,
        clientHeight: scroller?.clientHeight || 0,
      };
    };

    const input = document.querySelector("#portfolio_search");
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    setValue.call(input, wanted);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    let state = readSuggestions();
    if (state.popular) return [];

    let matches = state.rows.filter((row) => row.ticker === wanted);
    if (matches.length > 0 || state.scrollHeight <= state.clientHeight) return matches;

    // Long result lists are virtualised, so a match further down the list is
    // not in the DOM until that part of it is scrolled into view. Suggestions
    // are ordered alphabetically, which puts an exact ticker ahead of the
    // longer symbols starting with it, so only the top of a list can hold one.
    const scanLimit = Math.min(state.scrollHeight, state.clientHeight * 40);
    for (let offset = state.clientHeight; offset < scanLimit; offset += state.clientHeight) {
      state.scroller.scrollTop = offset;
      await new Promise((resolve) => setTimeout(resolve, 50));

      state = readSuggestions();
      matches = state.rows.filter((row) => row.ticker === wanted);
      if (matches.length > 0) return matches;
    }

    return [];
  }, query);
}

// The suggestion row names the instrument but not where it trades; that only
// shows up in the trading panel, so the row has to be opened. Worth the click
// because it happens on matches only, not on the many tickers Quantfury lacks.
async function readExchange(symbol) {
  const opened = await page.evaluate((wanted) => {
    const row = document.querySelector(`[data-testid="instrument_information_${wanted}"]`);
    if (!row) return false;
    row.click();
    return true;
  }, symbol);

  if (!opened) return "";

  const maxWaitMs = 5000;
  const pollMs = 80;
  for (let waited = 0; waited < maxWaitMs; waited += pollMs) {
    const exchange = await page.evaluate((wanted) => {
      // The panel keeps showing the previous instrument until this marker
      // names the one just opened, which is what makes the read reliable.
      // It carries the full symbol, venue suffix included ("TLT.OQ").
      if (!document.querySelector(`[data-testid="available_to_trade_${wanted}"]`)) return null;

      const label = [...document.querySelectorAll("[data-testid$='_title']")]
        .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
        .find((text) => /^[A-Z][A-Z0-9.&-]+\s/.test(text));
      if (!label) return null;

      // Reads "NYSE Ferme dans" / "NASDAQ Closes in": the venue leads, then
      // localised wording, so keep the leading all-caps words.
      const venue = [];
      for (const word of label.split(" ")) {
        if (word !== word.toUpperCase() || !/[A-Z]/.test(word)) break;
        venue.push(word);
      }
      return venue.join(" ");
    }, symbol);

    if (exchange) return exchange;
    await sleep(pollMs);
  }

  return "";
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const listings = await findListings(query);
  for (const listing of listings) {
    const exchange = await readExchange(listing.symbol);
    const isin = resolveIsin(tickerCandidates, query, listing.name, exchange);
    // Same ticker, different instrument: not the fund we asked about.
    if (!isin) continue;

    const key = `${query}:${listing.ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ticker: listing.ticker,
      name: listing.name,
      exchange,
      type: "ETF",
      raw: `${listing.symbol} ${listing.name}${exchange ? ` ${exchange}` : ""}`,
      isin,
    });
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
