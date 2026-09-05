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

function cryptoBase(symbol) {
  const text = normalizeTicker(symbol);
  const cut = text.indexOf("/");
  return cut >= 0 ? text.slice(0, cut) : text;
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

// Lightyear names the tape its own way. The catalogues name the venue.
// Brussels is "BSE" here (Bourse de Bruxelles, MIC XBRU), not Bombay; AIM
// is the London junior market. XGAT is Tradegate even when the name is Swiss.
const EXCHANGES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  OTC: "OTC",
  LSE: "LSE",
  AIM: "LSE",
  XETRA: "XETR",
  XGAT: "TRADEGATE",
  XSWX: "SIX",
  AEX: "EURONEXT",
  PAR: "EURONEXT",
  BSE: "EURONEXT",
  XLIS: "EURONEXT",
  IRE: "EURONEXT",
  ISE: "EURONEXT",
  XOSL: "OSL",
  XSTO: "OMXSTO",
  CSE: "OMXCOP",
  XHEL: "OMXHEX",
  XTAL: "OMXTSE",
  XLIT: "OMXVSE",
  XRIS: "OMXRSE",
  XMIL: "MIL",
  BME: "BME",
  VSE: "VIE",
  WSE: "GPW",
  BUX: "BET",
  LUXSE: "LUXSE",
  KRAKEN: "CRYPTO",
  CRYPTO: "CRYPTO",
};

function venueOf(row) {
  const exchange = String(row.exchange || "").toUpperCase();
  if (EXCHANGES[exchange]) return EXCHANGES[exchange];
  return exchange || null;
}

function listingType(row, kind, name) {
  const issue = String(row.issueType || "").toUpperCase();
  const text = `${row.name || ""} ${name || ""}`;
  if (issue === "CRYPTO" || String(row.assetClass || "").toLowerCase() === "crypto") return "CRYPTO";
  if (issue === "ETN" || /\bETNs?\b/i.test(text)) return "ETN";
  if (issue === "ETC" || /\bETCs?\b/i.test(text)) return "ETC";
  if (kind === "ETF" || issue === "ETF" || issue === "MUTUAL_FUND") return "ETF";
  if (/\bETFs?\b/i.test(text)) return "ETF";
  return "STOCK";
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /lightyear\./i.test(candidate.url())) || (await browser.newPage());
if (!/lightyear\./i.test(page.url())) {
  await page.goto("https://lightyear.com/", { waitUntil: "domcontentloaded" });
  await sleep(3000);
}
await page.bringToFront();

// The tradable universe is already sitting behind the same-origin proxy the
// search palette uses. One call hands over every line this account can see —
// searching ISINs one at a time only rediscovers a subset of the same book.
async function loadBook() {
  return page.evaluate(async () => {
    try {
      const response = await fetch("/proxy/v1/instrument", {
        credentials: "include",
        headers: { Accept: "application/json" },
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
}

let answer = { json: null };
for (let attempt = 0; attempt < 4; attempt += 1) {
  answer = await loadBook();
  if (Array.isArray(answer.json) && answer.json.length > 0) break;
  await sleep(2000);
}

if (!Array.isArray(answer.json) || answer.json.length === 0) {
  throw new Error("Lightyear returned no instruments. Is lightyear.com signed in?");
}

console.error(`${answer.json.length} instruments in Lightyear's offering`);

const results = [];
const seen = new Set();
let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const row of answer.json) {
  const issue = String(row.issueType || "").toUpperCase();
  const asset = String(row.assetClass || "").toLowerCase();
  const exchangeCode = String(row.exchange || "").toUpperCase();

  if (exchangeCode === "FTXU") {
    skip("FTX leftover");
    continue;
  }
  // The dump still carries lines the search palette will not serve. Maha
  // Energy (SE0008374383) is one: the ISIN is on the internal book, and
  // typing it into search answers empty.
  if (row.isInternal) {
    skip("internal");
    continue;
  }
  if (issue === "BOND" || asset === "debt") {
    skip("bond");
    continue;
  }
  if (issue === "OTHER" && asset === "other") {
    skip("right");
    continue;
  }

  const isCrypto = issue === "CRYPTO" || asset === "crypto";
  const ticker = isCrypto ? cryptoBase(row.symbol) : normalizeTicker(row.symbol);
  if (!ticker) {
    skip("no ticker");
    continue;
  }

  const isin = toIsin(row.isin);
  if (onlyIsins.size > 0 || onlyTickers.size > 0) {
    const asked = (isin && onlyIsins.has(isin)) || onlyTickers.has(ticker);
    if (!asked) continue;
  }

  if (isCrypto) {
    if (!wantCrypto) continue;
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

    const quoted = normalize(row.name);
    const type = listingType(row, listed?.kind || "", quoted);
    if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
    if (type === "STOCK" && !wantStocks) continue;

    const exchange = venueOf(row);
    const currency = String(row.currency || "").toUpperCase() || null;
    const name = quoted || listed?.names[0] || ticker;
    const key = `${isin || ticker}:${exchange}:${ticker}:${currency || ""}:${type}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query: isin || ticker,
      ticker,
      name,
      exchange,
      currency,
      type,
      raw: [row.symbol, row.name, row.exchange, currency].filter(Boolean).join(" "),
      isin: isin || "",
    });
    continue;
  }

  const exchange = venueOf(row);
  const currency = String(row.currency || "").toUpperCase() || null;
  const name = normalize(row.name) || ticker;
  const key = `${ticker}:${exchange}:${currency || ""}:CRYPTO`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency,
    type: "CRYPTO",
    raw: [row.symbol, row.name, row.exchange, currency].filter(Boolean).join(" "),
    isin: "",
  });
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

const outputPath = new URL("lightyear-parsed.json", import.meta.url);
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
