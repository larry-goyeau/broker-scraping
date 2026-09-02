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

function loadCryptoNames(csvPath) {
  const names = new Map();
  if (!fs.existsSync(csvPath)) return names;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = String(columns[0] || "").trim().toUpperCase();
    const name = columns.slice(3).join(",").trim() || String(columns[1] || "").trim();
    if (ticker && name && !names.has(ticker)) names.set(ticker, name);
  }
  return names;
}

// Admirals files a pair as `BTCUSD` and shortens a few bases (DGE for DOGE).
const CRYPTO_BASE_ALIASES = { DGE: "DOGE", ATM: "ATOM", ALG: "ALGO", LNK: "LINK" };

function admiralCryptoPair(symbol) {
  const text = String(symbol || "").toUpperCase();
  const quote = text.endsWith("EUR") ? "EUR" : text.endsWith("USD") ? "USD" : "";
  const rawBase = quote ? text.slice(0, -quote.length) : text;
  const base = CRYPTO_BASE_ALIASES[rawBase] || rawBase;
  return { base, quote, pair: quote ? `${base}/${quote}` : base };
}

// One ISIN is often listed on several venues under differently worded names
// ("iShares Core MSCI World UCITS ETF" and "... ETF USD (Acc)"), so every
// spelling is kept and the closest one decides the match.
function loadTickerCandidatesFromCsv(csvPath, kind, into = new Map()) {
  if (!fs.existsSync(csvPath)) return into;

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

    const candidates = into.get(ticker) || [];
    into.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    const candidate = existing || { isin, kind, names: [], exchanges: [] };
    if (!existing) candidates.push(candidate);

    if (!candidate.names.includes(name)) candidate.names.push(name);
    if (exchange && !candidate.exchanges.includes(exchange)) {
      candidate.exchanges.push(exchange);
    }
  }

  return into;
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
  "Belgium (Euronext)": "EURONEXT",
  "Portugal (Euronext)": "EURONEXT",
  "Switzerland (SWX)": "SIX",
  "Spain (BME)": "BME",
  "US (NASDAQ)": "NASDAQ",
  "US (NYSE)": "NYSE",
  "US (AMEX)": "AMEX",
  "Denmark (CSE)": "CSE",
  "Finland (NASDAQ)": "OMXHEX",
  "Sweden (NASDAQ)": "OMXSTO",
  "Norway (NASDAQ)": "OSL",
  "Austria (VIE)": "VIE",
  "Australia (ASX)": "ASX",
};

function resolveIsin(tickerCandidates, ticker, scrapedName, venue, allowedKinds) {
  const pool = (tickerCandidates.get(ticker) || []).filter((candidate) =>
    allowedKinds ? allowedKinds.has(candidate.kind) : true
  );

  const scored = pool.map((candidate) => ({
    isin: candidate.isin,
    kind: candidate.kind,
    exchanges: candidate.exchanges,
    ...scoreCandidate(scrapedName, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  let shortlist = scored.filter((candidate) => candidate.score === bestScore);
  if (shortlist.length === 1) return shortlist[0];

  // Two funds sharing a ticker are told apart by where each one trades, and
  // Admirals says which venue it quotes.
  const venueCode = CSV_EXCHANGES[venue];
  const onVenue = venueCode
    ? shortlist.filter((candidate) => candidate.exchanges.includes(venueCode))
    : [];
  if (onVenue.length === 1) return onVenue[0];
  if (onVenue.length > 1) shortlist = onVenue;

  // Share classes of one fund carry names that only add words ("... EUR Hedged
  // Acc"), and all of them score alike. The name carrying no extra words is the
  // closer read of what was scraped.
  const scrapedLength = nameTokens(scrapedName).length;
  const distance = (candidate) => Math.abs(nameTokens(candidate.name).length - scrapedLength);
  const tightest = Math.min(...shortlist.map(distance));
  shortlist = shortlist.filter((candidate) => distance(candidate) === tightest);
  if (shortlist.length === 1) return shortlist[0];

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
// throwing away progress already saved to admiral-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

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

// `--csv=PATH` the fund list (defaults to etfs.csv) and `--stocks-csv=PATH`
// the share list (defaults to stocks.csv). Invest.MT5 is the shares-and-funds
// book; crypto lives on Trade.MT5 as CFDs under `searchType=cryptocurrencies`.
// `--funds-only` / `--etfs-only` answer for the funds alone; `--stocks-only`
// for the shares; `--no-crypto` leaves the pairs out; `--crypto-only` answers
// for the pairs alone.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only");
const skipCrypto = hasFlag("no-crypto") || fundsOnly || stocksOnly;
const skipEquities = cryptoOnly;

const tickerCandidates = new Map();
if (!stocksOnly && !skipEquities) loadTickerCandidatesFromCsv(csvPath, "ETF", tickerCandidates);
if (!fundsOnly && !skipEquities) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);
const cryptoNames = skipCrypto ? new Map() : loadCryptoNames(cryptosCsvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));
const onlyPairs = new Set(
  positionalArgs.map((arg) => String(arg || "").trim().toUpperCase()).filter(Boolean)
);

const outputPath = new URL("admiral-parsed.json", import.meta.url);
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

// Invest.MT5 holds the shares. Crypto on
// /trade/all-instruments?searchType=cryptocurrencies is a Trade.MT5 CFD book
// (`trade_type_id` 12, `type_ids` 199). Opening that tab logs the UI into
// Trade.MT5 — often a demo account — and Invest.MT5 then returns no quotes
// for NVDA. The two books are therefore logged in separately: Invest.MT5 for
// shares, Trade.MT5 for the pairs (a demo Trade.MT5 account is enough).
const INVEST_TRADE_TYPE_ID = 20;
const TRADE_MT5_TYPE_ID = 12;
const CRYPTO_TYPE_ID = 199;

function apiHeaders(authorization, sessionId) {
  return {
    Authorization: authorization,
    ...(sessionId ? { "X-Session-ID": sessionId } : {}),
    "Api-Client": "nt_web",
    "Content-Type": "application/json",
  };
}

function slimCompanies(accounts, tradeTypeId) {
  const wanted = new Map();
  for (const account of accounts || []) {
    if (account?.trade_type_id !== tradeTypeId || !account?.company_id) continue;
    wanted.set(account.company_id, {
      company_id: account.company_id,
      trade_type_id: account.trade_type_id,
    });
  }
  return [...wanted.values()];
}

async function callJson(url, headers, body) {
  const method = body === undefined ? "GET" : "POST";
  return page.evaluate(
    async (url, headers, payload, method) => {
      const response = await fetch(url, {
        method,
        headers,
        ...(method === "GET" ? {} : { body: JSON.stringify(payload) }),
      });
      const text = await response.text();
      try {
        return { status: response.status, payload: JSON.parse(text) };
      } catch {
        return { status: response.status, payload: null };
      }
    },
    url,
    headers,
    body,
    method
  );
}

async function loginAccount(authorization, trAccountId) {
  const answer = await callJson(LOGIN_URL, apiHeaders(authorization), {
    tr_account_id: trAccountId,
    app_id: 3,
    version: 16,
    offline_mode: true,
  });
  const sessionId = answer.payload?.session_id;
  if (answer.status !== 200 || !sessionId) {
    throw new Error(
      `login for account ${trAccountId} failed (status ${answer.status})`
    );
  }
  return sessionId;
}

// The bearer is taken off the app's own traffic. Which book it is logged into
// is ignored: that is whatever tab was last open, and quotes only answer for
// that book's instruments.
async function captureAuthorization() {
  const client = await page.createCDPSession();
  await client.send("Network.enable");

  let authorization = null;
  client.on("Network.requestWillBeSent", (event) => {
    if (!event.request.url.startsWith("https://api.admiralmarkets.com/")) return;
    const sent = event.request.headers || {};
    authorization = sent.Authorization || sent.authorization || authorization;
  });

  await page.goto(TRADE_URL, { waitUntil: "domcontentloaded" });
  for (let waited = 0; waited < 60000; waited += 250) {
    if (authorization) break;
    await sleep(250);
  }
  await client.detach().catch(() => {});

  if (!authorization) {
    throw new Error(
      "Could not read the trading token. Is admiralmarkets.com signed in?"
    );
  }
  return authorization;
}

async function captureSession() {
  const authorization = await captureAuthorization();
  const accountsAnswer = await callJson(ACCOUNTS_URL, apiHeaders(authorization));
  if (accountsAnswer.status !== 200 || !accountsAnswer.payload) {
    throw new Error(`accounts failed (status ${accountsAnswer.status})`);
  }

  const real = accountsAnswer.payload.REAL?.accounts || [];
  const demo = accountsAnswer.payload.DEMO?.accounts || [];
  const invest = real.find((account) => account.trade_type_id === INVEST_TRADE_TYPE_ID);
  const companies = slimCompanies(real, INVEST_TRADE_TYPE_ID);
  if (!invest || companies.length === 0) {
    throw new Error(
      "Could not find a live Invest.MT5 account. Is admiralmarkets.com signed in on one?"
    );
  }

  const investSessionId = await loginAccount(authorization, invest.id);
  const captured = {
    headers: apiHeaders(authorization, investSessionId),
    companies,
    cryptoHeaders: null,
    cryptoCompanies: [],
  };

  if (!skipCrypto) {
    const trade =
      real.find((account) => account.trade_type_id === TRADE_MT5_TYPE_ID) ||
      demo.find((account) => account.trade_type_id === TRADE_MT5_TYPE_ID);
    if (!trade) {
      if (cryptoOnly) {
        throw new Error(
          "Crypto CFDs need a Trade.MT5 account (a demo one is enough)."
        );
      }
      console.error("No Trade.MT5 account on this login; skipping crypto CFDs");
    } else {
      const cryptoSessionId = await loginAccount(authorization, trade.id);
      captured.cryptoHeaders = apiHeaders(authorization, cryptoSessionId);
      captured.cryptoCompanies = [
        { company_id: trade.company_id || invest.company_id, trade_type_id: TRADE_MT5_TYPE_ID },
      ];
    }
  }

  return captured;
}

let session = await captureSession();

function headersFor(book) {
  return book === "crypto" ? session.cryptoHeaders : session.headers;
}

function callApi(path, body, book = "invest") {
  return callJson(`${API_BASE}${path}`, headersFor(book), body);
}

async function request(path, body, book = "invest") {
  if (book === "crypto" && !session.cryptoHeaders) {
    throw new Error("No Trade.MT5 session to quote crypto CFDs");
  }

  let answer = await callApi(path, body, book).catch(() => null);

  // The token expires mid-run on a long list, and a fresh one is cheap next to
  // losing the call.
  if (!answer || answer.status !== 200) {
    await sleep(1000);
    session = await captureSession();
    answer = await callApi(path, body, book).catch(() => null);
  }

  if (!answer || answer.status !== 200) {
    throw new Error(`${path} failed (status ${answer?.status ?? "none"})`);
  }
  return answer.payload;
}

// Admirals carries a few thousand shares and a few hundred ETFs on the one
// Invest.MT5 board, so an empty query walks it instead of guessing at search
// terms the way a ticker-by-ticker lookup would — the search matches names and
// symbols, never ISINs. Cash bonds are not on this board. Crypto CFDs live on
// Trade.MT5 and are listed separately. There is also no PTP / US-residents-only
// flag; `[tax]` on a French share is the domestic transaction tax, not a US
// withholding mark.
const ETF_TYPE_ID = 4318;
const STOCK_TYPE_ID = 206;
const PAGE_SIZE = 100;

async function listInvest() {
  const instruments = new Map();
  const typeIds = stocksOnly ? [STOCK_TYPE_ID] : fundsOnly ? [ETF_TYPE_ID] : undefined;

  for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
    const payload = await request("/search/", {
      q: "",
      count: PAGE_SIZE,
      page: pageNumber,
      sort: "popularity",
      order: "desc",
      ...(typeIds ? { type_ids: typeIds } : {}),
      trade_companies: session.companies,
    }, "invest");

    const hits = payload?.hits || [];
    for (const hit of hits) {
      const document = hit?.document;
      const relation = document?.relation_type;
      if (!document?.name) continue;
      if (relation === "ETF" && stocksOnly) continue;
      if (relation === "STOCK" && fundsOnly) continue;
      if (relation !== "ETF" && relation !== "STOCK") continue;
      if (instruments.has(document.name)) continue;
      instruments.set(document.name, {
        symbol: document.name,
        name: (document.description || "").replace(/\s+/g, " ").trim(),
        relation,
      });
    }

    if (hits.length === 0 || instruments.size >= (payload?.found ?? 0)) break;
  }

  return [...instruments.values()];
}

async function listCryptos() {
  const instruments = new Map();
  const companies = session.cryptoCompanies || [];
  if (!session.cryptoHeaders || !companies.length) return [];

  for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
    const payload = await request(
      "/search/",
      {
        q: "",
        count: PAGE_SIZE,
        page: pageNumber,
        sort: "popularity",
        order: "desc",
        type_ids: [CRYPTO_TYPE_ID],
        trade_companies: companies,
      },
      "crypto"
    );

    const hits = payload?.hits || [];
    for (const hit of hits) {
      const document = hit?.document;
      if (!document?.name) continue;
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

function cryptoWanted(symbol, pair, base) {
  if (onlyTickers.size === 0 && onlyPairs.size === 0) return true;
  const platform = String(symbol || "").toUpperCase();
  return (
    onlyPairs.has(platform) ||
    onlyPairs.has(pair) ||
    onlyTickers.has(base) ||
    onlyTickers.has(platform) ||
    onlyTickers.has(pair)
  );
}

// The board answers for a few hundred symbols in one call, so the quote data
// behind every instrument page is read up front instead of page by page.
const DATA_BATCH = 250;

async function readInstrumentData(symbols, book = "invest") {
  const rows = new Map();
  const companies = book === "crypto" ? session.cryptoCompanies : session.companies;

  for (let offset = 0; offset < symbols.length; offset += DATA_BATCH) {
    const payload = await request(
      "/instruments/data/",
      {
        fields: ["n", "dsc", "cbs", "tm", "p"],
        instruments: symbols.slice(offset, offset + DATA_BATCH),
        period: "today",
        ...(companies?.length ? { trade_companies: companies } : {}),
      },
      book
    );
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

const listed = skipEquities ? [] : await listInvest();
const instruments = listed.filter(
  (instrument) =>
    onlyTickers.size === 0 || onlyTickers.has(normalizeTicker(instrument.symbol))
);
const instrumentData = skipEquities
  ? new Map()
  : await readInstrumentData(instruments.map((entry) => entry.symbol));
if (!skipEquities) {
  console.error(
    `${listed.length} on the Invest.MT5 board (` +
      `${listed.filter((row) => row.relation === "STOCK").length} shares, ` +
      `${listed.filter((row) => row.relation === "ETF").length} funds); ` +
      `${instruments.length} asked, ${instrumentData.size} quoted`
  );
}

const skipped = new Map();
const bump = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);

for (const [index, instrument] of instruments.entries()) {
  if (index + 1 < startIndex) continue;

  const symbol = instrument.symbol;

  // Search indexes instruments the account cannot reach — mostly US-domiciled
  // funds an EU entity may not offer — and those carry no quote at all.
  const data = instrumentData.get(symbol);
  if (!data) {
    bump("not available on this account");
    continue;
  }

  const { category, venue } = readPath(data.p);
  const isEtf = /^ETF/i.test(category) || instrument.relation === "ETF";
  const isStock = /^Stock/i.test(category) || instrument.relation === "STOCK";
  if (isEtf && stocksOnly) {
    bump("not a share");
    continue;
  }
  if (isStock && fundsOnly) {
    bump("not a fund");
    continue;
  }
  if (!isEtf && !isStock) {
    bump(`not a share or fund (${category || "no category"})`);
    continue;
  }

  if (!OPENABLE_TRADE_MODES.has(data.tm)) {
    bump("close only");
    continue;
  }

  const name = (data.dsc || instrument.name || "").replace(/\s+/g, " ").trim();
  const query = normalizeTicker(symbol);
  const allowedKinds = new Set(isEtf ? ["ETF"] : ["STOCK"]);
  const matched = resolveIsin(tickerCandidates, query, name, venue, allowedKinds);
  // Same ticker, different instrument: not the one the CSV is asking about.
  if (!matched) {
    bump("no ISIN");
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
    type: matched.kind,
    raw: [symbol, name, venue].filter(Boolean).join(" "),
    isin: matched.isin,
  });

  if (results.length % 250 === 0) {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.error(`  ${results.length} matched`);
  }
}

if (!skipCrypto) {
  const cryptos = await listCryptos();
  const cryptoData = await readInstrumentData(
    cryptos.map((entry) => entry.symbol),
    "crypto"
  );
  console.error(
    `${cryptos.length} crypto CFDs on Trade.MT5, ${cryptoData.size} quoted`
  );
  if (!skipCrypto && cryptoNames.size) {
    console.error(`${cryptoNames.size} coins in the list to name crypto pairs against`);
  }

  let unnamedCrypto = 0;
  for (const instrument of cryptos) {
    const { base, quote, pair } = admiralCryptoPair(instrument.symbol);
    if (!cryptoWanted(instrument.symbol, pair, base)) continue;

    const data = cryptoData.get(instrument.symbol);
    if (!data) {
      bump("crypto not available on this account");
      continue;
    }
    if (!OPENABLE_TRADE_MODES.has(data.tm)) {
      bump("crypto close only");
      continue;
    }

    const listedName = cryptoNames.get(base);
    if (!listedName) unnamedCrypto += 1;
    const name = (
      listedName ||
      (data.dsc || instrument.name || "")
        .replace(/\s+vs\s+(US Dollar|Euro)\s+CFD$/i, "")
        .replace(/\s+/g, " ")
        .trim()
    );

    const key = entryKey(pair, instrument.symbol);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      query: pair,
      ticker: pair,
      name,
      exchange: "CRYPTO",
      currency: quote || null,
      type: "CRYPTO",
      raw: [instrument.symbol, name, pair, quote].filter(Boolean).join(" "),
      isin: null,
    });
  }
  if (unnamedCrypto > 0) {
    console.error(
      `${unnamedCrypto} pairs are named by Admirals alone; their base coin is not in cryptos.csv`
    );
  }
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
for (const [reason, count] of [...skipped].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(count).padStart(5)} ${reason}`);
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
