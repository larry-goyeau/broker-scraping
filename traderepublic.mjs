import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toTickerOnly(value) {
  const text = (value || "").trim();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  if (!firstColumn) return "";

  const tickerWithSuffix = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;

  const baseTicker = (tickerWithSuffix || "").split(/[./]/)[0];
  return baseTicker.trim().toUpperCase();
}

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
      // Supports both: symbol,isin,name and symbol,exchange,isin,name.
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;

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

function parseFundRow(text, query) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (/couldn['’]t find anything that matches/i.test(compact)) return null;

  const isinMatch = compact.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/);
  if (!isinMatch) return null;

  const isin = isinMatch[1];
  const name = compact.slice(0, isinMatch.index).trim();

  return {
    query,
    ticker: null,
    isin,
    name,
    exchange: "null",
    raw: `${name} ${isin}`,
    found: true,
  };
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("traderepublic.com")) || (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to traderepublic-parsed.json.
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
const csvQueries = loadIsinsFromCsv("etfs.csv");
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const results = [];
const seen = new Set();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync("traderepublic-parsed.json")) {
  try {
    const existing = JSON.parse(fs.readFileSync("traderepublic-parsed.json", "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        const key = entry?.isin
          ? `ISIN:${entry.isin}`
          : entry?.raw
            ? `RAW:${entry.raw.toUpperCase()}`
            : null;
        if (key) seen.add(key);
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);
  const url = `https://app.traderepublic.com/browse/fund?q=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Trade Republic loads prices/currencies asynchronously; poll until they appear.
  const maxWaitMs = 5000;
  const pollMs = 250;
  let elapsed = 0;
  while (elapsed < maxWaitMs) {
    const hasCurrency = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("tbody tr")];
      return rows.some((row) => /[€$£]/.test(row.innerText || ""));
    });
    if (hasCurrency) break;

    const noResult = await page.evaluate(() =>
      /couldn['’]t find anything that matches/i.test(document.body.innerText || "")
    );
    if (noResult) break;

    await sleep(pollMs);
    elapsed += pollMs;
  }

  const rowTexts = await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

    return [...new Set(
      [...document.querySelectorAll("tbody tr")]
        .map((row) => norm(row.innerText))
        .filter((text) => !!text && !/^Security\s+/i.test(text))
    )];
  });

  for (const text of rowTexts) {
    const parsed = parseFundRow(text, query);
    if (!parsed) continue;

    const key = parsed.isin ? `ISIN:${parsed.isin}` : `RAW:${parsed.raw.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(parsed);
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.writeFileSync("traderepublic-parsed.json", JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
