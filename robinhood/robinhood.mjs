import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return afterExchange;
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

// Robinhood names a listing after the venue's MIC, so NYSE Arca comes through
// as ARCX and NYSE American as XASE, both of which the CSV files under the
// exchange that owns them.
const EXCHANGE_NAMES = {
  ARCX: "AMEX",
  XASE: "AMEX",
  BATS: "CBOE",
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  IEXG: "IEX",
  OTCM: "OTC",
};

const KEEP_TYPES = new Set(["stock", "adr", "reit", "etp", "cef"]);

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match. Crypto rows often
// have no ISIN.
function loadTickerCandidatesFromCsv(csvPath, kind, into = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return into;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = normalize(isinIndex >= 1 ? columns[isinIndex - 1] : columns[1]).toUpperCase();
    const name = (isinIndex >= 0 ? columns.slice(isinIndex + 1) : columns.slice(3)).join(",").trim();
    if (!name) continue;

    const candidates = into.get(ticker) || [];
    into.set(ticker, candidates);

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

  return into;
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
  "CO", "TRUST", "AG", "SA", "NV", "SE", "CLASS", "ETF", "UCITS", "COMMON",
  "STOCK", "SHARES",
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

// A US ticker names one instrument, so when Robinhood's venue is also where
// the CSV lists that ticker, the venue alone settles it. Only when no US
// venue corroborates (a ticker shared across borders) does the name have to
// agree before an ISIN is trusted.
function resolveListing(tickerCandidates, ticker, name, mic) {
  const candidates = tickerCandidates.get(ticker) || [];
  if (candidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[mic];
  const sameVenue = venue
    ? candidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    isin: candidate.isin,
    kind: candidate.kind,
    ...scoreCandidate(name, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((entry) => entry.score));
  if (sameVenue.length === 0 && bestScore < MIN_NAME_SCORE) return null;

  if (scored.length === 1) return scored[0];

  const winners = scored.filter((entry) => entry.score === bestScore);
  return winners.length === 1 ? winners[0] : null;
}

function listingType(row) {
  const tax = String(row.tax_security_type || "").toLowerCase();
  const kind = String(row.type || "").toLowerCase();
  const text = `${row.simple_name || ""} ${row.name || ""}`;
  if (tax === "etn" || /\bETNs?\b/i.test(text)) return "ETN";
  if (tax === "etc" || /\bETCs?\b/i.test(text)) return "ETC";
  if (kind === "etp" || kind === "cef" || tax === "etf" || tax === "trust" || tax === "mf") return "ETF";
  return "STOCK";
}

function micOf(row) {
  return String(row.market || "").split("/").filter(Boolean).pop() || "";
}

function slimInstrument(row) {
  return {
    symbol: String(row.symbol || "").toUpperCase(),
    name: normalize(row.simple_name || row.name),
    type: row.type,
    tax_security_type: row.tax_security_type,
    mic: micOf(row),
    allDay: row.all_day_tradability === "tradable",
  };
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` / `--refresh` re-walks the paginated book.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh") || hasFlag("refresh");

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const fundsByTicker = wantEtfs ? loadTickerCandidatesFromCsv(etfsCsvPath, "ETF") : new Map();
const stocksByTicker = wantStocks ? loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK") : new Map();
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const outputPath = new URL("robinhood-parsed.json", import.meta.url);
const cachePath = new URL(".robinhood-cache.json", import.meta.url);

async function fetchJson(url) {
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

function readCache() {
  if (fresh || !fs.existsSync(cachePath)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    // The 24-hour-only cache dropped US-resident names; this walk keeps
    // them. usOnly is decided later from Robinhood Europe's SID.
    if (Array.isArray(cached?.items) && cached.includeUsOnly) return cached;
  } catch {
    // Ignore a corrupt cache and rebuild it.
  }
  return null;
}

function writeCache(payload) {
  fs.writeFileSync(cachePath, JSON.stringify(payload));
}

// Europe sells Classic Stock Tokens, not the US share. The underlyings are
// listed in Robinhood Europe's Specific Information Document (~2,000 names).
// AQLT is absent there; MGK is present. all_day_tradability is the wrong proxy.
const EU_SID_URL =
  "https://cdn.robinhood.com/assets/robinhood/legal/special_information_document_eu.pdf";

async function loadEuTokenTickers() {
  const response = await fetch(EU_SID_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) {
    console.error(`EU SID PDF returned ${response.status}; usOnly will not be set`);
    return new Set();
  }

  const pdfPath = path.join(os.tmpdir(), "robinhood-sid-eu.pdf");
  const pyPath = path.join(os.tmpdir(), "robinhood-sid-extract.py");
  fs.writeFileSync(pdfPath, Buffer.from(await response.arrayBuffer()));
  fs.writeFileSync(
    pyPath,
    [
      "from pypdf import PdfReader",
      "import re, sys",
      'text = "\\n".join((page.extract_text() or "") for page in PdfReader(sys.argv[1]).pages)',
      "tickers = set()",
      "for match in re.finditer(r'market-activity/stocks/([A-Za-z0-9.\\-]+)', text, re.I):",
      "    ticker = match.group(1).upper()",
      '    if ticker in {"ETF", "SEC", "FILINGS"}: continue',
      "    if 1 <= len(ticker) <= 7: tickers.add(ticker)",
      'print("\\n".join(sorted(tickers)))',
      "",
    ].join("\n")
  );

  const extracted = spawnSync("python3", [pyPath, pdfPath], { encoding: "utf8", maxBuffer: 2_000_000 });
  if (extracted.status !== 0) {
    console.error("could not read EU stock-token SID; usOnly will not be set");
    if (extracted.stderr) console.error(extracted.stderr.trim());
    return new Set();
  }

  return new Set(extracted.stdout.split(/\s+/).map((ticker) => ticker.trim()).filter(Boolean));
}

// Query flags on /instruments/ are ignored, so the whole paginated book has
// to be walked and filtered here. Inactive warrants and the like are the bulk
// of it. all_day_tradability is overnight trading on the US brokerage, not
// EU access: MGK is untradable 24h but is a Classic Stock Token in Europe.
async function loadUniverse() {
  const cached = readCache();
  const items = cached?.items ? [...cached.items] : [];
  let url = cached?.complete ? "" : cached?.next || "https://api.robinhood.com/instruments/";
  let pages = 0;

  while (url) {
    const data = await fetchJson(url);
    pages += 1;
    for (const row of data.results || []) {
      if (row.is_test) continue;
      if (row.state !== "active" || row.tradability !== "tradable") continue;
      if (!KEEP_TYPES.has(row.type)) continue;
      const mic = micOf(row);
      if (!EXCHANGE_NAMES[mic]) continue;
      const ticker = String(row.symbol || "").toUpperCase();
      if (!ticker) continue;
      items.push(slimInstrument(row));
    }
    url = data.next || "";
    if (pages % 25 === 0) {
      writeCache({ items, next: url, complete: false, includeUsOnly: true });
      console.error(`  ${pages} pages, ${items.length} kept`);
    }
  }

  writeCache({ items, next: "", complete: true, includeUsOnly: true });
  return items;
}

const universe = cryptoOnly ? [] : await loadUniverse();
if (!cryptoOnly) console.error(`${universe.length} instruments in Robinhood's offering`);

const euTokens = cryptoOnly ? new Set() : await loadEuTokenTickers();
if (euTokens.size > 0) console.error(`${euTokens.size} Classic Stock Tokens in Robinhood Europe's SID`);

const coins = wantCrypto
  ? ((await fetchJson("https://nummus.robinhood.com/currency_pairs/")).results || [])
  : [];
if (wantCrypto) console.error(`${coins.length} crypto pairs listed`);

const results = [];
const seen = new Set();
let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const instrument of universe) {
  const type = listingType(instrument);
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;

  const ticker = normalizeTicker(instrument.symbol);
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

  const catalogue = type === "STOCK" ? stocksByTicker : fundsByTicker;
  const match = resolveListing(catalogue, ticker, instrument.name, instrument.mic);
  if (!match && !keepUnlisted) {
    unlisted += 1;
    continue;
  }

  const exchange = EXCHANGE_NAMES[instrument.mic];
  const name = instrument.name || match?.name || ticker;
  const isin = match?.isin || "";
  const key = `${isin || ticker}:${exchange}:${ticker}:USD:${type}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  const row = {
    query: ticker,
    ticker,
    name,
    exchange,
    currency: "USD",
    type,
    raw: [ticker, name, instrument.mic].filter(Boolean).join(" "),
    isin,
  };
  if (euTokens.size > 0 && !euTokens.has(ticker)) row.usOnly = true;
  results.push(row);
}

if (wantCrypto) {
  for (const pair of coins) {
    if (pair.tradability !== "tradable" || pair.display_only) {
      skip(pair.display_only ? "crypto display-only" : "crypto untradable");
      continue;
    }
    const asset = pair.asset_currency || {};
    const ticker = normalizeTicker(asset.code || asset.display_code || pair.symbol);
    if (!ticker) {
      skip("no crypto ticker");
      continue;
    }
    if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;
    if (!cryptoTickers.has(ticker) && !keepUnlisted) {
      unlisted += 1;
      continue;
    }

    const quote = String((pair.quote_currency || {}).code || "USD").toUpperCase();
    const name = normalize(asset.name || pair.name) || ticker;
    const key = `${ticker}:CRYPTO:${quote}:CRYPTO`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query: ticker,
      ticker,
      name,
      exchange: "CRYPTO",
      currency: quote,
      type: "CRYPTO",
      raw: [pair.symbol || ticker, name].filter(Boolean).join(" "),
      isin: "",
    });
  }
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
const usOnly = results.filter((row) => row.usOnly).length;

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (usOnly ? `, ${usOnly} US-resident only` : "") +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
