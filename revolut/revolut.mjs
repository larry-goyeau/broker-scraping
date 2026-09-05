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

// Majors ship a currency glyph as `symbol` (Ƀ, Ξ); the ISO code is the ticker.
// Newer tokens use an `X:<decimals>:<TICKER>` isoCode instead.
function cryptoTicker(row) {
  const iso = normalize(row.isoCode).toUpperCase();
  if (/^[A-Z0-9]+$/.test(iso)) return iso;
  const tagged = iso.match(/^X:\d+:(.+)$/);
  if (tagged && tagged[1]) return tagged[1].toUpperCase();
  const symbol = normalizeTicker(row.symbol);
  return /^[A-Z0-9]+$/.test(symbol) ? symbol : "";
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

// Tradegate is how EU names are quoted (VWCE, EUNL, SAP). ARCA funds settle
// on AMEX in the catalogues, the same way Lightyear maps ARCA.
const EXCHANGES = {
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  ARCA: "AMEX",
  BATS: "CBOE",
  CBOE: "CBOE",
  LSE: "LSE",
  TGAT: "TRADEGATE",
  OTC: "OTC",
};

const MICS = {
  XNAS: "NASDAQ",
  XNGS: "NASDAQ",
  XNYS: "NYSE",
  XASE: "AMEX",
  ARCX: "AMEX",
  BATS: "CBOE",
  XLON: "LSE",
  XGAT: "TRADEGATE",
  TGAT: "TRADEGATE",
  OTCM: "OTC",
  OOTC: "OTC",
};

function venueOf(instrument) {
  const mic = normalize(instrument.mic).toUpperCase();
  if (MICS[mic]) return MICS[mic];
  const exchange = normalize(instrument.exchange).toUpperCase();
  if (EXCHANGES[exchange]) return EXCHANGES[exchange];
  return exchange || null;
}

function listingType(instrument) {
  const type = normalize(instrument.type).toUpperCase();
  if (type === "ETF") return "ETF";
  if (type === "ETC") return "ETC";
  if (type === "ETN") return "ETN";
  if (type === "EQUITY" || type === "ADR" || type === "SPAC") return "STOCK";
  return "";
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /invest\.revolut\.com/i.test(candidate.url())) ||
  (await browser.newPage());
await page.bringToFront();

if (!/invest\.revolut\.com/i.test(page.url())) {
  await page.goto("https://invest.revolut.com/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

// Cookies alone are refused with "Phone and/or passcode are incorrect": the
// API also wants the device header, which the app keeps in a readable cookie.
// One call is the whole securities book; spot crypto is a second list.
async function fetchBook() {
  return page.evaluate(async () => {
    const cookie = (name) =>
      document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1) || "";

    const headers = {
      Accept: "application/json, text/plain, */*",
      "x-browser-application": "WEB_CLIENT",
      "x-client-version": "100.0",
      "x-device-id": decodeURIComponent(cookie("revo_device_id")),
    };

    const get = async (path) => {
      try {
        const response = await fetch(path, { credentials: "include", headers });
        const text = await response.text();
        try {
          return { status: response.status, json: JSON.parse(text) };
        } catch {
          return { status: response.status, error: text.slice(0, 200) };
        }
      } catch (error) {
        return { error: String(error) };
      }
    };

    return {
      instruments: await get("/api/retail/instruments"),
      crypto: await get("/api/retail/currencies?type=crypto"),
    };
  });
}

let book = { instruments: { json: null }, crypto: { json: null } };
for (let attempt = 0; attempt < 4; attempt += 1) {
  book = await fetchBook();
  if (Array.isArray(book.instruments.json) && book.instruments.json.length > 0) break;
  await sleep(2000);
}

if (!Array.isArray(book.instruments.json) || book.instruments.json.length === 0) {
  await browser.disconnect();
  throw new Error("Revolut did not hand over its instrument list. Is invest.revolut.com signed in?");
}

const instruments = book.instruments.json;
const coins = Array.isArray(book.crypto.json) ? book.crypto.json : [];
console.error(
  `${instruments.length} instruments in Revolut's offering` +
    (coins.length ? `, ${coins.length} spot coins` : "")
);

const results = [];
const seen = new Set();
let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

function askedFor(isin, ticker) {
  if (onlyIsins.size === 0 && onlyTickers.size === 0) return true;
  return (isin && onlyIsins.has(isin)) || onlyTickers.has(ticker);
}

for (const instrument of instruments) {
  const rawType = normalize(instrument.type).toUpperCase();
  if (rawType === "CFD") {
    skip("cfd");
    continue;
  }
  if (rawType === "BOND") {
    skip("bond");
    continue;
  }
  if (rawType === "FUND") {
    skip("private fund");
    continue;
  }

  const type = listingType(instrument);
  if (!type) {
    skip(rawType ? rawType.toLowerCase() : "unknown type");
    continue;
  }

  // Revolut still quotes names it will not sell (a US ETF has no KID, a
  // halted line sits as INACTIVE). Search shows them; buying does not.
  if (instrument.stateDetails && instrument.stateDetails.canBuy === false) {
    skip("not buyable");
    continue;
  }
  if (instrument.delistDate && Date.now() >= Number(instrument.delistDate)) {
    skip("delisted");
    continue;
  }

  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;

  const ticker = normalizeTicker(instrument.ticker || instrument.currentSymbol);
  const isin = toIsin(instrument.isin);
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  if (!askedFor(isin, ticker)) continue;

  const listed = isin ? catalogue.get(isin) : null;
  if (!listed && !keepUnlisted) {
    unlisted += 1;
    continue;
  }

  const exchange = venueOf(instrument);
  const currency = normalize(instrument.currency).toUpperCase() || null;
  const name = normalize(instrument.name) || listed?.names[0] || ticker;
  const key = `${isin || ticker}:${exchange}:${ticker}:${currency || ""}:${type}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [ticker, name, instrument.exchange, currency].filter(Boolean).join(" "),
    isin: isin || "",
  });
}

if (wantCrypto) {
  for (const coin of coins) {
    const ticker = cryptoTicker(coin);
    if (!ticker) {
      skip("no crypto ticker");
      continue;
    }
    if (!askedFor("", ticker)) continue;
    if (!cryptoTickers.has(ticker) && !keepUnlisted) {
      unlisted += 1;
      continue;
    }

    const name = normalize(coin.name) || ticker;
    const key = `${ticker}:CRYPTO:EUR:CRYPTO`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query: ticker,
      ticker,
      name,
      exchange: "CRYPTO",
      currency: "EUR",
      type: "CRYPTO",
      raw: [ticker, name].filter(Boolean).join(" "),
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

const outputPath = new URL("revolut-parsed.json", import.meta.url);
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
