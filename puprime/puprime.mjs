import puppeteer from "puppeteer-core";
import fs from "node:fs";
import zlib from "node:zlib";

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

// One ISIN is often listed on several venues under differently worded names
// ("SPDR Gold Shares" and "SPDR Gold Trust"), so every spelling is kept and the
// closest one decides a match.
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

// The board writes the fund the CFD tracks under its US ticker, quotes all of
// them in dollars and tags the venue on some ("SPDR Gold (ARCX:GLD)"), so the
// US share class carrying the ticker is the instrument being offered. Names
// only have to separate several US share classes, which is just as well: the
// board abbreviates them heavily ("Direxion:Gold M Id Bl 2X") and leaves a
// handful blank altogether.
function resolveIsin(tickerCandidates, ticker, scrapedName) {
  const candidates = (tickerCandidates.get(ticker) || []).filter((candidate) =>
    candidate.isin.startsWith("US")
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { isin: candidates[0].isin, name: candidates[0].names[0] };
  }

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(scrapedName, candidate),
  }));

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

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("myaccount.puprime.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to puprime-parsed.json.
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

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

const outputPath = new URL("puprime-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

// When resuming, load already-saved entries so earlier progress is preserved.
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

const TRADE_URL = "https://myaccount.puprime.com/web-trade/trade/SPY";
const SYMBOL_LIST_PATH = "/api/trade/symbol/getList";

// Calls to the trading API are signed per request, so rather than forge one,
// the answer is read off the call the platform makes for itself: it loads the
// whole tradable universe, every group at once, as the page comes up.
async function readProductGroups() {
  const client = await page.createCDPSession();
  await client.send("Network.enable");

  let body = null;
  const watched = new Set();

  client.on("Network.requestWillBeSent", (event) => {
    if (event.request.url.includes(SYMBOL_LIST_PATH)) watched.add(event.requestId);
  });

  client.on("Network.loadingFinished", async (event) => {
    if (!watched.has(event.requestId) || body) return;
    const fetched = await client
      .send("Network.getResponseBody", { requestId: event.requestId })
      .catch(() => null);
    if (fetched?.body) body = fetched.body;
  });

  await page.goto(TRADE_URL, { waitUntil: "domcontentloaded" });
  for (let waited = 0; waited < 90000; waited += 250) {
    if (body) break;
    await sleep(250);
  }
  await client.detach().catch(() => {});

  if (!body) {
    throw new Error(
      "The instrument list never came through. Is myaccount.puprime.com signed in on a trading account?"
    );
  }

  const answer = JSON.parse(body);
  // The list travels gzipped and base64'd, since it runs to about a megabyte.
  const payload =
    typeof answer.data === "string"
      ? JSON.parse(zlib.gunzipSync(Buffer.from(answer.data, "base64")).toString("utf8"))
      : answer.data;

  return payload?.productList || [];
}

const groups = await readProductGroups();
const etfGroup = groups.find((group) => /^etfs?$/i.test((group?.groupName || "").trim()));
if (!etfGroup) {
  const names = groups.map((group) => group?.groupName).join(", ");
  throw new Error(`No ETF group in the instrument list (found: ${names || "nothing"})`);
}

// Some names carry the venue the fund trades on ("SPDR Gold (ARCX:GLD)"), which
// belongs to the listing rather than to the fund's name.
const stripVenue = (value) => (value || "").replace(/\s*\([A-Z]+:[^)]+\)\s*$/, "").trim();

const instruments = etfGroup.symbolList
  .map((symbol) => ({
    ticker: (symbol?.baseSymbol || symbol?.symbol || "").toUpperCase(),
    name: stripVenue((symbol?.comment || "").replace(/\s+/g, " ")),
    comment: (symbol?.comment || "").replace(/\s+/g, " ").trim(),
    currency: (symbol?.priceCurrency || symbol?.currency || "").toUpperCase(),
  }))
  .filter((instrument) => instrument.ticker)
  .filter((instrument) => onlyTickers.size === 0 || onlyTickers.has(instrument.ticker));

console.error(`${instruments.length} ETFs offered`);

for (const [index, instrument] of instruments.entries()) {
  if (index + 1 < startIndex) continue;

  const label = `[${index + 1}/${instruments.length}] ${instrument.ticker}`;
  const candidate = resolveIsin(tickerCandidates, instrument.ticker, instrument.name);
  // No US share class under this ticker: not a fund the CSV is asking about.
  if (!candidate) {
    console.error(`${label}: no ISIN for "${instrument.name || "unnamed"}"`);
    continue;
  }

  if (seen.has(instrument.ticker)) continue;
  seen.add(instrument.ticker);

  results.push({
    query: instrument.ticker,
    ticker: instrument.ticker,
    // A handful of instruments reach the platform with no name at all, and the
    // fund the ISIN stands for is the one they are offering.
    name: instrument.name || candidate.name,
    currency: instrument.currency || null,
    type: "ETF",
    raw: [instrument.ticker, instrument.comment].filter(Boolean).join(" "),
    isin: candidate.isin,
  });
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
