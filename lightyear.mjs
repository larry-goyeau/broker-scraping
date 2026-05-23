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

function parseLightyearRow(text) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;

  // Lightyear rows render as innerText like:
  //   "<name> <currency?><ticker> · <type> · <description?>"
  //   "<name> <currency?><ticker> · <type>"            (no description)
  // where the middle dot (·, U+00B7) separates the share-class type
  // ("Acc" / "Dist" / "Inc") from the asset description, and <currency> is
  // an optional symbol prefix (€, $, £, ¥) glued to the ticker.
  const parts = compact.split(/\s+·\s+/);
  if (parts.length < 2) return null;

  const head = parts[0];
  const type = parts[1].trim();
  const description = parts.length >= 3 ? parts.slice(2).join(" · ").trim() : null;

  // Reject parent containers that wrap multiple rows: the type slot is a
  // short share-class token, and neither slot should contain another
  // currency-prefixed ticker (which would mean we've grabbed text spanning
  // more than one row).
  if (type.length > 20 || /[€$£¥][A-Z0-9.]{1,12}/.test(type)) return null;
  if (description && /[€$£¥][A-Z0-9.]{1,12}/.test(description)) return null;

  const headMatch = head.match(/^(.+?)\s+([€$£¥]?)([A-Z0-9.]{1,12})$/);
  if (!headMatch) return null;

  return {
    name: headMatch[1].trim(),
    ticker: headMatch[3].toUpperCase(),
    currency: headMatch[2] || null,
    type,
    description,
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

async function ensureLightyearSearchInput(page) {
  const selectors = [
    'input[placeholder*="Search" i]',
    'input[type="search"]',
    '[role="dialog"] input',
    '[role="combobox"] input',
  ];

  let input = await page.$(selectors.join(", "));
  if (input) return input;

  // Lightyear opens its command-palette search via Cmd+K (macOS) / Ctrl+K.
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modifier);
  await page.keyboard.press("KeyK");
  await page.keyboard.up(modifier);
  await sleep(400);

  input = await page.$(selectors.join(", "));
  if (input) return input;

  // Fallback: click a visible search-icon button.
  await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const candidates = [...document.querySelectorAll("button, a, [role='button']")];
    const target = candidates.find((el) =>
      /search/i.test(norm(el.textContent || el.getAttribute("aria-label") || ""))
    );
    if (target) target.click();
  });
  await sleep(400);

  input = await page.waitForSelector(selectors.join(", "), { timeout: 8000 });
  return input;
}

function fingerprintRows(rows) {
  return rows.slice().sort().join("|");
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => /lightyear\./i.test(p.url())) || (await browser.newPage());

if (!/lightyear\./i.test(page.url())) {
  await page.goto("https://lightyear.com/", { waitUntil: "domcontentloaded" });
}

await page.bringToFront();
const searchInput = await ensureLightyearSearchInput(page);

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to lightyear-parsed.json.
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
  const collectSnapshot = () =>
    page.evaluate((searchInputEl) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

      // Scope the search to the modal so we don't pick up text from the
      // dashboard behind it (e.g. an "Apple $AAPL · Digital Hardware"
      // holding card that happens to match the row signature).
      let modalRoot = searchInputEl?.closest(
        '[role="dialog"], [role="listbox"], dialog, [aria-modal="true"]'
      );
      if (!modalRoot && searchInputEl) {
        // Fallback: walk up to the nearest positioned ancestor (popover).
        let node = searchInputEl.parentElement;
        for (let i = 0; i < 12 && node; i++) {
          const style = getComputedStyle(node);
          if (style.position === "fixed" || style.position === "absolute") {
            modalRoot = node;
            break;
          }
          node = node.parentElement;
        }
      }

      // Result rows have innerText shaped as:
      //   "<name> <currency?><ticker> · <description?> · <type>"
      // The middle-dot separator (·, U+00B7) plus a short trailing share-
      // class token gives us a tight signature to filter on while rejecting
      // parent containers that wrap multiple rows.
      const root = modalRoot || document;
      const candidates = [...root.querySelectorAll("*")].filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null
      );

      const rowTexts = candidates
        .map((el) => norm(el.innerText))
        .filter((text) => {
          if (!text || text.length < 10 || text.length > 280) return false;
          const dotCount = (text.match(/\s·\s/g) || []).length;
          // A row has 1 separator (ticker · type) or 2 (ticker · desc ·
          // type). Tolerate 3 in case the description has an embedded dot.
          if (dotCount < 1 || dotCount > 3) return false;
          // Must end with a short alphanumeric share-class token.
          if (!/\s+[A-Za-z]{2,8}$/.test(text)) return false;
          // Must contain a <currency?><ticker> token before the first dot.
          if (!/[€$£¥]?[A-Z0-9.]{2,12}\s+·/.test(text)) return false;
          // Reject parent containers wrapping multiple rows: a single row
          // has at most one currency-prefixed ticker token.
          const currencyTickers = text.match(/[€$£¥][A-Z0-9.]{1,12}/g) || [];
          if (currencyTickers.length > 1) return false;
          return true;
        });

      // Lightyear's modal shows an empty-state message when the search
      // returns nothing -- e.g. "Can't find what you're looking for?". The
      // apostrophe may render as ASCII ' or the curly ’ (U+2019). Scope to
      // the modal's text so the dashboard underneath doesn't mask it.
      const scopeText = norm(
        (modalRoot && modalRoot.innerText) || document.body?.innerText || ""
      );
      const emptyState =
        /Can[’']t find what you[’']re looking for|Couldn[’']t find anything|Try searching for something else|No (?:results|matches)|Nothing found|Aucun résultat|Keine Ergebnisse|Nessun risultato/i.test(
          scopeText
        );

      return {
        rows: [...new Set(rowTexts)],
        emptyState,
      };
    }, searchInput);

  // Fingerprint the dropdown contents BEFORE typing so we can tell whether
  // a given poll is still showing stale results from the previous query.
  const beforeSnapshot = await collectSnapshot();
  const beforeFingerprint = fingerprintRows(beforeSnapshot.rows);

  await clearSearchInput(page, searchInput);
  await searchInput.type(query, { delay: 40 });

  // Poll until the row set is stable for a couple consecutive snapshots.
  // Within `staleWindowMs` of typing, a matching fingerprint is treated as
  // stale -- past that point Lightyear has definitely had time to fire the
  // search, so a matching fingerprint is legitimate (e.g. when the same
  // ISIN is searched twice in a row).
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
if (startIndex > 1 && fs.existsSync("lightyear-parsed.json")) {
  try {
    const existing = JSON.parse(fs.readFileSync("lightyear-parsed.json", "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin && entry?.ticker) {
          seen.add(`${entry.isin}:${entry.ticker}:${entry.currency || ""}`.toUpperCase());
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
    const parsed = parseLightyearRow(text);
    if (!parsed) continue;

    const key = `${query}:${parsed.ticker}:${parsed.currency || ""}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query,
      isin: query,
      ...parsed,
    });
  }

  // Persist progress after every query so an interruption keeps prior work.
  fs.writeFileSync("lightyear-parsed.json", JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
