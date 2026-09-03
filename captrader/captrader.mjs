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

function loadTickersFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  return fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => !/^ticker\s*,/i.test(line))
    .map((line) => normalizeTicker(line))
    .filter(Boolean);
}

// Funds and shares are both plain stock contracts on IBKR, which never says
// which of the two it is quoting. The catalogue a ticker was read from is the
// only thing that knows, so the kind is carried alongside the candidate and
// the winning candidate is what types the row.
function loadTickerCandidatesFromCsv(csvPath, kind, map = new Map()) {
  if (!fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const candidate = {
      isin: toIsin(columns[isinIndex]),
      name: columns.slice(isinIndex + 1).join(",").trim(),
      kind,
    };
    const candidates = map.get(ticker) || [];
    if (!candidates.some((existing) => existing.isin === candidate.isin)) {
      candidates.push(candidate);
      map.set(ticker, candidates);
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated companies, so counting them
// would let "Gold Finder Resources Ltd" pass for "New Gold Issuer Ltd."
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

// IBKR abbreviates fund names to fit a fixed width ("ISH S&P500 UT SEC UCIT
// ETF"), so tokens are compared by prefix rather than equality.
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

  return matched / Math.min(scraped.length, candidate.length);
}

// A ticker on IBKR can belong to several unrelated instruments (GLD is both
// SPDR Gold Shares and Gold Finder Resources), so a listing only earns the
// CSV's ISIN when its name genuinely matches.
const MIN_NAME_SCORE = 0.5;

function resolveListing(tickerCandidates, ticker, scrapedName) {
  const candidates = tickerCandidates.get(ticker) || [];

  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = nameScore(scrapedName, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= MIN_NAME_SCORE ? best : null;
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

// Captrader introduces the account onto IBKR's Client Portal, served from
// clientam.com just like MEXEM and WH SelfInvest, so the same portal bridge is
// used. The page is only there to lend its session to the calls.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("clientam.com")) ||
  (await browser.newPage());
await page.bringToFront();

if (!page.url().includes("clientam.com")) {
  await page.goto("https://www.clientam.com/portal/", {
    waitUntil: "domcontentloaded",
  });
  await sleep(5000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to captrader-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["GLD", "EWY", "IUUS"];
const cliQueries = positionalArgs.map(normalizeTicker).filter(Boolean);

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return new URL(fallback, import.meta.url);
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// `--csv=PATH` overrides the fund list (defaults to etfs.csv) and
// `--stocks-csv=PATH` the share list (defaults to stocks.csv). CapTrader
// introduces the account onto IBKR, so it sells the whole IBKR book: the funds
// and the shares are the same kind of contract behind the same search.
// `--etfs-only` and `--stocks-only` answer for one shelf alone, which is what
// makes a walk of a catalogue this size resumable in parts.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");

const tickerCandidates = new Map();
if (!stocksOnly) loadTickerCandidatesFromCsv(csvPath, "ETF", tickerCandidates);
if (!etfsOnly) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);

const csvQueries = [
  ...(stocksOnly ? [] : loadTickersFromCsv(csvPath)),
  ...(etfsOnly ? [] : loadTickersFromCsv(stocksCsvPath)),
];
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = new URL("captrader-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

const entryKey = (query, row) =>
  `${query}:${row.ticker}:${row.exchange}:${row.name}`.toUpperCase();

// A walk this long is run in stretches, and a stretch that began by emptying
// the file would throw away every stretch before it. What is already listed is
// read back and kept, and the dedup set below is what stops it being listed
// twice; `--fresh` is how a run says it means to start the file over.
if (!hasFlag("fresh") && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entryKey(entry.query, entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const API = "/portal.proxy/v1/portal";

function callInPage(path, options) {
  return page.evaluate(
    async (base, p, opts) => {
      try {
        const response = await fetch(`${base}/${p}`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: opts.method || "GET",
          body: opts.body || undefined,
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
    },
    API,
    path,
    options
  );
}

// The portal reloads itself every so often, and a reload destroys the context
// the call was made from. A walk of a catalogue this size would otherwise end
// on the first one, tens of thousands of tickers short, so the call is simply
// made again against the new document.
async function api(path, options = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await callInPage(path, options);
    } catch (error) {
      if (attempt >= 4) return { error: String(error) };

      await sleep(1000);
      // A reload that lands somewhere other than the portal takes the session
      // with it, so the portal is asked for again before retrying.
      if (!page.url().includes("clientam.com")) {
        await page
          .goto("https://www.clientam.com/portal/", { waitUntil: "domcontentloaded" })
          .catch(() => {});
        await sleep(5000);
      }
    }
  }
}

// Keeps the Client Portal bridge awake; without it, later calls start failing.
async function tickle() {
  await api("tickle").catch(() => null);
}

// The search the portal runs when a query is submitted rather than merely
// typed: `pattern: false` asks for the symbol itself instead of everything
// starting with it, which is what keeps unrelated companies out.
async function searchSymbol(query) {
  const answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol: query, pattern: false, referrer: "" }),
  });
  // An unknown symbol answers `{ error: "No symbol found" }`.
  return Array.isArray(answer.json) ? answer.json : null;
}

// The search says nothing about the currency, which is what separates the two
// London lines of one fund. The contract details do.
async function readInfo(conid) {
  if (!conid) return null;
  const answer = await api(`iserver/secdef/info?conid=${conid}`);
  return answer.json && !answer.json.error ? answer.json : null;
}

const RESTRICTED_NOTICE =
  /KID|Trading Restricted|not available|cannot be traded|Retail clients can trade packaged/i;

// A US-domiciled fund publishes no KID, and PRIIPs leaves European retail
// clients unable to buy one; only a US resident can. IBKR quotes those
// listings all the same and admits it in one place only: field 7183, the
// order-ticket notice. 7184 alone says nothing, since tradable UCITS listings
// come back with 7184=1 too.
//
// A snapshot answers empty until the subscription warms up, so it has to be
// asked repeatedly. Every listing behind one ticker is asked for at once,
// which keeps the waiting to once per query rather than once per listing.
async function tradingRestricted(conids) {
  const pending = new Set(conids.filter(Boolean));
  const status = new Map();

  for (let attempt = 0; attempt < 10 && pending.size > 0; attempt += 1) {
    const answer = await api(
      `iserver/marketdata/snapshot?conids=${[...pending].join(",")}&fields=6509,7183,7184,31`
    );

    for (const row of Array.isArray(answer.json) ? answer.json : []) {
      const conid = String(row?.conid ?? "");
      if (!pending.has(conid)) continue;

      const notice = (row["7183"] || "").toString();
      if (notice) {
        status.set(conid, RESTRICTED_NOTICE.test(notice));
        pending.delete(conid);
      } else if (row["31"] !== undefined || row["6509"] !== undefined) {
        // A price, or mere availability, without a notice means it settled.
        status.set(conid, false);
        pending.delete(conid);
      }
    }

    if (pending.size > 0) await sleep(300);
  }

  // A listing the snapshot never settled on is left unflagged rather than
  // guessed at: the flag is a fact about the notice, not about its absence.
  for (const conid of pending) status.set(conid, false);
  return status;
}

async function scrapeRowsForQuery(query) {
  let payload = await searchSymbol(query);
  if (!payload) payload = await searchSymbol(query);
  if (!payload) return [];

  const hits = payload
    .filter((entry) => (entry?.symbol || "").toUpperCase() === query)
    .filter((entry) =>
      (entry.sections || []).some((section) => section?.secType === "STK")
    );

  const restrictions = await tradingRestricted(hits.map((entry) => String(entry.conid)));

  const rows = [];
  for (const entry of hits) {
    const exchange = (entry.description || "").trim();
    const heading = (entry.companyHeader || entry.companyName || "").trim();
    // The exact search suffixes the listing venue onto the company name
    // ("SPDR GOLD SHARES - ARCA"), which the fuzzy search leaves off.
    const suffix = ` - ${exchange}`;
    const name =
      exchange && heading.endsWith(suffix)
        ? heading.slice(0, -suffix.length).trim()
        : heading;
    if (!name) continue;

    const info = (await readInfo(entry.conid)) || {};

    rows.push({
      ticker: (entry.symbol || "").toUpperCase(),
      name,
      exchange,
      currency: info.currency || null,
      raw: heading,
      restricted: restrictions.get(String(entry.conid)) === true,
    });
  }

  return rows;
}

console.error(`${queries.length} tickers to check`);

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  if (queryIndex % 20 === 0) await tickle();
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const rows = await scrapeRowsForQuery(query);
  for (const row of rows) {
    const listing = resolveListing(tickerCandidates, query, row.name);
    // Same ticker, different company: not the instrument we asked about.
    if (!listing) continue;

    const key = entryKey(query, row);
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = {
      query,
      ticker: row.ticker,
      name: row.name,
      exchange: row.exchange,
      currency: row.currency,
      type: listing.kind,
      raw: row.raw,
      isin: listing.isin,
    };
    if (row.restricted) entry.usResidentsOnly = true;
    results.push(entry);
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

const byType = new Map();
let usOnly = 0;
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  if (row.usResidentsOnly) usOnly += 1;
}
console.error(
  `${results.length} listed (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
if (usOnly > 0) {
  console.error(`${usOnly} of them are US-residents only (no KID for European retail)`);
}
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
