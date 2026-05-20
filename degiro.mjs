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

function parseDegiroRow(text) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;

  // Each row in the DeGiro product table renders as innerText like:
  //   "A V <NAME>[ H] <TICKER> | <ISIN> <EXCHANGE> <CURRENCY?> <PRICE> ..."
  // The leading "A V" comes from the Acheter/Vendre action buttons, and an
  // optional trailing "H" badge (hedged/hard-to-borrow indicator) may sit
  // between the name and the ticker column.
  const match = compact.match(
    /^A\s+V\s+(.+?)\s+([A-Z0-9.]{1,12})\s*\|\s*([A-Z]{2}[A-Z0-9]{10})\s+([A-Z]{2,4})\b(?:\s+(\S+))?/
  );
  if (!match) return null;

  let name = match[1].trim();
  // Strip the optional "H" hedged / hard-to-borrow badge that sits between
  // the name and the ticker column when present.
  name = name.replace(/\s+H$/, "").trim();

  const ticker = match[2].toUpperCase();
  const isin = match[3].toUpperCase();
  const exchange = match[4].toUpperCase();

  // The slot after the exchange code is the currency. Reject anything that
  // looks like a price/percentage/dash so we don't capture the price column
  // when the currency cell is empty.
  let currency = match[5] || null;
  if (currency && /^[-—.,\d%+]+$/.test(currency)) currency = null;

  return {
    name,
    ticker,
    exchange,
    currency,
    isin,
  };
}

async function ensureDegiroSearchInput(page) {
  const selectors = [
    'input[placeholder*="Search" i]',
    'input[placeholder*="Rechercher" i]',
    'input[placeholder*="Suchen" i]',
    'input[placeholder*="Zoeken" i]',
    'input[placeholder*="Cerca" i]',
    'input[type="search"]',
  ];

  let input = await page.$(selectors.join(", "));
  if (input) return input;

  await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const candidates = [...document.querySelectorAll("button, a, [role='button']")];
    const target = candidates.find((el) =>
      /search|rechercher|suchen|zoeken|cerca/i.test(
        norm(el.textContent || el.getAttribute("aria-label") || "")
      )
    );
    if (target) target.click();
  });
  await sleep(300);

  input = await page.waitForSelector(selectors.join(", "), { timeout: 8000 });
  return input;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => /degiro\./i.test(p.url())) || (await browser.newPage());

if (!/degiro\./i.test(page.url())) {
  // productType=131 narrows the products tab to Trackers (ETFs).
  await page.goto("https://trader.degiro.nl/trader/#/products?productType=131", {
    waitUntil: "domcontentloaded",
  });
}

await page.bringToFront();
const searchInput = await ensureDegiroSearchInput(page);

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to degiro-parsed.json.
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

async function scrapeRowsForQuery(query) {
  await searchInput.click({ clickCount: 3 });
  await searchInput.press("Backspace");
  await searchInput.type(query, { delay: 40 });

  const emptyStateRegex =
    /^(Aucun élément à afficher|No items to display|Geen items om weer te geven|Keine Einträge( vorhanden)?|Nessun elemento da visualizzare)$/i;

  const collectSnapshot = () =>
    page.evaluate(
      ({ q, emptyStatePattern }) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const upper = q.toUpperCase();

        // Locate the product table specifically by finding the header row
        // that contains "ISIN" or "TICKER". Other panels on the page (orders,
        // transactions) also use tables, and we don't want their empty-state
        // placeholders or rows to influence our results.
        const allTables = [...document.querySelectorAll("table")];
        const productTable = allTables.find((table) => {
          if (!(table instanceof HTMLElement) || table.offsetParent === null) return false;
          const headerText = norm(
            (table.querySelector("thead") || table).innerText || ""
          ).toUpperCase();
          return /ISIN|TICKER|PRODUIT|PRODUCT/.test(headerText);
        });

        // Only consider rows that contain the ISIN we just typed; this avoids
        // grabbing stale rows from the previous search while results refresh.
        const rowScope = productTable
          ? [...productTable.querySelectorAll("tbody tr")]
          : [...document.querySelectorAll("tr")];
        const rows = rowScope.filter((row) => {
          if (!(row instanceof HTMLElement) || row.offsetParent === null) return false;
          return norm(row.innerText).toUpperCase().includes(upper);
        });

        // DeGiro renders a localized empty-state placeholder inside the table
        // ("Aucun élément à afficher" in FR, "No items to display" in EN, etc.)
        // when the search returns no products. Only detect the placeholder
        // inside the product table so persistent labels elsewhere on the page
        // don't trigger a false positive.
        const re = new RegExp(emptyStatePattern, "i");
        const emptyStateScope = productTable
          ? [
              ...productTable.querySelectorAll(
                "tbody td, .p-datatable-emptymessage, .p-datatable-emptymessage td"
              ),
            ]
          : [];
        const emptyState = emptyStateScope.some((cell) => {
          if (!(cell instanceof HTMLElement) || cell.offsetParent === null) return false;
          return re.test(norm(cell.innerText));
        });

        return {
          rows: [...new Set(rows.map((row) => norm(row.innerText)).filter(Boolean))],
          emptyState,
          productTableFound: Boolean(productTable),
        };
      },
      { q: query, emptyStatePattern: emptyStateRegex.source }
    );

  // DeGiro streams results across multiple exchanges over a few hundred ms;
  // wait until the row count is stable for a couple consecutive polls. We
  // also bail early when the product table itself shows the empty-state
  // placeholder, but only after a minimum elapsed time and several
  // consecutive empty-state observations so we don't trip on the brief
  // flash of empty state while the previous results clear and the new
  // request is in flight.
  const maxWaitMs = 5000;
  const pollMs = 250;
  const stableNeeded = 3;
  const emptyStateNeeded = 4;
  const emptyStateMinElapsedMs = 1200;
  let elapsed = 0;
  let lastCount = -1;
  let stableHits = 0;
  let emptyStateHits = 0;
  let rowTexts = [];

  while (elapsed < maxWaitMs) {
    await sleep(pollMs);
    elapsed += pollMs;
    const snapshot = await collectSnapshot();
    rowTexts = snapshot.rows;

    if (rowTexts.length === 0 && snapshot.emptyState) {
      emptyStateHits += 1;
      if (emptyStateHits >= emptyStateNeeded && elapsed >= emptyStateMinElapsedMs) {
        return [];
      }
    } else {
      emptyStateHits = 0;
    }

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

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync("degiro-parsed.json")) {
  try {
    const existing = JSON.parse(fs.readFileSync("degiro-parsed.json", "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.exchange && entry?.ticker && entry?.isin) {
          seen.add(`${entry.exchange}:${entry.ticker}:${entry.isin}`.toUpperCase());
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
  const rowTexts = await scrapeRowsForQuery(query);
  for (const text of rowTexts) {
    const parsed = parseDegiroRow(text);
    if (!parsed) continue;
    if (parsed.isin !== query) continue;

    const key = `${parsed.exchange}:${parsed.ticker}:${parsed.isin}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      ...parsed,
    });
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.writeFileSync("degiro-parsed.json", JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
