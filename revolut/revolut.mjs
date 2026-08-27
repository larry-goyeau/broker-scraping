import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;
  return (afterExchange || "").split(/[./]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadTickerCandidatesFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const candidate = {
      isin: toIsin(columns[isinIndex]),
      name: columns.slice(isinIndex + 1).join(",").trim(),
    };
    const candidates = map.get(ticker) || [];
    if (!candidates.some((existing) => existing.isin === candidate.isin)) {
      candidates.push(candidate);
      map.set(ticker, candidates);
    }
  }

  return map;
}

function loadTickersFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  return fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .map((line) => normalizeTicker(line))
    .filter(Boolean);
}

// Revolut states the ISIN itself, so the CSV is no longer asked to supply one.
// It is still worth consulting: a ticker is reused by unrelated funds, and a
// listing whose ISIN contradicts every ISIN the CSV files under that ticker is
// a different fund that happens to share the symbol.
function contradictsCsv(tickerCandidates, ticker, isin) {
  const candidates = tickerCandidates.get(ticker) || [];
  if (candidates.length === 0) return false;
  return !candidates.some((candidate) => candidate.isin === isin);
}

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session to the call below.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("invest.revolut.com")) ||
  (await browser.newPage());

if (!page.url().includes("invest.revolut.com")) {
  await page.goto("https://invest.revolut.com/", {
    waitUntil: "domcontentloaded",
  });
  await sleep(5000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/revolut-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IUSZ", "EWY", "ACWI"];
const cliQueries = positionalArgs.map(normalizeTicker).filter(Boolean);

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const csvQueries = loadTickersFromCsv(csvPath);
const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = "parsed_json/revolut-parsed.json";
const results = [];
const seen = new Set();

// The same fund reaches Revolut on more than one venue and currency.
const entryKey = (query, row) =>
  `${query}:${row.ticker}:${row.exchange}:${row.currency}`.toUpperCase();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) seen.add(entryKey(entry.query, entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

// The catalogue the asset-list modal filters client-side. Revolut hands over
// every instrument it carries in one answer, so the whole run needs a single
// call instead of a search per ticker.
//
// Cookies alone are refused with "Phone and/or passcode are incorrect": the
// API also wants the device header, which the app keeps in a readable cookie.
async function fetchUniverse() {
  const answer = await page.evaluate(async () => {
    const cookie = (name) =>
      document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1) || "";

    try {
      const response = await fetch("/api/retail/instruments", {
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          "x-browser-application": "WEB_CLIENT",
          "x-client-version": "100.0",
          "x-device-id": decodeURIComponent(cookie("revo_device_id")),
        },
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

  if (!Array.isArray(answer.json)) {
    throw new Error(
      `Revolut did not hand over its instrument list (HTTP ${answer.status}). Is the session still signed in?`
    );
  }
  return answer.json;
}

const universe = await fetchUniverse();

// Exchange-traded products only, which is the "ETPs" tab the modal used to be
// clicked onto.
const byTicker = new Map();
for (const instrument of universe) {
  if (!/^(ETF|ETC|ETN|ETP)$/.test(instrument?.type || "")) continue;
  const ticker = (instrument.ticker || "").toUpperCase();
  if (!ticker) continue;
  if (!byTicker.has(ticker)) byTicker.set(ticker, []);
  byTicker.get(ticker).push(instrument);
}

console.error(
  `${universe.length} instruments listed, ${byTicker.size} ETP tickers among them`
);
console.error(`${queries.length} tickers to check`);

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  for (const instrument of byTicker.get(query) || []) {
    const ticker = (instrument.ticker || "").toUpperCase();
    const isin = (instrument.isin || "").toUpperCase();
    const name = (instrument.name || "").replace(/\s+/g, " ").trim();

    if (contradictsCsv(tickerCandidates, ticker, isin)) {
      console.error(`  ${ticker} is ${isin} here, not the fund the list files — skipped`);
      continue;
    }

    // Revolut quotes products it will not sell you (a US-domiciled ETF has no
    // KID for EU clients), and says so rather than hiding them.
    if (instrument.stateDetails && instrument.stateDetails.canBuy === false) {
      console.error(`  ${ticker}@${instrument.exchange}: ${instrument.state} — skipped`);
      continue;
    }

    const row = {
      ticker,
      name,
      exchange: instrument.exchange || null,
      mic: instrument.mic || null,
      currency: instrument.currency || null,
      type: (instrument.type || "").toUpperCase(),
      state: instrument.state || null,
    };

    const key = entryKey(query, row);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ...row,
      raw: [ticker, name, row.exchange, row.currency].filter(Boolean).join(" "),
      isin,
    });
  }

  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
