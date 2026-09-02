import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// La Banque Postale answers an ISIN with the Euronext listing it books, so
// the CSV is only asked for the ticker when the mnemonic is blank, and for
// the name the lists already agreed on.
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

const PLACE_EXCHANGES = {
  PARIS: "EURONEXT",
  AMSTERDAM: "EURONEXT",
  BRUXELLES: "EURONEXT",
  BRUSSELS: "EURONEXT",
  LISBONNE: "EURONEXT",
  LISBON: "EURONEXT",
};

function mapExchange(place) {
  const text = String(place || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (PLACE_EXCHANGES[text]) return PLACE_EXCHANGES[text];
  if (text.startsWith("EURONEXT")) return "EURONEXT";
  return "";
}

function typeFor(row, csvRows) {
  const code = String(row.codeType || "").toUpperCase();
  const label = String(row.libelleTypeValeur || "").toLowerCase();
  let fromBook = "";
  if (code === "ETFI" || /etf|tracker|indiciel/.test(label)) fromBook = "ETF";
  else if (code === "AORD" || /action/.test(label)) fromBook = "STOCK";
  if (!fromBook || !csvRows?.length) return "";
  const hasEtf = csvRows.some((item) => item.kind === "ETF");
  const hasStock = csvRows.some((item) => item.kind === "STOCK");
  if (fromBook === "ETF" && hasEtf) return "ETF";
  if (fromBook === "STOCK" && hasStock) return "STOCK";
  if (hasEtf) return "ETF";
  if (hasStock) return "STOCK";
  return "";
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

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /labanquepostale\.offrebourse/i.test(candidate.url())) ||
  (await browser.newPage());
await page.bringToFront().catch(() => {});

if (!/labanquepostale\.offrebourse/i.test(page.url())) {
  await page.goto("https://labanquepostale.offrebourse.com/app-v2/", {
    waitUntil: "domcontentloaded",
  });
}

const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
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
// the share list (defaults to stocks.csv). La Banque Postale's own book is
// Euronext Paris, Amsterdam and Brussels: ordinary shares and UCITS trackers.
// There is no US tape, no spot crypto and no US-residents-only flag.
// `--funds-only` / `--etfs-only` keep the trackers; `--stocks-only` the shares.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");

const byIsin = new Map();
if (!stocksOnly) loadByIsin(csvPath, "ETF", byIsin);
if (!fundsOnly) loadByIsin(stocksCsvPath, "STOCK", byIsin);

const cliQueries = positionalArgs.map(toIsin).filter(Boolean);
const csvQueries = [...byIsin.entries()]
  .filter(([, rows]) => rows.some((row) => !row.exchange || row.exchange === "EURONEXT"))
  .map(([isin]) => isin);
const queries = [...new Set(cliQueries.length > 0 ? cliQueries : csvQueries)].sort();

const outputPath = new URL("labanquepostale-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
const lookedUp = new Set();
const entryKey = (query, ticker, exchange, currency) =>
  `${query}:${ticker}:${exchange}:${currency || ""}`.toUpperCase();

function loadJson(fileUrl) {
  if (!fs.existsSync(fileUrl)) return null;
  try {
    return JSON.parse(fs.readFileSync(fileUrl, "utf8"));
  } catch {
    return null;
  }
}

const existing = loadJson(outputPath);
if (Array.isArray(existing)) {
  for (const entry of existing) {
    results.push(entry);
    if (entry?.query && entry?.ticker) {
      seen.add(entryKey(entry.query, entry.ticker, entry.exchange, entry.currency));
    }
    if (entry?.query) lookedUp.add(String(entry.query).toUpperCase());
  }
}

if (startIndex > 1) {
  for (const isin of queries.slice(0, startIndex - 1)) lookedUp.add(isin);
}

let cookieHeader = "";
let xsrf = "";
let accountId = "";

async function refreshSession() {
  const cookies = await page.cookies("https://labanquepostale.offrebourse.com");
  cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  xsrf = (cookies.find((cookie) => cookie.name === "XSRF-TOKEN") || {}).value || xsrf;
}

function raceTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

async function fetchJson(path, timeoutMs = 8000) {
  const run = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`https://labanquepostale.offrebourse.com${path}`, {
        headers: {
          Cookie: cookieHeader,
          Accept: "application/json, text/plain, */*",
          Referer: "https://labanquepostale.offrebourse.com/app-v2/",
          "X-XSRF-TOKEN": xsrf,
        },
        signal: controller.signal,
      });
      if (!response.ok) return { status: response.status, json: null };
      return { status: 200, json: await response.json() };
    } catch {
      return { status: 0, json: null };
    } finally {
      clearTimeout(timer);
    }
  };
  return raceTimeout(run(), timeoutMs + 2000, { status: 0, json: null });
}

await refreshSession();
const config = await fetchJson("/rest/configuration");
accountId = config.json?.idCompteActif || "";
if (!accountId) {
  throw new Error("Could not read the La Banque Postale session. Is offrebourse signed in?");
}

async function search(isin) {
  const encoded = encodeURIComponent(isin);
  const answer = await fetchJson(
    `/rest/rechercheValeur/${encodeURIComponent(accountId)}/${encoded}?cache=false`
  );
  if (answer.status !== 200 || !answer.json) return { status: answer.status, hits: [] };
  const hits = answer.json?.data?.ligneActifValeurTO;
  return { status: 200, hits: Array.isArray(hits) ? hits : [] };
}

async function searchWithRetry(isin) {
  let answer = await search(isin);
  for (let attempt = 0; attempt < 2 && answer.status !== 200; attempt++) {
    await refreshSession();
    await sleep(300);
    answer = await search(isin);
  }
  return answer;
}

const CONCURRENCY = 3;
const pending = queries.filter((isin) => !lookedUp.has(isin));
console.error(`${pending.length} ISINs to look up (${lookedUp.size} already done)`);

const skipped = new Map();
const bump = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);

function saveResults() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

for (let offset = 0; offset < pending.length; offset += CONCURRENCY) {
  const batch = pending.slice(offset, offset + CONCURRENCY);
  const answers = await Promise.all(batch.map((isin) => searchWithRetry(isin)));

  for (const [index, isin] of batch.entries()) {
    lookedUp.add(isin);
    const answer = answers[index];
    if (answer.status !== 200) {
      bump("search failed");
      console.error(`  ${isin}: search failed`);
      continue;
    }

    const hits = answer.hits.filter((hit) => toIsin(hit.codeValeur) === isin);
    if (hits.length === 0) {
      bump("not listed");
      continue;
    }

    let kept = 0;
    for (const hit of hits) {
      if (hit.negociable === false || hit.autoriseAchat === false) {
        bump("not tradable");
        continue;
      }
      const type = typeFor(hit, byIsin.get(isin));
      if (!type) {
        bump("skipped type");
        continue;
      }
      if (fundsOnly && type !== "ETF") continue;
      if (stocksOnly && type !== "STOCK") continue;

      const exchange = mapExchange(hit.libelleIdPlace);
      if (!exchange) {
        bump("unknown venue");
        continue;
      }

      const currency = String(hit.deviseCours || "").toUpperCase();
      if (!currency || currency === "%") {
        bump("no currency");
        continue;
      }

      const ticker =
        String(hit.codeMnemonique || "").trim().toUpperCase() ||
        tickerFor(byIsin.get(isin), exchange, type) ||
        isin;
      const name = nameFor(
        byIsin.get(isin),
        exchange,
        type,
        String(hit.libelleValeur || "").replace(/\s+/g, " ").trim()
      );

      const key = entryKey(isin, ticker, exchange, currency);
      if (seen.has(key)) continue;
      seen.add(key);
      kept += 1;

      results.push({
        query: isin,
        ticker,
        name,
        exchange,
        currency,
        type,
        raw: [hit.libelleValeur, isin, hit.libelleIdPlace, hit.libelleTypeValeur]
          .filter(Boolean)
          .join(" "),
        isin,
      });
    }
    if (kept === 0 && hits.length > 0) bump("no usable listing");
  }

  if (offset > 0 && offset % 300 === 0) await refreshSession();

  const done = offset + batch.length;
  if (done <= 15 || done % 100 < CONCURRENCY || done >= pending.length) {
    console.error(`  looked up ${done}/${pending.length}, ${results.length} listings`);
  }
  if (done % 50 < CONCURRENCY) saveResults();
}

saveResults();

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
