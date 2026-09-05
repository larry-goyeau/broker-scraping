import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").replace(/\//g, ".").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// The terminal names venues by their MIC; the CSV names them its own way.
const MARKET_NAMES = {
  ARCX: "AMEX",
  BATS: "CBOE",
  BATY: "CBOE",
  EDGA: "CBOE",
  EDGX: "CBOE",
  XASE: "AMEX",
  XNAS: "NASDAQ",
  XNGS: "NASDAQ",
  XNMS: "NASDAQ",
  XNYS: "NYSE",
  XAMS: "EURONEXT",
  XBRU: "EURONEXT",
  XLIS: "EURONEXT",
  XPAR: "EURONEXT",
  XDUB: "EURONEXT",
  XETR: "XETR",
  XFRA: "XETR",
  XLON: "LSE",
  XMIL: "MIL",
  MTAA: "MIL",
  XSWX: "SIX",
  XVTX: "SIX",
  XWBO: "VIE",
  XMAD: "BME",
  XBSE: "BVB",
  REGS: "BVB",
  ORDB: "BVB",
  RGSP: "BVB",
  XRS1: "BVB",
  XRSI: "BVB",
  OOTC: "OTC",
  PINX: "OTC",
  OTCQB: "OTC",
  OTCQX: "OTC",
};

// Search matches on names as well as symbols, so a query brings back funds
// that merely mention it. Away from the US the terminal appends a letter for
// the venue ("VUAAd" on Xetra, "VWCEa" in Amsterdam).
function symbolRoot(symbol) {
  return (symbol || "").replace(/[a-z]+$/, "").toUpperCase();
}

// One ISIN is often listed on several venues under differently worded names,
// so every spelling is kept and the closest one decides a match. Funds are
// loaded first so a ticker both catalogues happen to carry is remembered as
// the fund it is when the terminal types an ETN as a share (VXX).
function loadTickerCandidatesFromCsv(csvPath, kind, map = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = (columns[isinIndex - 1] || "").trim().toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({
        isin,
        kind,
        names: [name],
        exchanges: new Set(exchange ? [exchange] : []),
      });
    }
  }

  return map;
}

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
  return normalize(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

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

  return matched / Math.max(scraped.length, candidate.length);
}

function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

function resolveListing(tickerCandidates, found) {
  const candidates = tickerCandidates.get(found.ticker) || [];
  if (candidates.length === 0) return null;

  const venue = MARKET_NAMES[found.market];
  const sameVenue = venue
    ? candidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  if (found.exact && shortlist.length === 1) {
    const winner = shortlist[0];
    return { isin: winner.isin, name: winner.names[0] || found.name, kind: winner.kind };
  }

  const scored = shortlist.map((candidate) => ({
    isin: candidate.isin,
    kind: candidate.kind,
    ...scoreCandidate(found.name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const best = scored.filter((candidate) => candidate.score === bestScore);
  return best.length === 1 ? best[0] : null;
}

function listingType(listing, resolvedName, kind) {
  const name = `${listing.name || ""} ${resolvedName || ""}`;
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  const shelf = String(listing.type || "").toLowerCase();
  if (shelf === "etf" || kind === "ETF") return "ETF";
  return "STOCK";
}

const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepEverything = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));
const walkLimit = numberArg("limit", 0);

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;

const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliQueries = positionalArgs.map(normalizeTicker).filter(Boolean);

const queries = (() => {
  if (cliQueries.length > 0) return [...new Set(cliQueries)];
  return [...tickerCandidates.keys()].sort();
})();

const walk = queries.slice(startIndex - 1, walkLimit > 0 ? startIndex - 1 + walkLimit : undefined);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const TERMINAL_URL = "https://terminal.investimental.ro/#/";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("terminal.investimental.ro")) ||
  (await browser.newPage());
if (!page.url().includes("terminal.investimental.ro")) {
  await page.goto(TERMINAL_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

const outputPath = new URL("investimental-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
const doneQueries = new Set();

function entryKey(row) {
  return `${row.exchange}:${row.ticker}:${row.isin || row.query}`.toUpperCase();
}

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        if (!entry?.ticker || seen.has(entryKey(entry))) continue;
        results.push(entry);
        seen.add(entryKey(entry));
        if (entry.query) doneQueries.add(String(entry.query).toUpperCase());
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

// The terminal asks for everything over one socket, and its search only
// answers a caller that names the account codes the session was opened with.
// Those codes are read off the app's own traffic rather than guessed at, and
// the socket is adopted as it is built, since the app drops and reopens it
// often enough that holding on to one would mean talking into a closed pipe.
const HOOK = () => {
  if (window.__investimental?.patched) return;

  const state = { socket: null, channel: null, accounts: null, waiters: new Map(), patched: true };

  const adopt = (socket) => {
    state.socket = socket;

    const sId = new URL(socket.url).searchParams.get("sId");
    if (sId) state.channel = `user-${sId}`;

    socket.addEventListener("message", (event) => {
      const text = String(event.data || "");
      if (!text.startsWith("42")) return;
      try {
        const [, message] = JSON.parse(text.slice(2));
        const payload = typeof message === "string" ? JSON.parse(message) : message;
        const waiter = payload && state.waiters.get(payload.commandId);
        if (waiter) {
          waiter(payload);
          state.waiters.delete(payload.commandId);
        }
      } catch {
        // Not a frame this cares about.
      }
    });
  };

  const NativeWebSocket = window.WebSocket;

  class HookedWebSocket extends NativeWebSocket {
    constructor(...args) {
      super(...args);
      if (String(args[0] || "").includes("socket.io")) adopt(this);
    }
  }
  window.WebSocket = HookedWebSocket;

  const originalSend = NativeWebSocket.prototype.send;
  NativeWebSocket.prototype.send = function (data) {
    if (typeof data === "string") {
      if (state.socket !== this && this.readyState === NativeWebSocket.OPEN) adopt(this);

      if (data.includes("accountsCodes")) {
        try {
          const [, message] = JSON.parse(data.slice(2));
          const parsed = typeof message === "string" ? JSON.parse(message) : message;
          const accounts = parsed?.payload?.accountsCodes;
          if (Array.isArray(accounts) && accounts.length > 0) state.accounts = accounts;
        } catch {
          // Not a frame this cares about.
        }
      }
    }

    return originalSend.call(this, data);
  };

  window.__investimental = state;
};

async function ensureSocket() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.evaluate(HOOK).catch(() => {});

    for (let waited = 0; waited < 40000; waited += 250) {
      const ready = await page
        .evaluate(() => {
          const state = window.__investimental;
          return Boolean(state?.socket?.readyState === 1 && state.channel && state.accounts);
        })
        .catch(() => false);
      if (ready) return true;

      if (waited > 0 && waited % 4000 === 0) {
        const input = await page.$("#symbol-search").catch(() => null);
        if (input) {
          await input.click({ clickCount: 3 }).catch(() => {});
          await page.keyboard.press("Backspace").catch(() => {});
          await input.type("VOO", { delay: 60 }).catch(() => {});
        }
      }
      await sleep(250);
    }

    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(5000);
  }

  return false;
}

await page.evaluateOnNewDocument(HOOK);

if (cryptoOnly) {
  console.error("no coin book: BTC answers Grayscale's ETF, not a pair");
  if (!fresh) {
    /* keep existing */
  } else {
    fs.writeFileSync(outputPath, "[]\n");
  }
  await browser.disconnect();
  process.exit(0);
}

if (!(await ensureSocket())) {
  throw new Error("Could not reach the terminal's socket. Is terminal.investimental.ro signed in?");
}
console.error("socket ready");

const BATCH_SIZE = 60;
const SEARCH_TIMEOUT_MS = 20000;

function ask(terms) {
  return page.evaluate(
    async (queries, waitMs) => {
      const state = window.__investimental;
      const search = (term) =>
        new Promise((resolve) => {
          const commandId = Math.floor(Math.random() * 9000000) + 1000000;
          state.waiters.set(commandId, (answer) => resolve(answer?.payload ?? null));
          setTimeout(() => {
            state.waiters.delete(commandId);
            resolve(null);
          }, waitMs);

          state.socket.send(
            `42${JSON.stringify([
              state.channel,
              JSON.stringify({
                identifier: "getSymbolsBriefs",
                commandId,
                payload: { accountsCodes: state.accounts, filters: { search: term } },
              }),
            ])}`
          );
        });

      return Promise.all(queries.map(search));
    },
    terms,
    SEARCH_TIMEOUT_MS
  );
}

async function search(terms) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ensureSocket();
    try {
      const answers = await ask(terms);
      if (answers.some((answer) => answer !== null)) return answers;
    } catch {
      await sleep(2000);
    }
  }
  return terms.map(() => null);
}

const pending = walk.filter((ticker) => !doneQueries.has(ticker));
console.error(`${pending.length} tickers to search`);

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

let searched = 0;
const failures = [];

async function handle(batch) {
  const answers = await search(batch);

  for (const [index, ticker] of batch.entries()) {
    const found = answers[index];
    if (found === null) {
      failures.push(ticker);
      continue;
    }

    for (const listing of found) {
      const shelf = String(listing?.type || "").toLowerCase();
      if (shelf !== "etf" && shelf !== "share") continue;

      const symbol = listing.symbol || "";
      const exact = symbol.toUpperCase() === ticker;
      if (!exact && symbolRoot(symbol) !== ticker) continue;

      const market = (listing.marketCode || "").toUpperCase();
      const quoted = normalize(listing.name || "");
      const candidate = resolveListing(tickerCandidates, {
        ticker,
        name: quoted,
        market,
        exact,
      });
      if (!candidate && !keepEverything) continue;

      const type = listingType(listing, candidate?.name || quoted, candidate?.kind || "");
      if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
      if (type === "STOCK" && !wantStocks) continue;

      const named =
        quoted && quoted.toUpperCase() !== ticker && quoted.length > ticker.length
          ? quoted
          : candidate?.name || quoted || ticker;

      const row = {
        query: ticker,
        ticker,
        name: named,
        exchange: MARKET_NAMES[market] || market || null,
        currency: (listing.currency || "").toUpperCase() || null,
        type,
        raw: [listing.symbol, listing.name, market, listing.currency].filter(Boolean).join(" "),
        isin: candidate?.isin || "",
      };

      const key = entryKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(row);
    }
  }
}

for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
  const batch = pending.slice(offset, offset + BATCH_SIZE);
  if (batch.length === 0) continue;

  await handle(batch);
  searched += batch.length;

  if (offset % (BATCH_SIZE * 5) === 0 || offset + BATCH_SIZE >= pending.length) {
    save();
    console.error(
      `[${Math.min(offset + BATCH_SIZE, pending.length)}/${pending.length}] ${results.length} listed`
    );
  }
}

if (failures.length > 0) {
  console.error(`${failures.length} searches went unanswered, asking again`);
  const retries = failures.splice(0, failures.length);
  for (let offset = 0; offset < retries.length; offset += BATCH_SIZE) {
    await handle(retries.slice(offset, offset + BATCH_SIZE));
  }
}

save();

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listed (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}) out of ${searched} tickers searched`
);

await browser.disconnect();
