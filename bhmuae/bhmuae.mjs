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

// `--csv=PATH` overrides the fund list (defaults to etfs.csv) and
// `--stocks-csv=PATH` the share list. `--etfs-only` and `--stocks-only`
// answer for one shelf alone.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
// Everything the book quotes, and not only what the catalogues happen to carry.
const keepUnlisted = hasFlag("all");

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;

function loadCsv(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin) continue;

    const name = normalize(columns.slice(3).join(",") || columns.slice(2).join(","));
    const entry = index.get(isin);
    if (!entry) {
      index.set(isin, { kind, names: name ? [name] : [] });
    } else if (name && !entry.names.includes(name)) {
      entry.names.push(name);
    }
  }

  return index;
}

// Funds are read first so an ISIN two catalogues happen to carry is remembered
// as the fund it is. There is no coin list to read: this login's book holds no
// crypto — Rubix names the shelf, but TD never fills it.
const catalogue = new Map();
if (wantEtfs) loadCsv(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadCsv(stocksCsvPath, "STOCK", catalogue);

const onlyIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);

// Rubix names the tape; the catalogues name the venue. DIFX is Nasdaq Dubai.
// ADSM and TDWL are on the platform's exchange list, but this account's
// tradable set (TD|EXGS) is only DFM and DIFX — they are mapped in case a
// later login actually dumps them, not because they are invented here.
const EXCHANGES = {
  DFM: "DFM",
  DIFX: "NASDAQDUBAI",
  ADSM: "ADX",
  ADX: "ADX",
  TDWL: "TADAWUL",
};

// Equity, REIT-as-equity, mutual / closed-end funds, and ETFs. Futures, sukuk,
// FX and the commodity spots sit on the other asset ids and are left out.
const KEEP_ASSETS = new Set([1, 5, 16]);

// Mubasher's board / odd-lot line is the same ISIN with a backtick-B suffix.
// The regular tape is the one worth keeping.
function isBoardLot(row) {
  return /`/.test(row.symbolCode || row.dispCode || "") || String(row.marketID || "").toUpperCase() === "B";
}

function displayTicker(row) {
  return normalize(row.symbolCode || row.dispCode)
    .replace(/`B$/i, "")
    .replace(/`/g, "")
    .toUpperCase();
}

function listingType(row, kind, name) {
  const text = `${row.longDesc || ""} ${name || ""}`;
  if (/\bETNs?\b/i.test(text)) return "ETN";
  if (/\bETCs?\b/i.test(text)) return "ETC";
  if (kind === "ETF") return "ETF";
  if (Number(row.assetClass) === 16 || Number(row.instrumentType) === 86) return "ETF";
  if (Number(row.assetClass) === 5) return "ETF";
  if (/\bETFs?\b/i.test(text)) return "ETF";
  return "STOCK";
}

const TRADE_URL = "https://trading.bhmuae.ae/web/secure/one-stop-trade";
const outputPath = new URL("bhmuae-parsed.json", import.meta.url);

if (cryptoOnly) {
  console.error("no coin book: Rubix lists a crypto shelf, but this login's TD dump has none");
  if (hasFlag("fresh") || !fs.existsSync(outputPath)) {
    fs.mkdirSync(new URL(".", outputPath), { recursive: true });
    fs.writeFileSync(outputPath, "[]\n");
  }
  process.exit(0);
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /trading\.bhmuae\.ae/i.test(candidate.url())) ||
  pages.find((candidate) => /bhmuae/i.test(candidate.url())) ||
  (await browser.newPage());

if (!/trading\.bhmuae\.ae/i.test(page.url())) {
  await page.goto(TRADE_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// The tradable universe is already sitting in IndexedDB (`Extended` /
// `rubixExtended`) by the time the one-stop-trade desk is usable. Keys are
// compound objects (`TD|DFM` plus a language), so they have to be read off
// getAllKeys and fetched with the object itself — a string that merely looks
// the same does not hit. Awaiting several gets on one transaction lets it go
// inactive, which is why each get opens its own.
async function loadBook() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("Extended");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (![...db.objectStoreNames].includes("rubixExtended")) {
      db.close();
      return { exchanges: [], rows: [] };
    }

    const allKeys = await new Promise((resolve) => {
      const tx = db.transaction("rubixExtended", "readonly");
      const request = tx.objectStore("rubixExtended").getAllKeys();
      request.onsuccess = () => resolve(request.result || []);
    });

    const get = (key) =>
      new Promise((resolve) => {
        const tx = db.transaction("rubixExtended", "readonly");
        const request = tx.objectStore("rubixExtended").get(key);
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => resolve(undefined);
      });

    const tdKeys = allKeys.filter((key) => String(key).startsWith("TD|"));
    const exgsKey = tdKeys.find((key) => String(key).includes("TD|EXGS"));
    const exchanges = exgsKey ? (await get(exgsKey)) || [] : [];

    const rows = [];
    for (const key of tdKeys) {
      if (String(key).includes("TD|EXGS")) continue;
      const table = await get(key);
      if (!Array.isArray(table)) continue;
      for (const row of table) rows.push(row);
    }

    db.close();
    return { exchanges, rows };
  });
}

let book = { exchanges: [], rows: [] };
for (let attempt = 0; attempt < 8; attempt += 1) {
  book = await loadBook().catch(() => ({ exchanges: [], rows: [] }));
  if (book.rows.length > 0) break;
  await sleep(2000);
}

if (book.rows.length === 0) {
  throw new Error("BHM returned no instruments. Is trading.bhmuae.ae signed in?");
}

console.error(
  `${book.rows.length} instruments in Rubix` +
    (book.exchanges.length ? ` (${book.exchanges.join(", ")})` : "")
);

const candidates = [];
for (const row of book.rows) {
  if (Number(row.isCFD) === 1) continue;
  if (!KEEP_ASSETS.has(Number(row.assetClass))) continue;

  const exchangeCode = String(row.exchangeCode || "").toUpperCase();
  if (!EXCHANGES[exchangeCode]) continue;

  const isin = toIsin(row.isin);
  if (!isin) continue;
  if (onlyIsins.size > 0 && !onlyIsins.has(isin)) continue;

  const ticker = displayTicker(row);
  if (!ticker) continue;

  candidates.push(row);
}

// One ISIN is quoted twice when Rubix keeps a board lot beside the regular
// tape. The board lot is dropped so the listing is the one that actually trades.
const preferred = new Map();
for (const row of candidates) {
  const exchangeCode = String(row.exchangeCode || "").toUpperCase();
  const isin = toIsin(row.isin);
  const key = `${exchangeCode}:${isin}`;
  const existing = preferred.get(key);
  if (!existing) {
    preferred.set(key, row);
    continue;
  }
  if (isBoardLot(existing) && !isBoardLot(row)) preferred.set(key, row);
}

const results = [];
let unlisted = 0;

for (const row of preferred.values()) {
  const isin = toIsin(row.isin);
  const listed = catalogue.get(isin);
  if (!listed && !keepUnlisted) {
    unlisted += 1;
    continue;
  }

  const quoted = normalize(row.longDesc || row.shortDesc);
  const name = quoted || listed?.names[0] || displayTicker(row);
  const type = listingType(row, listed?.kind || "", name);
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;

  const ticker = displayTicker(row);
  const exchange = EXCHANGES[String(row.exchangeCode || "").toUpperCase()];
  const currency = String(row.currency || row.displayCurrency || "").toUpperCase() || null;

  results.push({
    query: isin,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [row.dispCode || row.symbolCode, row.longDesc, row.exchangeCode, currency]
      .filter(Boolean)
      .join(" "),
    isin,
  });
}

results.sort((left, right) => {
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "")
);

await browser.disconnect();
