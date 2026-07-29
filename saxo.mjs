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

function parseSaxoRow(text) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;

  // Strip a leading type badge (e.g. "ETF ", "Stock ") which Saxo renders as
  // a small pill to the left of the row.
  const stripped = compact.replace(
    /^(ETF|Stock|Fund|Bond|Index|Crypto|Warrant|Option|Future|CFD)\s+/i,
    ""
  );

  // Row shape: "<name> <ticker>:<mic> <type>" where <mic> is a 4-letter MIC
  // code (xetr, xswx, xmil, xlon, xpar, xams, …).
  const match = stripped.match(
    /^(.+?)\s+([A-Z0-9.]{1,12}):([a-z]{4})\s+(ETF|Stock|Fund|Bond|Index|Crypto|Warrant|Option|Future|CFD)\b/i
  );
  if (!match) return null;

  return {
    name: match[1].trim(),
    ticker: match[2].toUpperCase(),
    exchange: match[3].toLowerCase(),
    type: match[4].toUpperCase(),
  };
}

async function clearSearchInput(page, input) {
  await input.focus();

  // Triple-click + Backspace works on macOS but is flaky on Windows: the
  // selection sometimes doesn't take, so Backspace only deletes one char and
  // the next query gets concatenated onto the previous one.
  await input.click({ clickCount: 3 });
  await input.press("Backspace");

  let remaining = (await input.evaluate((el) => el.value || "")).length;
  if (remaining === 0) return;

  // Fallback: explicit keyboard select-all then delete. Use the platform's
  // modifier key (Cmd on macOS, Ctrl elsewhere).
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modifier);
  await page.keyboard.press("KeyA");
  await page.keyboard.up(modifier);
  await page.keyboard.press("Backspace");

  // Last resort: send a Backspace for each remaining character.
  remaining = (await input.evaluate((el) => el.value || "")).length;
  for (let i = 0; i < remaining; i++) {
    await page.keyboard.press("Backspace");
  }
}

async function ensureSaxoSearchInput(page) {
  const selectors = [
    'input[placeholder*="Rechercher" i]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="Suchen" i]',
    'input[placeholder*="Cerca" i]',
    'input[type="search"]',
  ];

  let input = await page.$(selectors.join(", "));
  if (input) return input;

  // The search input may be hidden behind a magnifier-icon button until
  // clicked. Try to open the search panel first, then re-query.
  await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const candidates = [...document.querySelectorAll("button, a, [role='button']")];
    const target = candidates.find((el) =>
      /search|rechercher|suchen|cerca/i.test(
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
const page =
  pages.find((p) => /saxoinvestor|saxotrader|saxobank|saxo\./i.test(p.url())) ||
  (await browser.newPage());

if (!/saxoinvestor|saxotrader|saxobank|saxo\./i.test(page.url())) {
  await page.goto("https://www.saxoinvestor.fr/investor/page/portfolio", {
    waitUntil: "domcontentloaded",
  });
}

await page.bringToFront();
const searchInput = await ensureSaxoSearchInput(page);

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/saxo-parsed.json.
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
  return "etfs.csv";
})();
const csvQueries = loadIsinsFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

function fingerprintRows(rows) {
  return rows.slice().sort().join("|");
}

async function scrapeRowsForQuery(query) {
  const collectSnapshot = () =>
    page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

      // Result rows render as small visible elements whose innerText is
      // "<name> <ticker>:<mic> <type>". We pick those out by:
      //   - requiring exactly one <ticker>:<mic> token in the text (so we
      //     don't grab a parent container that wraps several rows),
      //   - requiring an asset-type word (ETF, Stock, ...),
      //   - bounding length to avoid the whole dropdown container.
      const tickerMicRegex = /\b[A-Z0-9.]{1,12}:x[a-z]{3}\b/g;
      const typeRegex = /\b(ETF|Stock|Fund|Bond|Index|Crypto|Warrant|Option|Future|CFD)\b/i;

      const candidates = [...document.querySelectorAll("*")].filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null
      );

      // Chrome around the search dropdown that should never appear in a row.
      // If a candidate's innerText contains any of these, it's the parent
      // container of the dropdown -- not an individual result row.
      const chromeRegex =
        /Résultats de la recherche|Search results|Suchergebnisse|Risultati della ricerca|Ordre de tri|Sort (?:by|order)|Sortieren nach|Ordina per|Explorer dans le sélecteur|Browse in (?:the )?selector|Im Auswahlfilter|Esplora nel selettore|\bFermer\b|\bClose\b|\bSchließen\b|\bChiudi\b/i;

      const rowTexts = candidates
        .map((el) => norm(el.innerText))
        .filter((text) => {
          if (!text || text.length < 8 || text.length > 240) return false;
          if (chromeRegex.test(text)) return false;
          const matches = text.match(tickerMicRegex) || [];
          if (matches.length !== 1) return false;
          if (!typeRegex.test(text)) return false;
          return true;
        });

      // Saxo shows a localized "no results" message inside the dropdown when
      // the search returns nothing. Covers both the "Aucun résultat" /
      // "No results" generic variant and the search-dropdown-specific
      // "Aucun instrument trouvé!" / "No instruments found" message.
      const bodyText = norm(document.body?.innerText || "");
      const emptyState =
        /Aucun (?:résultat|instrument trouvé)|No (?:results|instruments? found)|Keine (?:Ergebnisse|Instrumente gefunden)|Nessun(?:o)? (?:risultato|strumento trovato)/i.test(
          bodyText
        );

      return {
        rows: [...new Set(rowTexts)],
        emptyState,
      };
    });

  // Fingerprint the dropdown contents BEFORE typing so we can tell whether
  // a given poll is still showing stale results from the previous query.
  const beforeSnapshot = await collectSnapshot();
  const beforeFingerprint = fingerprintRows(beforeSnapshot.rows);

  await clearSearchInput(page, searchInput);
  await searchInput.type(query, { delay: 40 });

  // Poll until the row set is stable for a couple consecutive snapshots.
  // The fingerprint match against `beforeFingerprint` is only treated as
  // stale during the first `staleWindowMs` -- after that, Saxo has had time
  // to fire the search, so a matching fingerprint means the new query
  // simply returns the same set as the previous one (e.g. when the same
  // ISIN is searched twice in a row) and should be accepted.
  const maxWaitMs = 5000;
  const pollMs = 250;
  const stableNeeded = 3;
  const emptyStateNeeded = 4;
  const emptyStateMinElapsedMs = 1200;
  const staleWindowMs = 600;
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

    // Within the first ~600 ms a matching fingerprint almost certainly
    // means Saxo hasn't refreshed yet; skip those snapshots.
    if (
      elapsed < staleWindowMs &&
      currentFingerprint === beforeFingerprint &&
      rowTexts.length > 0
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

    if (currentFingerprint === lastFingerprint && rowTexts.length > 0) {
      stableHits += 1;
      if (stableHits >= stableNeeded) break;
    } else {
      stableHits = 0;
      lastFingerprint = currentFingerprint;
    }
  }

  return rowTexts;
}

const results = [];
const seen = new Set();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync("parsed_json/saxo-parsed.json")) {
  try {
    const existing = JSON.parse(fs.readFileSync("parsed_json/saxo-parsed.json", "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.exchange && entry?.ticker && entry?.type) {
          seen.add(`${entry.exchange}:${entry.ticker}:${entry.type}`.toUpperCase());
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
    const parsed = parseSaxoRow(text);
    if (!parsed) continue;

    const key = `${parsed.exchange}:${parsed.ticker}:${parsed.type}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      isin: query,
      ...parsed,
    });
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync("parsed_json/saxo-parsed.json", JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
