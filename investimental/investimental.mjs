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
};

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
      candidates.push({ isin, names: [name], exchanges: new Set(exchange ? [exchange] : []) });
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

// The terminal reaches several markets, so the venue it quotes a fund on picks
// the listing out before the name has to.
function resolveIsin(tickerCandidates, found) {
  const candidates = tickerCandidates.get(found.ticker) || [];
  if (candidates.length === 0) return null;

  const venue = MARKET_NAMES[found.market];
  const sameVenue = venue
    ? candidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(found.name, candidate),
  }));

  // A ticker the CSV knows one fund by is that fund, whatever the terminal
  // shortens its name to ("SPDR S&P500").
  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const best = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these listings apart.
  return best.length === 1 ? best[0] : null;
}

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

// `--start=N` (1-indexed) lets a run resume from a specific ticker without
// throwing away progress already saved to parsed_json/investimental-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const resume = process.argv.slice(2).some((arg) => /^--resume$/i.test(arg));
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

const outputPath = new URL("../parsed_json/investimental-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if ((resume || startIndex > 1) && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query) seen.add(entry.query.toUpperCase());
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

    // The channel a caller has to address is the session the socket opened on.
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

  // A socket opened before any of this is adopted on the next frame the app
  // writes to it. The patch has to sit on the native prototype, which the
  // hooked sockets inherit, or those already open would never run it.
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

// A socket that has been dropped answers nothing, so every batch waits for one
// that is open. The account codes only show up on a frame the app sends of its
// own accord, which the search box is nudged into doing.
async function ensureSocket() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.evaluate(HOOK).catch(() => {});

    for (let waited = 0; waited < 40000; waited += 250) {
      const ready = await page
        .evaluate(() => {
          const state = window.__investimental;
          // 1 is OPEN, spelled out because the app's own constant is hooked.
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

// A reload has the app open its socket before anything on the page can be
// asked to run, so the hook is registered to install itself first.
await page.evaluateOnNewDocument(HOOK);

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

// The terminal drops its socket and reloads itself now and then, either of
// which leaves the batch talking to nothing. A batch nobody answered at all
// means exactly that, and is worth sending again on the socket that replaced
// it rather than being read as an offer that holds none of these funds.
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

// Search matches on names as well as symbols, so a query brings back funds
// that merely mention it. Only the listing the ticker itself names is wanted,
// and away from the US the terminal appends a letter for the venue ("VUAAd"
// on Xetra, "VWCEa" in Amsterdam).
function symbolRoot(symbol) {
  return (symbol || "").replace(/[a-z]+$/, "").toUpperCase();
}

const queries = [...tickerCandidates.keys()]
  .filter((ticker) => onlyTickers.size === 0 || onlyTickers.has(ticker))
  .sort();

console.error(`${queries.length} tickers to search`);

function save() {
  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
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
    if (seen.has(ticker)) continue;

    for (const listing of found) {
      if ((listing?.type || "").toLowerCase() !== "etf") continue;
      if (symbolRoot(listing.symbol) !== ticker) continue;

      const market = (listing.marketCode || "").toUpperCase();
      const candidate = resolveIsin(tickerCandidates, {
        ticker,
        name: listing.name || "",
        market,
      });
      if (!candidate) continue;

      seen.add(ticker);
      // The feed leaves plenty of US funds named after their own ticker
      // ("GLD"), which the CSV can say better.
      const quoted = (listing.name || "").replace(/\s+/g, " ").trim();
      const named = quoted && quoted.toUpperCase() !== ticker ? quoted : candidate.name;

      results.push({
        query: ticker,
        ticker,
        name: named,
        exchange: MARKET_NAMES[market] || market || null,
        currency: (listing.currency || "").toUpperCase() || null,
        type: "ETF",
        raw: [listing.symbol, listing.name, market, listing.currency].filter(Boolean).join(" "),
        isin: candidate.isin,
      });
      break;
    }
  }
}

for (let offset = 0; offset < queries.length; offset += BATCH_SIZE) {
  const batch = queries
    .slice(offset, offset + BATCH_SIZE)
    .filter((ticker, index) => offset + index + 1 >= startIndex && !seen.has(ticker));
  if (batch.length === 0) continue;

  await handle(batch);
  searched += batch.length;

  if (offset % (BATCH_SIZE * 10) === 0 || offset + BATCH_SIZE >= queries.length) {
    save();
    console.error(`[${Math.min(offset + BATCH_SIZE, queries.length)}/${queries.length}] ${results.length} matched`);
  }
}

// A search that never answered says nothing about the ticker, so it is worth
// asking again rather than being taken for an absence.
if (failures.length > 0) {
  console.error(`${failures.length} searches went unanswered, asking again`);
  const retries = failures.splice(0, failures.length);
  for (let offset = 0; offset < retries.length; offset += BATCH_SIZE) {
    await handle(retries.slice(offset, offset + BATCH_SIZE));
  }
}

save();
console.error(`${results.length} funds matched out of ${searched} tickers searched`);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
