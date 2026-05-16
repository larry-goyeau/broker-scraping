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
      // Supports both: ticker,isin,name and ticker,exchange,isin,name
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

function parseIbkrRow(text) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (/show more|couldn['’]t find|no results/i.test(compact)) return null;

  // Examples:
  // ACWI ISHARES MSCI ACWI ETF / NASDAQ Stock
  // ACWI AM MSCI ALL C WRLD-ETF E ACC SBF Stock
  const match = compact.match(
    /^([A-Z0-9.-]{1,20})\s+(.+?)\s+(Stock|ETF|Index|Fund|CFD|Option|Warrant)$/i
  );
  if (!match) return null;

  const ticker = match[1].toUpperCase();
  if (/^(LATEST|RECENT|POPULAR|TOP|ASK|NAVIGATE|OPEN|SEARCH)$/i.test(ticker)) return null;
  const body = match[2].trim();
  const securityType = match[3];

  let name = body;
  let exchange = null;
  const withSlash = body.lastIndexOf(" / ");
  if (withSlash >= 0) {
    name = body.slice(0, withSlash).trim();
    exchange = body.slice(withSlash + 3).trim();
  } else {
    // Most IBKR result rows render exchange as the final token (e.g. "LSEETF").
    const parts = body.split(/\s+/);
    if (parts.length < 2) return null;
    exchange = parts.pop();
    name = parts.join(" ").trim();
  }
  if (!name || !exchange) return null;

  return {
    ticker,
    name,
    exchange,
    type: securityType,
    raw: `${ticker} ${name} / ${exchange} ${securityType}`,
  };
}

async function ensureSearchInput(page) {
  let searchInput = await page.$(
    'input[placeholder*="Search for instruments" i], input.search-input, input[placeholder*="Search" i]'
  );
  if (searchInput) return searchInput;

  await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const candidates = [...document.querySelectorAll("button, a, div, span")];
    const target = candidates.find((el) => /search/i.test(norm(el.textContent)));
    if (target) target.click();
  });
  await sleep(300);

  searchInput = await page.waitForSelector(
    'input[placeholder*="Search for instruments" i], input.search-input, input[placeholder*="Search" i]',
    { timeout: 8000 }
  );
  return searchInput;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((p) => /interactivebrokers|ibkr/i.test(p.url())) || (await browser.newPage());

if (!/interactivebrokers|ibkr/i.test(page.url())) {
  await page.goto("https://www.interactivebrokers.ie/portal/", {
    waitUntil: "domcontentloaded",
  });
}

await page.bringToFront();
const searchInput = await ensureSearchInput(page);

const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = process.argv.slice(2).filter(Boolean).map(toIsin).filter(Boolean);
const csvQueries = loadIsinsFromCsv("etfs.csv");
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

async function scrapeRowsForQuery(query) {
  await searchInput.click({ clickCount: 3 });
  await searchInput.press("Backspace");
  await searchInput.type(query, { delay: 40 });

  const collectRows = () =>
    page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

      // Locate the "TOP RESULTS" section header and take the result table that
      // follows it. This avoids picking up rows from the "ASK IBKR" and
      // "HELP & SUPPORT" tables that share the same markup.
      const headers = [...document.querySelectorAll("*")].filter((el) => {
        if (el.children.length > 0) return false;
        return /^\s*top results\s*$/i.test(el.textContent || "");
      });

      let resultsTable = null;
      for (const header of headers) {
        const root = header.closest("section, div, form") || document.body;
        const t = root.querySelector(".p-datatable-table, table.p-datatable-table");
        if (t) {
          resultsTable = t;
          break;
        }
      }

      if (!resultsTable) {
        // Fallback: first p-datatable-table on the page.
        resultsTable = document.querySelector(
          ".p-datatable-table, table.p-datatable-table"
        );
      }
      if (!resultsTable) return [];

      const rows = [...resultsTable.querySelectorAll("tbody tr")];
      return [...new Set(rows.map((row) => norm(row.innerText)).filter(Boolean))];
    });

  // IBKR streams in additional TOP RESULTS rows after the first hit.
  // Wait until the row count is stable for a couple consecutive polls,
  // capped by maxWaitMs.
  const maxWaitMs = 4000;
  const pollMs = 250;
  const stableNeeded = 3;
  let elapsed = 0;
  let lastCount = -1;
  let stableHits = 0;
  let rowTexts = [];

  while (elapsed < maxWaitMs) {
    await sleep(pollMs);
    elapsed += pollMs;
    rowTexts = await collectRows();
    if (rowTexts.length === lastCount && rowTexts.length > 0) {
      stableHits += 1;
      if (stableHits >= stableNeeded) break;
    } else {
      stableHits = 0;
      lastCount = rowTexts.length;
    }
  }

  return rowTexts;
}

const results = [];
const seen = new Set();

for (const query of queries) {
  const rowTexts = await scrapeRowsForQuery(query);
  for (const text of rowTexts) {
    const parsed = parseIbkrRow(text);
    if (!parsed) continue;

    const key =
      parsed.exchange && parsed.ticker
        ? `${parsed.exchange}:${parsed.ticker}:${parsed.type}`.toUpperCase()
        : `RAW:${(parsed.raw || "").toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      ...parsed,
      query,
      isin: query,
    });
  }
}

fs.writeFileSync("interactivebrokers-parsed.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
