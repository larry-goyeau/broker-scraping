import puppeteer from "puppeteer-core";
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

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

const EXCHANGES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  OTC: "OTC",
};

const US_VENUES = new Set(["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"]);

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

// Vested only carries US listings, so the US share class trading under the
// ticker is the instrument on offer. Names are left to separate several US
// share classes; the list abbreviates them past recognition.
function resolveListing(tickerCandidates, ticker, scrapedName, type) {
  const kind = type === "STOCK" ? "STOCK" : "ETF";
  let candidates = (tickerCandidates.get(ticker) || []).filter(
    (candidate) => (!candidate.kind || candidate.kind === kind) && candidate.isin.startsWith("US")
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { ...candidates[0], name: candidates[0].names[0], score: 1 };

  const scored = candidates.map((candidate) => ({
    ...candidate,
    ...scoreCandidate(scrapedName, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  return winners.length === 1 ? winners[0] : null;
}

// The download already files funds as type etf and shares as stock. Searching
// BTC opens the Grayscale mini-trust (commissionGroup CRYPTO_ETF), not a coin.
function listingType(instrument) {
  const kind = String(instrument.type || "").toLowerCase();
  const name = normalize(instrument.name);
  if (kind !== "etf" && kind !== "stock") return "";

  if (/\bETNs?\b/i.test(name)) return "ETN";
  const withoutParens = name.replace(/\([^)]*\)/g, " ");
  if (/\bETCs?\b/i.test(withoutParens) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) {
    return "ETC";
  }
  if (kind === "etf") return "ETF";
  return "STOCK";
}

function venueOf(instrument, match) {
  if (instrument.isOtc || instrument.commissionGroup === "OTC_SECURITIES") return "OTC";
  const fromCatalogue = [...(match?.exchanges || [])].find((exchange) =>
    US_VENUES.has(EXCHANGES[exchange] || exchange)
  );
  if (fromCatalogue) return EXCHANGES[fromCatalogue] || fromCatalogue;
  return "";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");

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

const outputPath = new URL("vested-parsed.json", import.meta.url);
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

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("vestedfinance.com")) ||
  (await browser.newPage());

const APP_URL = "https://app.vestedfinance.com/en/global";
const INSTRUMENTS_URL = "https://vested-api-prod-ga.vestedfinance.com/instruments";

// The search box filters in the browser rather than asking a server, which it
// can do because the app downloads every instrument it offers as it starts.
async function captureInstruments() {
  const client = await page.createCDPSession();
  await client.send("Network.enable");

  let body = null;
  const watched = new Set();

  client.on("Network.requestWillBeSent", (event) => {
    if (event.request.url.split("?")[0] === INSTRUMENTS_URL) watched.add(event.requestId);
  });

  client.on("Network.loadingFinished", async (event) => {
    if (!watched.has(event.requestId) || body) return;
    const fetched = await client
      .send("Network.getResponseBody", { requestId: event.requestId })
      .catch(() => null);
    if (fetched?.body) body = fetched.body;
  });

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  for (let waited = 0; waited < 90000 && !body; waited += 250) await sleep(250);
  await client.detach().catch(() => {});

  if (!body) {
    throw new Error("Could not read the instrument list. Is app.vestedfinance.com signed in?");
  }

  const instruments = JSON.parse(body);
  return Array.isArray(instruments) ? instruments : [];
}

const instruments = await captureInstruments();
console.error(`${instruments.length} instruments in Vested's offering`);

let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const instrument of instruments) {
  const ticker = normalizeTicker(instrument.symbol);
  const type = listingType(instrument);
  if (!ticker || !type) {
    skip(String(instrument.type || "unknown").toLowerCase() || "unknown");
    continue;
  }
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;

  const name = normalize(instrument.name);
  const match = resolveListing(tickerCandidates, ticker, name, type);
  if (!match && !keepUnlisted) {
    unlisted += 1;
    continue;
  }

  const exchange = venueOf(instrument, match);
  if (!US_VENUES.has(exchange)) {
    skip("no venue");
    continue;
  }

  const key = `${ticker}:${type}:${exchange}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name: name || match?.name || ticker,
    exchange,
    // Neither the instrument list nor the overview page sends a currency.
    // Vested gives Indian investors US listings, quoted in dollars.
    currency: "USD",
    type,
    raw: [ticker, name, exchange, "USD"].filter(Boolean).join(" "),
    isin: match?.isin || "",
  });
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await browser.disconnect();
