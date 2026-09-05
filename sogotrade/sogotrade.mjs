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

function loadCryptoTickers(csvPath) {
  const tickers = new Set();
  if (!csvPath || !fs.existsSync(csvPath)) return tickers;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const ticker = normalizeTicker(line.split(",")[0]);
    if (ticker) tickers.add(ticker);
  }
  return tickers;
}

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE",
  "CO", "TRUST", "CLASS", "ETF", "ETC", "ETN", "ETP", "UCITS", "FUND", "SHARES",
  "ISHARES",
]);

function nameTokens(value) {
  return new Set(
    normalize(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token))
  );
}

function resolveListing(tickerCandidates, ticker, scrapedName, type) {
  const kind = type === "STOCK" ? "STOCK" : "ETF";
  let candidates = (tickerCandidates.get(ticker) || []).filter(
    (candidate) => !candidate.kind || candidate.kind === kind
  );
  const us = candidates.filter((candidate) => candidate.isin.startsWith("US"));
  if (us.length > 0) candidates = us;
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const scrapedTokens = nameTokens(scrapedName);
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = Math.max(
      0,
      ...candidate.names.map((name) => [...scrapedTokens].filter((token) => nameTokens(name).has(token)).length)
    );
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore > 0 ? best : null;
}

function looksLikeFund(name) {
  return /\bET[FNC]s?\b|\bUCITS\b/i.test(name);
}

// Funds come back with no sector (or the placeholder NC / Other). An operating
// company fills a real sector in, which is what stops AMZN the share being
// bound to an Amazon tracker in the fund list. Class shares such as BRK.B
// land on Other with no ETF in the name, so those stay stocks.
function listingType(data) {
  const name = data.Name || "";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";

  const sector = normalize(data.Sector);
  const isCompany =
    Boolean(sector) && sector !== "NC" && (sector !== "Other" || !looksLikeFund(name));
  if (isCompany) return "STOCK";
  return "ETF";
}

const EXCHANGES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  "NYSE ARCA": "AMEX",
  ARCA: "AMEX",
  "NYSE MKT": "AMEX",
  AMEX: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  OTC: "OTC",
  OTCQX: "OTC",
  OTCQB: "OTC",
  OTCCE: "OTC",
  OTCMKTS: "OTC",
  "OTC MKTS": "OTC",
  PINK: "OTC",
  PINX: "OTC",
};

const US_VENUES = new Set(["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"]);

function venueOf(raw, match) {
  const code = normalize(raw).toUpperCase();
  if (EXCHANGES[code]) return EXCHANGES[code];
  if (/^OTC/.test(code) || /PINK|PINX/.test(code)) return "OTC";
  const fromCatalogue = [...(match?.exchanges || [])].find((exchange) =>
    US_VENUES.has(EXCHANGES[exchange] || exchange)
  );
  if (fromCatalogue) return EXCHANGES[fromCatalogue] || fromCatalogue;
  // BRK.B comes back as exchange "B" — the class suffix, not the tape.
  if (code.length <= 1) return "NYSE";
  return "";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const catalogueQueries = [...tickerCandidates.entries()]
  .filter(([, candidates]) => candidates.some((candidate) => candidate.isin.startsWith("US")))
  .map(([ticker]) => ticker);

const queries = uniqueQueries(
  onlyTickers.size > 0
    ? [...onlyTickers]
    : [...catalogueQueries, ...cryptoTickers]
);

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const outputPath = new URL("sogotrade-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
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

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("trading.sogotrade.com")) ||
  (await browser.newPage());

if (!page.url().includes("trading.sogotrade.com")) {
  await page.goto("https://trading.sogotrade.com/", { waitUntil: "domcontentloaded" });
  await sleep(3000);
}

// The trading page raises alerts of its own, and an open dialog would freeze
// every call made through it.
page.on("dialog", async (dialog) => {
  await dialog.dismiss();
});

const BATCH_SIZE = 500;

async function fetchFundamentals(symbols) {
  const answer = await page.evaluate(async (batch) => {
    try {
      const response = await fetch(
        "/Sogo.Shared.Services.dll/Snapshot.asmx/RequestSnapshot",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            items: batch.map((symbol) => `/SymbolFundamental|${symbol}`),
          }),
        }
      );
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, error: text.slice(0, 200) };
      }
    } catch (error) {
      return { error: String(error) };
    }
  }, symbols);

  if (!answer.json?.d) return null;

  const fundamentals = new Map();
  for (const symbol of symbols) {
    const data = answer.json.d[`/SymbolFundamental|${symbol}`];
    if (!data || data.CreationIssue || !data.Name) continue;
    fundamentals.set(symbol, data);
  }
  return fundamentals;
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.error(`${queries.length} tickers to check`);

let silences = 0;
let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (let offset = startIndex - 1; offset < queries.length; offset += BATCH_SIZE) {
  const batch = queries.slice(offset, offset + BATCH_SIZE).filter((ticker) => !seen.has(ticker));
  if (batch.length === 0) continue;

  const fundamentals = await fetchFundamentals(batch);
  if (fundamentals === null) {
    silences += 1;
    console.error(`[${offset + 1}-${offset + batch.length}] no answer`);
    if (silences >= 3) {
      throw new Error("SogoTrade stopped answering. Is the session still signed in?");
    }
    continue;
  }
  silences = 0;

  for (const query of batch) {
    const data = fundamentals.get(query);
    if (!data) {
      skip("not carried");
      continue;
    }

    const ticker = normalizeTicker(data.Symbol || query);
    if (ticker !== query) {
      skip("alias");
      continue;
    }

    const name = normalize(data.Name);
    const type = listingType(data);
    if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
    if (type === "STOCK" && !wantStocks) continue;
    if (type === "CRYPTO" && !wantCrypto) continue;

    let match = null;
    if (type === "CRYPTO") {
      if (!cryptoTickers.has(ticker) && !keepUnlisted) {
        unlisted += 1;
        continue;
      }
    } else {
      match = resolveListing(tickerCandidates, ticker, name, type);
      if (!match && !keepUnlisted) {
        unlisted += 1;
        continue;
      }
    }

    const exchange = type === "CRYPTO" ? "CRYPTO" : venueOf(data.Exchange, match);
    if (type !== "CRYPTO" && !US_VENUES.has(exchange)) {
      skip("foreign tape");
      continue;
    }

    if (seen.has(ticker)) continue;
    seen.add(ticker);

    results.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency: "USD",
      type,
      raw: [ticker, name, data.Exchange].filter(Boolean).join(" "),
      isin: match?.isin || "",
    });
  }

  save();
  console.error(
    `[${Math.min(offset + BATCH_SIZE, queries.length)}/${queries.length}] ${results.length} matched`
  );
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

await browser.disconnect();
