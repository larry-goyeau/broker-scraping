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

// One ISIN is often listed on several venues under differently worded names
// ("iShares Core MSCI World UCITS ETF" and "... ETF USD (Acc)"), so every
// spelling is kept and the closest one decides the match.
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

    // Supports both ticker,isin,name and ticker,exchange,isin,name.
    const exchange =
      isinIndex >= 2 ? (columns[isinIndex - 1] || "").trim().toUpperCase() : "";

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    const candidate = existing || { isin, names: [], exchanges: [] };
    if (!existing) candidates.push(candidate);

    if (!candidate.names.includes(name)) candidate.names.push(name);
    if (exchange && !candidate.exchanges.includes(exchange)) {
      candidate.exchanges.push(exchange);
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

  // Dividing by the longer name keeps a terser cross-listing from outscoring
  // the fund actually named just by leaving words out.
  return matched / Math.max(scraped.length, candidate.length);
}

// The CSV names funds the way their prospectus does, umbrella first ("SSGA
// SPDR ETFs Europe I PLC - State Street SPDR S&P 500 UCITS ETF USD"), while the
// board shows the name the fund is sold under. The umbrella says nothing about
// which fund it is, so the parts around it are read as spellings of their own.
function nameVariants(name) {
  const parts = (name || "").split(/\s+-\s*|\s*-\s+/).map((part) => part.trim());
  return [name, ...parts.filter((part) => nameTokens(part).length >= 2)];
}

// Picks the wording of a candidate that reads closest to what was scraped.
function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    for (const variant of nameVariants(name)) {
      const score = nameScore(scrapedName, variant);
      if (score > best.score) best = { score, name: variant };
    }
  }
  return best;
}

// A ticker in the CSV can point at several ISINs (the same symbol is reused
// across venues and by unrelated funds), so a listing only earns an ISIN when
// its name genuinely matches. Admirals lists "TINF.UK" for a Janus Henderson
// fund while the CSV knows TINF as a Canadian TD one; the names settle it.
const MIN_NAME_SCORE = 0.5;

// Where Admirals quotes an instrument, in the CSV's own vocabulary.
const CSV_EXCHANGES = {
  "UK (LSE)": "LSE",
  "Germany (Xetra)": "XETR",
  "France (Euronext)": "EURONEXT",
  "Netherlands (Euronext)": "EURONEXT",
  "Switzerland (SWX)": "SIX",
  "Spain (BME)": "BME",
};

function resolveIsin(tickerCandidates, ticker, scrapedName, venue) {
  const candidates = tickerCandidates.get(ticker) || [];

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    exchanges: candidate.exchanges,
    ...scoreCandidate(scrapedName, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  let shortlist = scored.filter((candidate) => candidate.score === bestScore);
  if (shortlist.length === 1) return shortlist[0].isin;

  // Two funds sharing a ticker are told apart by where each one trades, and
  // Admirals says which venue it quotes.
  const venueCode = CSV_EXCHANGES[venue];
  const onVenue = venueCode
    ? shortlist.filter((candidate) => candidate.exchanges.includes(venueCode))
    : [];
  if (onVenue.length === 1) return onVenue[0].isin;
  if (onVenue.length > 1) shortlist = onVenue;

  // Share classes of one fund carry names that only add words ("... EUR Hedged
  // Acc"), and all of them score alike. The name carrying no extra words is the
  // closer read of what was scraped.
  const scrapedLength = nameTokens(scrapedName).length;
  const distance = (candidate) => Math.abs(nameTokens(candidate.name).length - scrapedLength);
  const tightest = Math.min(...shortlist.map(distance));
  shortlist = shortlist.filter((candidate) => distance(candidate) === tightest);
  if (shortlist.length === 1) return shortlist[0].isin;

  // Still tied: the name does not tell these funds apart.
  return null;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("admiralmarkets.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to parsed_json/admiral-parsed.json.
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

const outputPath = new URL("../parsed_json/admiral-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

const entryKey = (query, ticker) => `${query}:${ticker}`.toUpperCase();

// When resuming, load already-saved entries so earlier progress is preserved.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) seen.add(entryKey(entry.query, entry.ticker));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const TRADE_URL = "https://admiralmarkets.com/trade/";
const API_BASE = "https://api.admiralmarkets.com/trade/v1";
const ACCOUNTS_URL = "https://api.admiralmarkets.com/accounts/";
const LOGIN_URL = `${API_BASE}/login/`;

// Invest.MT5 is the account that holds shares; the other platforms on the same
// login trade the CFDs written on them, and their instruments are not ETFs.
const INVEST_TRADE_TYPE_ID = 20;

// Every call is signed with a token that lives about ten minutes and stamped
// with the trading session it belongs to, and the board only answers for the
// account's own company, so all three are read off the app's own traffic
// rather than assembled by hand.
async function captureSession() {
  const client = await page.createCDPSession();
  await client.send("Network.enable");

  let authorization = null;
  let sessionId = null;
  let companies = null;
  const watched = new Map();

  const readBody = async (requestId) => {
    const fetched = await client
      .send("Network.getResponseBody", { requestId })
      .catch(() => null);
    if (!fetched?.body) return null;
    try {
      return JSON.parse(fetched.body);
    } catch {
      return null;
    }
  };

  client.on("Network.requestWillBeSent", (event) => {
    const url = event.request.url;
    if (url === ACCOUNTS_URL || url === LOGIN_URL) watched.set(event.requestId, url);
    if (!url.startsWith(`${API_BASE}/`)) return;

    const sent = event.request.headers || {};
    authorization = sent.Authorization || sent.authorization || authorization;
  });

  client.on("Network.loadingFinished", async (event) => {
    const url = watched.get(event.requestId);
    if (!url) return;

    // This call is what opens the trading session, so its answer carries the
    // id before any request header does.
    if (url === LOGIN_URL && !sessionId) {
      sessionId = (await readBody(event.requestId))?.session_id || null;
      return;
    }

    if (url === ACCOUNTS_URL && !companies) {
      const accounts = (await readBody(event.requestId))?.REAL?.accounts || [];
      const wanted = new Map();
      for (const account of accounts) {
        if (account?.trade_type_id !== INVEST_TRADE_TYPE_ID || !account?.company_id) continue;
        wanted.set(account.company_id, {
          company_id: account.company_id,
          trade_type_id: account.trade_type_id,
        });
      }
      if (wanted.size > 0) companies = [...wanted.values()];
    }
  });

  // Loading the dashboard is what puts all three on the wire; they arrive
  // within a second or two of the app booting.
  await page.goto(TRADE_URL, { waitUntil: "domcontentloaded" });
  for (let waited = 0; waited < 60000; waited += 250) {
    if (authorization && sessionId && companies) break;
    await sleep(250);
  }
  await client.detach().catch(() => {});

  if (!authorization || !sessionId || !companies) {
    throw new Error(
      "Could not read the trading session. Is admiralmarkets.com signed in on a live Invest.MT5 account?"
    );
  }

  return {
    headers: {
      Authorization: authorization,
      "X-Session-ID": sessionId,
      "Api-Client": "nt_web",
      "Content-Type": "application/json",
    },
    companies,
  };
}

let session = await captureSession();

function callApi(path, body) {
  return page.evaluate(
    async (url, headers, payload) => {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      try {
        return { status: response.status, payload: JSON.parse(text) };
      } catch {
        return { status: response.status, payload: null };
      }
    },
    `${API_BASE}${path}`,
    session.headers,
    body
  );
}

async function request(path, body) {
  let answer = await callApi(path, body).catch(() => null);

  // The token expires mid-run on a long list, and a fresh one is cheap next to
  // losing the call.
  if (!answer || answer.status !== 200) {
    await sleep(1000);
    session = await captureSession();
    answer = await callApi(path, body).catch(() => null);
  }

  if (!answer || answer.status !== 200) {
    throw new Error(`${path} failed (status ${answer?.status ?? "none"})`);
  }
  return answer.payload;
}

// Admirals carries a few hundred ETFs in one category, so an empty query walks
// the whole board instead of guessing at search terms the way a ticker-by-ticker
// lookup would — the search matches names and symbols, never ISINs.
const ETF_TYPE_ID = 4318;
const PAGE_SIZE = 100;

async function listEtfs() {
  const instruments = new Map();

  for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
    const payload = await request("/search/", {
      q: "",
      count: PAGE_SIZE,
      page: pageNumber,
      sort: "popularity",
      order: "desc",
      type_ids: [ETF_TYPE_ID],
      trade_companies: session.companies,
    });

    const hits = payload?.hits || [];
    for (const hit of hits) {
      const document = hit?.document;
      if (!document?.name || document.relation_type !== "ETF") continue;
      if (instruments.has(document.name)) continue;
      instruments.set(document.name, {
        symbol: document.name,
        name: (document.description || "").replace(/\s+/g, " ").trim(),
      });
    }

    if (hits.length === 0 || instruments.size >= (payload?.found ?? 0)) break;
  }

  return [...instruments.values()];
}

// The board answers for a few hundred symbols in one call, so the quote data
// behind every instrument page is read up front instead of page by page.
const DATA_BATCH = 250;

async function readInstrumentData(symbols) {
  const rows = new Map();

  for (let offset = 0; offset < symbols.length; offset += DATA_BATCH) {
    const payload = await request("/instruments/data/", {
      fields: ["n", "dsc", "cbs", "tm", "p"],
      instruments: symbols.slice(offset, offset + DATA_BATCH),
      period: "today",
    });
    for (const row of payload?.instruments_data || []) rows.set(row.n, row);
  }

  return rows;
}

// "ETFs\UK (LSE)\Group 1\VUSA" names the category first, then the venue.
function readPath(path) {
  const parts = (path || "").split("\\");
  return { category: parts[0] || "", venue: parts[1] || "" };
}

// MetaTrader ships the symbol's trade mode with the quote: 1 and 4 can open a
// position, while 3 is the "Clôture Uniquement. Uniquement la clôture des
// positions ouvertes est autorisée pour cet instrument." the board shows on
// instruments it will only let you close out of.
const OPENABLE_TRADE_MODES = new Set([1, 4]);

const listed = await listEtfs();
const instruments = listed.filter(
  (instrument) =>
    onlyTickers.size === 0 || onlyTickers.has(normalizeTicker(instrument.symbol))
);
const instrumentData = await readInstrumentData(instruments.map((entry) => entry.symbol));
console.error(`${instruments.length} ETFs listed, ${instrumentData.size} quoted`);

for (const [index, instrument] of instruments.entries()) {
  if (index + 1 < startIndex) continue;

  const symbol = instrument.symbol;
  const label = `[${index + 1}/${instruments.length}] ${symbol}`;

  // Search indexes instruments the account cannot reach — mostly US-domiciled
  // funds an EU entity may not offer — and those carry no quote at all.
  const data = instrumentData.get(symbol);
  if (!data) {
    console.error(`${label}: not available on this account`);
    continue;
  }

  const { category, venue } = readPath(data.p);
  if (!/^ETF/i.test(category)) {
    console.error(`${label}: not an ETF (${category || "no category"})`);
    continue;
  }

  if (!OPENABLE_TRADE_MODES.has(data.tm)) {
    console.error(`${label}: close only`);
    continue;
  }

  const name = (data.dsc || instrument.name || "").replace(/\s+/g, " ").trim();
  const query = normalizeTicker(symbol);
  const isin = resolveIsin(tickerCandidates, query, name, venue);
  // Same ticker, different fund: not the one the CSV is asking about.
  if (!isin) {
    console.error(`${label}: no ISIN for "${name}"`);
    continue;
  }

  const key = entryKey(query, symbol);
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query,
    ticker: symbol,
    name,
    exchange: venue,
    currency: (data.cbs || "").toUpperCase() || null,
    type: "ETF",
    raw: [symbol, name, venue].filter(Boolean).join(" "),
    isin,
  });

  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
