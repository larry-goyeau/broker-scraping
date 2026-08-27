import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => {
      // Supports both: ticker,isin,name and ticker,exchange,isin,name.
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;

      // Fallback: find the first ISIN-looking token in the row.
      for (const col of cols) {
        const isin = toIsin(col);
        if (isin) return isin;
      }
      return "";
    })
    .filter(Boolean);
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

// The page is only there to lend its signed-in session to the calls below.
const pages = await browser.pages();
const page =
  pages.find((candidate) => /lightyear\./i.test(candidate.url())) ||
  (await browser.newPage());

if (!/lightyear\./i.test(page.url())) {
  await page.goto("https://lightyear.com/", { waitUntil: "domcontentloaded" });
  await sleep(3000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/lightyear-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);
// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();
const csvQueries = loadIsinsFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = new URL("../parsed_json/lightyear-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

// One fund reaches several venues, and the same venue can carry it in more
// than one currency (LSE quotes iShares Core MSCI World in both USD and GBP).
const entryKey = (isin, row) =>
  `${isin}:${row.ticker}:${row.exchange}:${row.currency || ""}`.toUpperCase();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin && entry?.ticker) seen.add(entryKey(entry.isin, entry));
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

// The lookup behind the app's own search palette. It is reached through
// lightyear.com's proxy rather than api.lightyear.com directly: the proxy is
// same-origin, so it attaches the session the API otherwise rejects as
// unauthenticated. The parameter is `value`, not `query`.
async function searchIsin(isin) {
  const answer = await page.evaluate(async (term) => {
    try {
      const response = await fetch(
        `/proxy/v1/instrument/search?value=${encodeURIComponent(term)}`,
        { credentials: "include", headers: { Accept: "application/json" } }
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
  }, isin);

  // A signed-out session is refused rather than answered with an empty list.
  if (!answer.json || !Array.isArray(answer.json.results)) return null;

  return answer.json.results
    .filter((entry) => entry?.type === "INSTRUMENT" && entry.instrument)
    .map((entry) => entry.instrument)
    // The search also matches on name, so it can offer a fund we did not ask
    // about; every listing kept here states the ISIN that was searched for.
    .filter((instrument) => (instrument.isin || "").toUpperCase() === isin);
}

function save() {
  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.error(`${queries.length} ISINs to check`);

let silences = 0;

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const instruments = await searchIsin(query);
  if (instruments === null) {
    silences += 1;
    console.error("  no answer");
    if (silences >= 5) {
      throw new Error("Lightyear stopped answering. Is the session still signed in?");
    }
    continue;
  }
  silences = 0;

  for (const instrument of instruments) {
    const row = {
      name: (instrument.name || "").replace(/\s+/g, " ").trim(),
      ticker: (instrument.symbol || "").toUpperCase(),
      exchange: instrument.exchange || null,
      mic: instrument.mic || null,
      currency: instrument.currency || null,
      type: (instrument.issueType || "").toUpperCase() || "ETF",
      // "Acc" or "Dist": which share class of the fund this listing is.
      distributionPolicy: instrument.summary?.distributionPolicy || null,
      description: instrument.summary?.shortDescription || null,
    };
    if (!row.ticker) continue;

    const key = entryKey(query, row);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      isin: query,
      ...row,
      raw: [row.ticker, row.name, row.exchange, row.currency].filter(Boolean).join(" "),
    });
  }

  // Persist progress after every query so an interruption keeps prior work.
  save();
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
