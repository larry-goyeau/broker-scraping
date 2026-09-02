import puppeteer from "puppeteer-core";
import fs from "node:fs";

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  return firstColumn.includes(":") ? firstColumn.split(":").pop().trim() : firstColumn;
}

// EFOCS names the German ticker it actually books, so the CSV is asked for
// the spelling the other catalogues already use on that venue, and for the
// name the lists agreed on.
function loadByIsin(csvPath, kind, into = new Map()) {
  if (!fs.existsSync(csvPath)) return into;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    const exchange =
      isinIndex >= 2 ? (columns[isinIndex - 1] || "").trim().toUpperCase() : "";
    if (!name) continue;

    const rows = into.get(isin) || [];
    into.set(isin, rows);
    rows.push({ ticker, kind, name, exchange });
  }
  return into;
}

const MIC_EXCHANGES = {
  XETR: "XETR",
  XFRA: "XETR",
  XBUL: "BSESOF",
};

const MIC_BY_ID = { 1: "XBUL", 2: "XETR", 3: "XFRA" };

function mapExchange(mic) {
  return MIC_EXCHANGES[String(mic || "").toUpperCase()] || "";
}

function tickerFor(rows, csvExchange, kind) {
  const pool = (rows || []).filter((row) => !kind || row.kind === kind);
  const onVenue = csvExchange
    ? pool.filter((row) => row.exchange === csvExchange)
    : [];
  return (onVenue[0] || pool[0] || {}).ticker || "";
}

function nameFor(rows, csvExchange, kind, fallback) {
  const pool = (rows || []).filter((row) => !kind || row.kind === kind);
  const onVenue = csvExchange
    ? pool.filter((row) => row.exchange === csvExchange)
    : [];
  return (onVenue[0] || pool[0] || {}).name || fallback;
}

function typeFor(tID, csvRows) {
  const fromBook = tID === 4 ? "ETF" : tID === 1 || tID === 5 ? "STOCK" : "";
  if (!fromBook || !csvRows?.length) return "";
  const hasEtf = csvRows.some((row) => row.kind === "ETF");
  const hasStock = csvRows.some((row) => row.kind === "STOCK");
  if (fromBook === "ETF" && hasEtf) return "ETF";
  if (fromBook === "STOCK" && hasStock) return "STOCK";
  if (hasEtf) return "ETF";
  if (hasStock) return "STOCK";
  return "";
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /efocs\.app/i.test(candidate.url())) ||
  (await browser.newPage());
await page.bringToFront().catch(() => {});

if (!/efocs\.app/i.test(page.url())) {
  await page.goto("https://efocs.app/", { waitUntil: "domcontentloaded" });
}

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return new URL(fallback, import.meta.url);
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// `--csv=PATH` the fund list (defaults to etfs.csv) and `--stocks-csv=PATH`
// the share list (defaults to stocks.csv). EFOCS is EuroFinance's book: cash
// shares and UCITS trackers on Xetra, plus the Sofia board, in one dump.
// There is no spot crypto and no US-residents-only flag. `--funds-only` /
// `--etfs-only` keep the trackers; `--stocks-only` the shares.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");

const byIsin = new Map();
if (!stocksOnly) loadByIsin(csvPath, "ETF", byIsin);
if (!fundsOnly) loadByIsin(stocksCsvPath, "STOCK", byIsin);

const wantedIsins = new Set(positionalArgs.map(toIsin).filter(Boolean));

const session = await page.evaluate(() => {
  for (const entry of performance.getEntriesByType("resource")) {
    try {
      const url = new URL(entry.name);
      if (url.hostname !== "api.prod.efocs.app") continue;
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (id && key) {
        return {
          id,
          key,
          origin: url.origin,
          vn: url.searchParams.get("vn") || "100",
          os: url.searchParams.get("os") || "b",
          vs: url.searchParams.get("vs") || "demoapp",
        };
      }
    } catch {
      // Keep scanning earlier resource entries.
    }
  }
  return null;
});

if (!session) {
  throw new Error("Could not read the EFOCS session. Is efocs.app signed in?");
}

const catalogueUrl = new URL(`${session.origin}/api/actions`);
catalogueUrl.searchParams.set("vn", session.vn);
catalogueUrl.searchParams.set("os", session.os);
catalogueUrl.searchParams.set("vs", session.vs);
catalogueUrl.searchParams.set("a", "get_exchanges_stocks_ex");
catalogueUrl.searchParams.set("id", session.id);
catalogueUrl.searchParams.set("key", session.key);

const response = await fetch(catalogueUrl);
if (!response.ok) {
  throw new Error(`EFOCS catalogue refused with ${response.status}`);
}
const payload = await response.json();
const stocks = Array.isArray(payload?.stocks) ? payload.stocks : [];
console.error(`${stocks.length} instruments in the EFOCS book`);

const outputPath = new URL("efocs-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
const entryKey = (query, ticker, exchange, currency) =>
  `${query}:${ticker}:${exchange}:${currency || ""}`.toUpperCase();

if (wantedIsins.size > 0 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) {
          seen.add(entryKey(entry.query, entry.ticker, entry.exchange, entry.currency));
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start from the live book.
  }
}

const skipped = new Map();
const bump = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);

for (const row of stocks) {
  const isin = toIsin(row.isin);
  if (!isin) {
    bump("no isin");
    continue;
  }
  if (wantedIsins.size > 0 && !wantedIsins.has(isin)) continue;

  const csvRows = byIsin.get(isin);
  const type = typeFor(row.tID, csvRows);
  if (!type) {
    bump(csvRows?.length ? "skipped type" : "not on the lists");
    continue;
  }
  if (fundsOnly && type !== "ETF") continue;
  if (stocksOnly && type !== "STOCK") continue;

  const mic = MIC_BY_ID[row.cMIC] || String(row.xc || "").toUpperCase();
  const exchange = mapExchange(mic);
  if (!exchange) {
    bump("unknown venue");
    continue;
  }

  const ticker = tickerFor(csvRows, exchange, type) || String(row.code || "").toUpperCase();
  const name = nameFor(
    csvRows,
    exchange,
    type,
    String(row.nEN || row.nBG || "").replace(/\s+/g, " ").trim()
  );
  const currency = String(row.cc || "").toUpperCase();
  if (!ticker || !name || !currency) {
    bump("incomplete");
    continue;
  }

  const key = entryKey(isin, ticker, exchange, currency);
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: isin,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [row.code, isin, mic, row.sgm, row.nEN].filter(Boolean).join(" "),
    isin,
  });
}

results.sort((a, b) => a.isin.localeCompare(b.isin) || a.ticker.localeCompare(b.ticker));
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
for (const [reason, count] of [...skipped].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(count).padStart(5)} ${reason}`);
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
