import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return afterExchange;
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

function loadCsv(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin) continue;
    const name = normalize(columns.slice(3).join(","));
    const entry = index.get(isin);
    if (!entry) {
      index.set(isin, { kind, names: name ? [name] : [] });
    } else if (name && !entry.names.includes(name)) {
      entry.names.push(name);
    }
  }

  return index;
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

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. Funds are loaded first so an ISIN
// both catalogues happen to carry is remembered as the fund it is.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const catalogue = new Map();
if (wantEtfs) loadCsv(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadCsv(stocksCsvPath, "STOCK", catalogue);
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);
const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

// Saxo names some tapes with a product suffix (XETR_ETF, NYSE_ARCA). The
// catalogues name the venue, the same way Revolut maps ARCA funds onto AMEX.
const EXCHANGES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  NYSE_ARCA: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  XETR: "XETR",
  XETR_ETF: "XETR",
  PAR: "EURONEXT",
  AMS: "EURONEXT",
  AMS_MC_ETF: "EURONEXT",
  LSE: "LSE",
  LSE_ETF: "LSE",
  SWX: "SIX",
  SWX_ETF: "SIX",
  MIL: "MIL",
  MIL_ETF: "MIL",
  TGAT: "TRADEGATE",
};

function venueOf(exchangeId) {
  const code = normalize(exchangeId).toUpperCase();
  if (EXCHANGES[code]) return EXCHANGES[code];
  return code || null;
}

function listingType(assetType, name) {
  const kind = String(assetType || "").toLowerCase();
  if (kind === "fxcrypto" || kind === "cryptocurrency") return "CRYPTO";
  if (kind === "etn" || /\bETNs?\b/i.test(name)) return "ETN";
  if (kind === "etc" || (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name))) return "ETC";
  if (kind === "etf") return "ETF";
  if (kind === "stock") return "STOCK";
  return "";
}

function symbolTicker(symbol) {
  const text = normalize(symbol);
  const bare = text.includes(":") ? text.split(":")[0] : text;
  return normalizeTicker(bare);
}

function cryptoTicker(symbol) {
  const text = symbolTicker(symbol);
  const cut = text.replace(/(USD|EUR|GBP|JPY)$/i, "");
  return cut || text;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) =>
    /saxoinvestor|saxotrader|saxobank|saxo\./i.test(candidate.url())
  ) || (await browser.newPage());

if (!/saxoinvestor|saxotrader|saxobank|saxo\./i.test(page.url())) {
  await page.goto("https://www.saxoinvestor.fr/investor/page/portfolio", {
    waitUntil: "domcontentloaded",
  });
  await sleep(5000);
}

// The cash instruments an investor account can hold. Leaving this open would
// also return the CFD twin of every listing (AssetType "CfdOnEtf"), which is a
// different product quoted on the same line. Mutual funds and FX stay out.
const CASH_TYPES = ["Stock", "Etf", "Etc", "Etn"];
const CRYPTO_TYPES = ["FxCrypto"];
const DETAIL_TYPES = [...CASH_TYPES, ...CRYPTO_TYPES].join(",");

// OpenAPI wants a bearer token and the platform keeps its own only in memory.
// This endpoint mints a fresh one from the session cookies, so being signed in
// is all we need. Tokens expire, hence the refresh on age and on a 401.
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;
let token = "";
let tokenFetchedAt = 0;

async function refreshToken() {
  const answer = await page.evaluate(async () => {
    try {
      const response = await fetch("/api/login/refresh_token?appId=investor", {
        method: "POST",
        credentials: "include",
      });
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, error: text.slice(0, 200) };
      }
    } catch (error) {
      return { error: String(error) };
    }
  });

  token = answer.json?.id_token || "";
  tokenFetchedAt = token ? Date.now() : 0;
  return Boolean(token);
}

async function api(path) {
  if (!token || Date.now() - tokenFetchedAt > TOKEN_MAX_AGE_MS) await refreshToken();

  const request = (bearer) =>
    page.evaluate(
      async (target, auth) => {
        try {
          const response = await fetch(`/openapi${target}`, {
            credentials: "include",
            headers: { authorization: `Bearer ${auth}` },
          });
          const text = await response.text();
          try {
            return { status: response.status, json: JSON.parse(text) };
          } catch {
            return { status: response.status, error: text.slice(0, 200) };
          }
        } catch (error) {
          return { error: String(error) };
        }
      },
      path,
      bearer
    );

  let answer = await request(token);
  if (answer.status === 401 && (await refreshToken())) answer = await request(token);
  return answer;
}

async function fetchUniverse(assetTypes) {
  const rows = [];
  for (const assetType of assetTypes) {
    let listings = 0;
    for (let skip = 0; ; skip += 1000) {
      const answer = await api(
        `/ref/v1/instruments?AssetTypes=${assetType}&$top=1000&$skip=${skip}`
      );
      if (!Array.isArray(answer.json?.Data)) {
        throw new Error(
          `Saxo stopped handing over its instrument list (HTTP ${answer.status}). Is the session still signed in?`
        );
      }

      const pageRows = answer.json.Data;
      rows.push(...pageRows);
      listings += pageRows.length;
      if (pageRows.length < 1000 || !answer.json.__next) break;
    }
    console.error(`  ${assetType}: ${listings} listings`);
  }
  return rows;
}

async function readDetails(uics) {
  const details = new Map();

  for (let offset = 0; offset < uics.length; offset += 200) {
    const chunk = uics.slice(offset, offset + 200);
    const answer = await api(
      `/ref/v1/instruments/details?Uics=${chunk.join(",")}&AssetTypes=${DETAIL_TYPES}&$top=200`
    );
    for (const row of answer.json?.Data || []) {
      if (row?.Uic) details.set(row.Uic, row);
    }
  }

  return details;
}

console.error("reading Saxo's instrument list");
const wantedTypes = [
  ...(wantStocks || wantEtfs ? CASH_TYPES : []),
  ...(wantCrypto ? CRYPTO_TYPES : []),
];
const book = await fetchUniverse(wantedTypes);
console.error(`${book.length} instruments in Saxo's offering`);

const candidates = [];
const skipped = new Map();
let unlisted = 0;

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

function askedFor(isin, ticker) {
  if (onlyIsins.size === 0 && onlyTickers.size === 0) return true;
  return (isin && onlyIsins.has(isin)) || onlyTickers.has(ticker);
}

for (const row of book) {
  const name = normalize(row.Description);
  const type = listingType(row.AssetType, name);
  if (!type) {
    skip(String(row.AssetType || "unknown").toLowerCase());
    continue;
  }

  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;
  if (type === "CRYPTO" && !wantCrypto) continue;

  const ticker = type === "CRYPTO" ? cryptoTicker(row.Symbol) : symbolTicker(row.Symbol);
  const isin = toIsin(row.Isin);
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  if (!askedFor(isin, ticker)) continue;

  if (type === "CRYPTO") {
    if (!cryptoTickers.has(ticker) && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
  } else {
    const listed = isin ? catalogue.get(isin) : null;
    if (!listed && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
  }

  candidates.push({ row, type, ticker, isin, name });
}

console.error(`reading tradability of ${candidates.length} matching listings`);
const details = await readDetails(candidates.map((entry) => entry.row.Identifier));

const results = [];
const seen = new Set();

for (const { row, type, ticker, isin, name } of candidates) {
  const detail = details.get(row.Identifier) || {};
  const reason = detail.NonTradableReason;
  // A US ETF with no KID is sell-only for this EU retail account. Non-EU
  // retail (and EU professionals) can still buy it, so it is kept and flagged.
  const notEuResident = /KII?D/i.test(reason || "");
  if (!notEuResident && (detail.IsTradable === false || (reason && reason !== "None"))) {
    skip(reason && reason !== "None" ? reason : "not tradable");
    continue;
  }

  const exchange = venueOf(detail.Exchange?.ExchangeId || row.ExchangeId);
  const currency = normalize(detail.CurrencyCode || row.CurrencyCode).toUpperCase() || null;
  const listedName = isin ? catalogue.get(isin)?.names[0] : "";
  const displayName = normalize(detail.Description) || name || listedName || ticker;
  const key = `${isin || ticker}:${exchange}:${ticker}:${currency || ""}:${type}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  const entry = {
    query: ticker,
    ticker,
    name: displayName,
    exchange,
    currency,
    type,
    raw: [ticker, displayName, row.ExchangeId, currency].filter(Boolean).join(" "),
    isin: isin || "",
  };
  if (notEuResident) entry.notEuResident = true;
  results.push(entry);
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

const outputPath = new URL("saxo-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
let notEu = 0;
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  if (row.notEuResident) notEu += 1;
}

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (notEu ? `, ${notEu} not EU resident (no KID)` : "") +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await browser.disconnect();
