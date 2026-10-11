import puppeteer from "puppeteer-core";
import { COUNTRY_NAMES, stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
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
  // The ticket accepts the class share with a dot (BRK.B). A slash is the
  // same spelling and is folded onto it.
  return (afterExchange || "").replace(/\//g, ".").trim();
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

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// TradeZero names venues after the feed each one reports on: PACF is NYSE Arca,
// NQNM and NQSC the two tiers of Nasdaq, NQPK and PINK the over-the-counter
// sheets.
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

const MARKET_EXCHANGES = new Set(["AMEX", "CBOE", "NASDAQ", "NYSE", "BATS", "ARCA", "OTC", "IEX"]);

// TradeZero Canada's guide refuses a security listed in Canada, a security
// listed in both Canada and the United States, and any security below $0.05.
// https://portal.tradezero.com/manuals/tzc/Quick_Guide_TradeZero_CA.pdf
// America and International still sell those lines, so the row stays. A
// Canadian visitor is the only one `supportedCountries` leaves out. A
// Canadian tape is TSX, TSXV, CSE or NEO in the share and ETF lists. An
// interlisted line is the US ticker whose ISIN in those lists also sits on
// one of those tapes. The stored ISIN is not the test: a ticker collision
// can stamp Evotec with Evovest's ISIN. The dollar floor is the stored USD
// close; a line with no close stays open to a Canadian visitor.
const CANADA_VENUES = new Set(["TSX", "TSXV", "CSE", "NEO"]);
const DOLLAR_FLOOR = 0.05;
const OPEN_BESIDES_CANADA = Object.keys(COUNTRY_NAMES)
  .filter((code) => code !== "CA")
  .sort();

function csvFields(line) {
  const fields = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

function loadCanadaBook(lists, pricesPath) {
  const canadianIsins = new Set();
  const canadianSymbols = new Map();
  const usIsins = new Map();
  const usListings = new Map();
  for (const { path: csvPath, type } of lists) {
    if (!csvPath || !fs.existsSync(csvPath)) continue;
    for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
      if (!line || /^ticker\s*,/i.test(line)) continue;
      const [ticker, exchange, isin, name] = csvFields(line);
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin || "")) continue;
      const symbol = (ticker.includes(":") ? ticker.split(":").pop() : ticker).toUpperCase();
      if (!symbol) continue;
      if (CANADA_VENUES.has(exchange)) {
        canadianIsins.add(isin);
        const symbols = canadianSymbols.get(isin) || new Set();
        symbols.add(symbol);
        canadianSymbols.set(isin, symbols);
      }
      const key = `${symbol}|${exchange}`;
      const set = usIsins.get(key) || new Set();
      set.add(isin);
      usIsins.set(key, set);
      const listings = usListings.get(key) || [];
      listings.push({ isin, name: name || symbol, type });
      usListings.set(key, listings);
    }
  }

  let prices = {};
  if (pricesPath && fs.existsSync(pricesPath)) {
    prices = JSON.parse(fs.readFileSync(pricesPath, "utf8")).prices || {};
  }
  return { canadianIsins, canadianSymbols, usIsins, usListings, prices };
}

function trustedIsin(row, book) {
  const key = `${String(row.ticker || "").toUpperCase()}|${row.exchange || ""}`;
  const set = book.usIsins.get(key);
  if (!set || set.size === 0) return "";
  if (set.size === 1) return [...set][0];
  return set.has(row.isin) ? row.isin : "";
}

function canadaRefusal(row, book) {
  if (CANADA_VENUES.has(row.exchange)) return "Canadian listing";
  const isin = trustedIsin(row, book);
  if (isin && book.canadianIsins.has(isin)) return "interlisted";
  const price = isin ? book.prices[isin]?.USD?.price : null;
  if (typeof price === "number" && price > 0 && price < DOLLAR_FLOOR) return "under $0.05";
  return "";
}

function markCanada(row, book) {
  if (canadaRefusal(row, book)) row.supportedCountries = OPEN_BESIDES_CANADA;
  else delete row.supportedCountries;
  return row;
}

function pickCanadaListing(candidates, symbol, book) {
  const onTheTape = candidates.filter((candidate) => book.canadianSymbols.get(candidate.isin)?.has(symbol));
  const pool = onTheTape.length > 0 ? onTheTape : candidates;
  return pool.length === 1 ? pool[0] : null;
}

const TRADED_PLACES = new Set(["AMEX", "NASDAQ", "NYSE", "OTC", "CBOE", "IEX"]);

function restoreCanadaRows(results, seen, book) {
  let added = 0;
  let ambiguous = 0;
  for (const [key, listings] of book.usListings) {
    const [symbol, exchange] = key.split("|");
    if (!TRADED_PLACES.has(exchange)) continue;
    const candidates = [];
    const seenIsin = new Set();
    for (const listing of listings) {
      if (!book.canadianIsins.has(listing.isin) || seenIsin.has(listing.isin)) continue;
      seenIsin.add(listing.isin);
      candidates.push(listing);
    }
    if (candidates.length === 0) continue;
    if (results.some((row) => row.ticker === symbol && row.exchange === exchange)) continue;
    const pick = pickCanadaListing(candidates, symbol, book);
    if (!pick) {
      ambiguous += 1;
      continue;
    }
    const row = markCanada(
      {
        query: symbol,
        ticker: symbol,
        name: pick.name,
        exchange,
        currency: "USD",
        type: pick.type,
        raw: [symbol, pick.name, exchange].filter(Boolean).join(" "),
        isin: pick.isin,
      },
      book
    );
    results.push(row);
    seen.add(`${row.ticker}:${row.type || ""}:${row.exchange || ""}`.toUpperCase());
    added += 1;
  }
  return { added, ambiguous };
}

function loadTickerCandidatesFromCsv(csvPath, kind, map = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = normalize(isinIndex >= 1 ? columns[isinIndex - 1] : columns[1]).toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
      if (!existing.kind) existing.kind = kind;
    } else {
      candidates.push({
        isin,
        kind,
        names: [name],
        exchanges: new Set(exchange ? [exchange] : []),
      });
    }
  }

  return map;
}

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE",
  "CO", "TRUST", "CLASS", "ETF", "ETC", "ETN", "ETP", "UCITS", "FUND", "SHARES",
  "ISHARES",
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

// American tickers belong to one instrument apiece. Where a ticker covers
// several share classes, the venue TradeZero quotes it on tells them apart
// before the name has to, which matters because the OTC sheets often arrive
// with the name left blank.
function resolveListing(tickerCandidates, asset, type) {
  const kind = type === "STOCK" ? "STOCK" : "ETF";
  let candidates = (tickerCandidates.get(asset.ticker) || []).filter(
    (candidate) => !candidate.kind || candidate.kind === kind
  );
  if (candidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[asset.exchange] || asset.exchange;
  const sameVenue = venue
    ? candidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    ...candidate,
    ...scoreCandidate(asset.name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  return winners.length === 1 ? winners[0] : null;
}

// Symbology files shares and funds as securityType Stock. Searching BTC opens
// the Grayscale mini-trust, not a coin. A ticker that only the share list
// carries stays a share (BCH is Banco de Chile).
function listingType(row, ticker) {
  if (String(row.securityType || "") !== "Stock") return "";

  const name = normalize(row.name);
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) return "ETC";
  if (/\bETFs?\b|\bETPs?\b|\bUCITS\b/i.test(name)) return "ETF";
  if (
    /\bTRUST\b/i.test(name) &&
    !/\b(REIT|REALTY|INVESTMENT TRUST)\b/i.test(name) &&
    !/\b(INC|CORP|CORPORATION|LTD|LIMITED|LLC|ADS)\.?\b/i.test(name)
  ) {
    return "ETF";
  }

  const candidates = tickerCandidates.get(ticker) || [];
  const hasStock = candidates.some((candidate) => candidate.kind === "STOCK");
  const hasFund = candidates.some((candidate) => candidate.kind === "ETF");
  if (hasStock && !hasFund) return "STOCK";
  if (hasFund && !hasStock) return "ETF";
  if (/\b(INC|CORP|CORPORATION|LTD|LIMITED|LLC|ADS)\.?\b/i.test(name)) return "STOCK";
  return "ETF";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../../assets/etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../../assets/stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;

const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const queries = [];
const queried = new Set();
for (const [ticker, candidates] of tickerCandidates) {
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;
  const exchanges = new Set(candidates.flatMap((candidate) => [...candidate.exchanges]));
  if (![...exchanges].some((exchange) => MARKET_EXCHANGES.has(exchange))) continue;
  if (queried.has(ticker)) continue;
  queried.add(ticker);
  queries.push(ticker);
}

const outputPath = new URL("tradezero-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) {
          seen.add(`${entry.ticker}:${entry.type || ""}:${entry.exchange || ""}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const canada = loadCanadaBook(
  [
    { path: stocksCsvPath, type: "STOCK" },
    { path: etfsCsvPath, type: "ETF" },
  ],
  new URL("../../assets/prices.json", import.meta.url)
);
let canadaLimited = 0;
for (const row of results) {
  const why = canadaRefusal(row, canada);
  markCanada(row, canada);
  if (why) canadaLimited += 1;
}
const restored = restoreCanadaRows(results, seen, canada);

if (hasFlag("rewrite")) {
  results.sort((left, right) => {
    const byType = String(left.type).localeCompare(right.type);
    if (byType !== 0) return byType;
    const byExchange = String(left.exchange).localeCompare(String(right.exchange));
    if (byExchange !== 0) return byExchange;
    return String(left.ticker).localeCompare(String(right.ticker));
  });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(stampRows(withoutObligations(results), import.meta.url), null, 2)
  );
  console.error(
    `${results.length} listings, ${canadaLimited + restored.added} closed to a Canadian visitor` +
      ` (${restored.added} put back` +
      (restored.ambiguous ? `, ${restored.ambiguous} ambiguous` : "") +
      ")"
  );
  process.exit(0);
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://tz1.tradezero.com/";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("tradezero.com")) ||
  (await browser.newPage());
if (!page.url().includes("tradezero.com")) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}

let token = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("tradezero.com")) return;
  const sent = event.request.headers || {};
  token = sent.Authorization || sent.authorization || token;
});

async function captureToken() {
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    for (let waited = 0; waited < 15000 && !token; waited += 250) await sleep(250);
    if (token) return true;

    const input = await page.$("input.symbol-lookup-input, input[placeholder='Search' i], input");
    if (input) {
      await input.click({ clickCount: 3 }).catch(() => {});
      await input.type("SPY", { delay: 40 }).catch(() => {});
    }
    for (let waited = 0; waited < 10000 && !token; waited += 250) await sleep(250);
    if (token) return true;
  }
  return Boolean(token);
}

if (!(await captureToken())) {
  throw new Error("Could not read TradeZero's API token. Is tz1.tradezero.com signed in?");
}

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
            } catch {
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

    const stale = token;
    for (let waited = 0; waited < 30000 && token === stale; waited += 250) await sleep(250);
    if (token === stale) await captureToken();
  }

  return {};
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(stampRows(withoutObligations(results), import.meta.url), null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

console.error(`${queries.length} tickers to look up`);

let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (let offset = 0; offset < queries.length; offset += BATCH_SIZE) {
  if (offset + BATCH_SIZE < startIndex) continue;

  const batch = queries.slice(offset, offset + BATCH_SIZE);
  const answers = await lookup(batch);

  for (const ticker of batch) {
    const row = (answers[ticker]?.rows || []).find(
      (candidate) => normalizeTicker(candidate.ticker) === ticker
    );
    if (!row) {
      skip("not carried");
      continue;
    }

    const type = listingType(row, ticker);
    if (!type) {
      skip(String(row.securityType || "unknown").toLowerCase() || "unknown");
      continue;
    }
    if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
    if (type === "STOCK" && !wantStocks) continue;

    const exchange = EXCHANGE_NAMES[normalize(row.exchange).toUpperCase()];
    if (!exchange) {
      skip("foreign tape");
      continue;
    }

    const name = normalize(row.name);
    const match = resolveListing(tickerCandidates, { ticker, name, exchange: row.exchange }, type);
    if (!match && !keepUnlisted) {
      unlisted += 1;
      continue;
    }

    const key = `${ticker}:${type}:${exchange}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push(
      markCanada(
        {
          query: ticker,
          ticker,
          name: name || match?.name || ticker,
          exchange,
          currency: "USD",
          type,
          raw: [ticker, name, exchange].filter(Boolean).join(" "),
          isin: match?.isin || "",
        },
        canada
      )
    );
  }

  if (offset === 0 || (offset + BATCH_SIZE) % 800 === 0 || offset + BATCH_SIZE >= queries.length) {
    console.error(`[${Math.min(offset + BATCH_SIZE, queries.length)}/${queries.length}] ${results.length} matched`);
  }
  if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

save();

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await client.detach();
await browser.disconnect();
