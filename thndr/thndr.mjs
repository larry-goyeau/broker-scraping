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
  return (afterExchange || "").split(/[/]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
function loadTickerCandidatesFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
    } else {
      candidates.push({ isin, names: [name] });
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated funds, so counting them would
// let a same-ticker instrument pass for the one being looked up.
const GENERIC_TOKENS = new Set([
  "LTD",
  "LIMITED",
  "PLC",
  "INC",
  "CORP",
  "CORPORATION",
  "LLC",
  "GMBH",
  "THE",
  "CO",
]);

function nameTokens(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

// Fund names are shortened inconsistently between sources ("Small Cap" against
// "Small-Ca"), so tokens are compared by prefix rather than equality.
function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return 0;

  const used = new Set();
  let matched = 0;
  for (const token of scraped) {
    const index = candidate.findIndex(
      (other, position) => !used.has(position) && tokensMatch(token, other)
    );
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }

  // Dividing by the longer name keeps a terser wording from outscoring the fund
  // actually named just by leaving words out.
  return matched / Math.max(scraped.length, candidate.length);
}

// Picks the wording of a candidate that reads closest to what was scraped.
function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// Thndr routes its US listings through Alpaca and, for an account that has not
// been cleared for US trading, hands back neither the real ISIN nor the venue
// (both come through masked). So the fund on offer under a ticker is settled
// against the CSV by that ticker alone, US share classes only, with the name
// deciding when a ticker has carried more than one over time.
function resolveIsin(tickerCandidates, asset) {
  const usCandidates = (tickerCandidates.get(asset.ticker) || []).filter((candidate) =>
    candidate.isin.startsWith("US")
  );
  if (usCandidates.length === 0) return null;

  const scored = usCandidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(asset.name, candidate),
  }));

  // A US ticker is unique to one listing, so a lone US fund under a ticker Thndr
  // quotes is that fund, whatever either side calls it.
  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const shortlist = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return shortlist.length === 1 ? shortlist[0] : null;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const INVEST_URL = "https://web.thndr.app/invest";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("web.thndr.app")) ||
  (await browser.newPage());
if (!page.url().includes("web.thndr.app")) {
  await page.goto(INVEST_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to thndr-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

// `--max-pages=N` caps how much of the catalogue is walked, for quick tests.
const maxPages = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--max-pages=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return Infinity;
})();

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

const outputPath = new URL("thndr-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entry.ticker.toUpperCase());
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const ASSETS_BASE = "https://prod.thndr.app/assets-service";

// The app signs its calls with a bearer that lasts a few hours, so it is read
// off the app's own traffic rather than minted here.
let token = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("thndr.app")) return;
  const sent = event.request.headers || {};
  const authorization = sent.Authorization || sent.authorization;
  if (authorization && authorization.startsWith("Bearer")) token = authorization;
});

// Nothing is signed until the app has something to ask, so the search box is
// given a symbol to look up.
async function captureToken() {
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    const input = await page
      .waitForSelector('input[type="search"], input[placeholder*="ymbol" i], input[placeholder*="earch" i], input', { timeout: 20000 })
      .catch(() => null);

    if (input) {
      await input.click({ clickCount: 3 }).catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await input.type("SPY", { delay: 90 }).catch(() => {});
    }

    for (let waited = 0; waited < 20000 && !token; waited += 250) await sleep(250);
    if (token) return true;

    await page.goto(INVEST_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(4000);
  }
  return Boolean(token);
}

if (!(await captureToken())) {
  throw new Error("Could not read Thndr's API token. Is web.thndr.app/invest signed in?");
}

// One page of the US catalogue, replayed from the page so the app's own session
// carries it past the WAF and CORS.
async function fetchPage(pageNumber) {
  return page.evaluate(
    async (base, authorization, pageNo) => {
      try {
        const response = await fetch(
          `${base}/assets?market=us&page=${pageNo}`,
          { headers: { Authorization: authorization, Accept: "application/json" } }
        );
        if (!response.ok) return { status: response.status };
        const payload = await response.json();
        const rows = Array.isArray(payload?.results) ? payload.results : [];
        return {
          status: 200,
          count: payload?.count ?? null,
          assets: rows.map((row) => ({
            symbol: (row?.symbol || "").toUpperCase(),
            name: (row?.name || "").replace(/\s+/g, " ").trim(),
            visible: row?.is_visible !== false,
            delisting: Boolean(row?.delisting_date) || row?.is_marked_for_delisting === true,
          })),
        };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    ASSETS_BASE,
    token,
    pageNumber
  );
}

// A page fetch can come back on a turned-over token or a rate-limit blip, so it
// is retried after letting the app renew what it signs with.
async function fetchPageResilient(pageNumber) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const answer = await fetchPage(pageNumber);
    if (answer?.status === 200) return answer;

    if (answer?.status === 401) {
      const stale = token;
      for (let waited = 0; waited < 15000 && token === stale; waited += 250) await sleep(250);
      if (token === stale) await captureToken();
    } else {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

// Thndr paginates the catalogue in fixed tens, so the first page settles both
// the total and the stride, then the rest are pulled a handful at a time.
async function loadAssets() {
  const firstPage = await fetchPageResilient(1);
  if (!firstPage) throw new Error("Thndr never returned its instrument list.");

  const total = firstPage.count || firstPage.assets.length;
  const pageSize = firstPage.assets.length || 10;
  const lastPage = Math.min(Math.ceil(total / pageSize), maxPages);

  const assets = [...firstPage.assets];
  const CONCURRENCY = 10;

  let next = 2;
  async function worker() {
    while (true) {
      const pageNumber = next;
      next += 1;
      if (pageNumber > lastPage) return;

      const answer = await fetchPageResilient(pageNumber);
      if (answer?.assets) assets.push(...answer.assets);
      if (pageNumber % 100 === 0) console.error(`  page ${pageNumber}/${lastPage}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return assets;
}

const assets = await loadAssets();
console.error(`${assets.length} US instruments listed`);

// Every US line comes back classed as a stock, so the ETFs are the ones whose
// ticker the CSV knows as a fund; the rest fall away on their own.
const offered = [];
const dedupe = new Set();
for (const asset of assets) {
  if (!asset.symbol || asset.delisting || !asset.visible) continue;
  if (onlyTickers.size > 0 && !onlyTickers.has(asset.symbol)) continue;
  if (dedupe.has(asset.symbol)) continue;
  dedupe.add(asset.symbol);
  offered.push(asset);
}

console.error(`${offered.length} tradable and visible, matching them to the CSV`);

for (const [index, asset] of offered.entries()) {
  if (index + 1 < startIndex) continue;
  if (seen.has(asset.symbol)) continue;

  const candidate = resolveIsin(tickerCandidates, { ticker: asset.symbol, name: asset.name });
  if (!candidate) continue;
  seen.add(asset.symbol);

  results.push({
    query: asset.symbol,
    ticker: asset.symbol,
    name: asset.name || candidate.name,
    // The catalogue is fetched with market=us, so every line quotes in dollars.
    currency: "USD",
    type: "ETF",
    raw: [asset.symbol, asset.name].filter(Boolean).join(" "),
    isin: candidate.isin,
  });
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(`${results.length} funds matched`);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
