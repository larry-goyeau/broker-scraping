import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").split(/[./-]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadTickersFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => normalizeTicker(line))
    .filter(Boolean);
}

function loadTickerToIsinFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const content = fs.readFileSync(csvPath, "utf8");
  const map = new Map();

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const cols = line.split(",");
    const ticker = normalizeTicker(cols[0]);
    if (!ticker) continue;

    // Supports both: symbol,isin,name and symbol,exchange,isin,name.
    const isin = toIsin(cols[2]) || toIsin(cols[1]) || cols.map(toIsin).find(Boolean) || "";
    if (!isin) continue;

    if (!map.has(ticker)) map.set(ticker, isin);
  }

  return map;
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

function parseOandaRow(text) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;

  // Oanda MT5 list rows render as: "IUSQ.ETF ISHARES MSCI ACWI"
  const match = compact.match(/^([A-Z0-9.-]{2,20})\.ETF\s+(.+)$/i);
  if (!match) return null;

  const ticker = match[1].toUpperCase();
  const name = match[2].trim();
  if (!ticker || !name) return null;

  return {
    ticker,
    name,
    type: "ETF",
    raw: compact,
  };
}

async function clearSearchInput(page, input) {
  await input.focus();

  // Triple-click + Backspace works on macOS but is flaky on Windows.
  await input.click({ clickCount: 3 });
  await input.press("Backspace");

  let remaining = (await input.evaluate((el) => el.value || "")).length;
  if (remaining === 0) return;

  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modifier);
  await page.keyboard.press("KeyA");
  await page.keyboard.up(modifier);
  await page.keyboard.press("Backspace");

  remaining = (await input.evaluate((el) => el.value || "")).length;
  for (let i = 0; i < remaining; i++) {
    await page.keyboard.press("Backspace");
  }
}

function fingerprintRows(rows) {
  return rows.slice().sort().join("|");
}

async function findOandaFrame(page) {
  // Oanda platform hosts the MT5 terminal inside an iframe.
  for (let i = 0; i < 20; i++) {
    const frame = page.frames().find((f) => /mt5web\.tms\.pl/i.test(f.url()));
    if (frame) return frame;
    await sleep(250);
  }
  return null;
}

async function ensureSearchInput(frame) {
  const selectors = [
    'input[placeholder*="Search symbol" i]',
    'input[placeholder*="Search" i]',
    'input[type="search"]',
    'input[type="text"]',
  ];

  for (const selector of selectors) {
    const input = await frame.$(selector);
    if (input) return input;
  }

  return frame.waitForSelector(selectors.join(", "), { timeout: 10000 });
}

async function scrapeRowsForQuery(page, frame, searchInput, query) {
  const collectSnapshot = () =>
    frame.evaluate((q) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const queryUpper = (q || "").toUpperCase();
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      const buttons = [...document.querySelectorAll("button.item, button[class*='item']")].filter(
        (el) => el instanceof HTMLElement && isVisible(el)
      );

      const rows = buttons
        .map((btn) => {
          const symbolText = norm(
            btn.querySelector("span.symbol, [class*='symbol']")?.textContent || ""
          ).toUpperCase();
          const descText = norm(
            btn.querySelector("span.description, [class*='description']")?.textContent || ""
          );
          const fallbackText = norm(btn.innerText);
          const rowText = symbolText && descText ? `${symbolText} ${descText}` : fallbackText;
          return {
            symbol: symbolText,
            description: descText,
            rowText,
          };
        })
        .filter((row) => {
          if (!row.symbol || !/\.ETF$/i.test(row.symbol)) return false;
          const haystack = `${row.symbol} ${row.description} ${row.rowText}`.toUpperCase();
          // Query is ticker-based; a hit can be in symbol (e.g. IUSQ) or
          // description (e.g. ACWI) depending on the instrument.
          return haystack.includes(queryUpper);
        })
        .map((row) => row.rowText);

      const uniqueRows = [...new Set(rows)];
      const bodyText = norm(document.body?.innerText || "");
      const emptyState =
        /ETFs?\s+0\/\d+/i.test(bodyText) ||
        /No symbols found|Nothing found|Aucun résultat|Keine Ergebnisse/i.test(bodyText);

      return {
        rows: uniqueRows,
        emptyState,
      };
    }, query);

  const beforeSnapshot = await collectSnapshot();
  const beforeFingerprint = fingerprintRows(beforeSnapshot.rows);

  await clearSearchInput(page, searchInput);
  await searchInput.type(query, { delay: 40 });

  const maxWaitMs = 5000;
  const pollMs = 250;
  const stableNeeded = 3;
  const staleWindowMs = 600;
  const emptyStateNeeded = 4;
  const emptyStateMinElapsedMs = 1200;

  let elapsed = 0;
  let lastFingerprint = null;
  let stableHits = 0;
  let emptyStateHits = 0;
  let rowTexts = [];

  while (elapsed < maxWaitMs) {
    await sleep(pollMs);
    elapsed += pollMs;
    const snapshot = await collectSnapshot();
    rowTexts = snapshot.rows;
    const currentFingerprint = fingerprintRows(rowTexts);

    if (
      elapsed < staleWindowMs &&
      rowTexts.length > 0 &&
      currentFingerprint === beforeFingerprint
    ) {
      stableHits = 0;
      lastFingerprint = currentFingerprint;
      continue;
    }

    if (rowTexts.length === 0 && snapshot.emptyState) {
      emptyStateHits += 1;
      if (emptyStateHits >= emptyStateNeeded && elapsed >= emptyStateMinElapsedMs) {
        return [];
      }
    } else {
      emptyStateHits = 0;
    }

    if (rowTexts.length > 0 && currentFingerprint === lastFingerprint) {
      stableHits += 1;
      if (stableHits >= stableNeeded) break;
    } else {
      stableHits = 0;
      lastFingerprint = currentFingerprint;
    }
  }

  return rowTexts;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => /oanda\.com/i.test(p.url())) || (await browser.newPage());
if (!/oanda\.com/i.test(page.url())) {
  await page.goto("https://www.oanda.com/eu-en/platform", { waitUntil: "domcontentloaded" });
}

await page.bringToFront();
const frame = await findOandaFrame(page);
if (!frame) {
  throw new Error("Could not locate Oanda MT5 iframe.");
}
const searchInput = await ensureSearchInput(frame);

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to oanda-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["ACWI", "IWRD", "VWRL"];
const cliQueries = positionalArgs.map(normalizeTicker).filter(Boolean);
// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();
const csvQueries = loadTickersFromCsv(csvPath);
const tickerToIsin = loadTickerToIsinFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0 ? cliQueries : csvQueries.length > 0 ? csvQueries : defaultQueries;
const queries = uniqueQueries(rawQueries);

const results = [];
const seen = new Set();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync(new URL("oanda-parsed.json", import.meta.url))) {
  try {
    const existing = JSON.parse(fs.readFileSync(new URL("oanda-parsed.json", import.meta.url), "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) {
          seen.add(`${entry.query}:${entry.ticker}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);
  const queryTicker = normalizeTicker(query) || query.toUpperCase();
  const rowTexts = await scrapeRowsForQuery(page, frame, searchInput, query);
  for (const text of rowTexts) {
    const parsed = parseOandaRow(text);
    if (!parsed) continue;
    if (parsed.ticker !== queryTicker) continue;

    const isin = tickerToIsin.get(queryTicker) || tickerToIsin.get(parsed.ticker) || null;
    const result = {
      query: queryTicker,
      ticker: parsed.ticker,
      name: parsed.name,
      type: parsed.type,
      isin,
      raw: parsed.raw,
    };

    const key = `${result.query}:${result.ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(result);
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.writeFileSync(new URL("oanda-parsed.json", import.meta.url), JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
