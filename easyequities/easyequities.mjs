import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bond tickers come back as numbers rather than text — 188 for the R188 — so
// everything is put through String first.
function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").split("/")[0].trim();
}

// Retired lines in the reference table keep their ISIN behind a marker —
// "X_ZAE000013181", "Old_ZAE000145041" — and the word boundary is what refuses
// them, which is wanted: those are not listings any more.
function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function nameTokens(value) {
  const ignored = new Set([
    "ISHARES",
    "ETF",
    "ETC",
    "ETN",
    "ETP",
    "UCITS",
    "PLC",
    "INC",
    "LTD",
    "LIMITED",
    "FUND",
    "SHARES",
  ]);

  return new Set(
    (value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length > 1 && !ignored.has(token))
  );
}

// ticker,exchange,isin,name. A ticker answers for several listings, and an ISIN
// answers for several venues, so both directions are kept.
function loadCatalogue(csvPath, kind, index = { byTicker: new Map(), byIsin: new Map() }) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const exchange = normalize(columns[1]).toUpperCase();
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean) || "";
    const name = normalize(columns.slice(3).join(","));
    if (!ticker) continue;

    const candidates = index.byTicker.get(ticker) || [];
    const existing = candidates.find((row) => row.isin === isin);
    if (existing) {
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({ isin, name, kind, exchanges: new Set(exchange ? [exchange] : []) });
      index.byTicker.set(ticker, candidates);
    }

    if (!isin) continue;
    const listed = index.byIsin.get(isin);
    if (listed) {
      if (exchange) listed.exchanges.add(exchange);
    } else {
      index.byIsin.set(isin, {
        kind,
        name,
        ticker,
        exchanges: new Set(exchange ? [exchange] : []),
      });
    }
  }

  return index;
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

const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const bondsCsvPath = pathArg("bonds-csv", "../bonds.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");
const bondsOnly = hasFlag("bonds-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const fresh = hasFlag("fresh");
const keepEverything = hasFlag("all");
const sweepOnly = hasFlag("sweep-only");
const startIndex = Math.max(1, numberArg("start", 1));
const walkLimit = numberArg("limit", 0);
const lanes = Math.max(1, numberArg("concurrency", 10));
const MIN_INTERVAL_MS = Math.max(0, numberArg("interval", 50));

const wantEtfs = !stocksOnly && !bondsOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !bondsOnly && !cryptoOnly;
const wantBonds = !etfsOnly && !stocksOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly && !bondsOnly;

const catalogue = { byTicker: new Map(), byIsin: new Map() };
if (wantEtfs) loadCatalogue(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadCatalogue(stocksCsvPath, "STOCK", catalogue);
if (wantBonds) loadCatalogue(bondsCsvPath, "BND", catalogue);
if (wantCrypto) loadCatalogue(cryptosCsvPath, "CRYPTO", catalogue);

// A contract code names its market between the prefix and the ticker —
// "EQU.AU.NDQ" — which is as precise as EasyEquities gets. The venue itself
// comes from whichever catalogue line answers for the listing, and the sets are
// written in the order a listing is most likely to belong.
const MARKET_EXCHANGES = {
  US: new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "CBOE", "BZX", "IEX"]),
  AU: new Set(["ASX", "CXA", "CHIA"]),
  GBP: new Set(["LSE"]),
  DE: new Set(["XETR", "XETRA", "FWB", "GETTEX"]),
  NL: new Set(["EURONEXT"]),
  ZA: new Set(["JSE"]),
};

const MARKET_CURRENCIES = { US: "USD", AU: "AUD", GBP: "GBP", DE: "EUR", NL: "EUR", ZA: "ZAR" };

// Each shelf holds one kind of thing, and asking a shelf for a ticker it does
// not hold answers nothing, so the shelf a row came from names its type. Only
// the shelves with a catalogue behind them are walked ticker by ticker; the
// rest are small enough that paging alone empties them.
const SHELVES = [
  { category: "equitiesexpanded", type: "STOCK", walk: "stocks", wanted: () => wantStocks },
  { category: "etfsexpanded", type: "ETF", walk: "etfs", wanted: () => wantEtfs },
  { category: "commoditiesexpanded", type: "ETF", walk: null, wanted: () => wantEtfs },
  { category: "etnsexpanded", type: "ETN", walk: null, wanted: () => wantEtfs },
  { category: "bondsexpanded", type: "BND", walk: null, wanted: () => wantBonds },
  { category: "cryptoexpanded", type: "CRYPTO", walk: "cryptos", wanted: () => wantCrypto },
  { category: "propertyexpanded", type: "PROP", walk: null, wanted: () => keepEverything },
];

const ASSET_GROUP_TYPES = {
  EQUITIES: "STOCK",
  ETFS: "ETF",
  "US ETFS": "ETF",
  ETNS: "ETN",
  "US ETNS": "ETN",
  BONDS: "BND",
  CRYPTO: "CRYPTO",
  "UNIT TRUSTS": "FUND",
  PROPERTY: "PROP",
};

// A tracker shelf is ETFs, ETCs and ETNs together, and only the name says which.
function refineType(type, name) {
  if (type !== "ETF") return type;
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

// A ticker is asked for under both the name the app shows and the one its
// contract code spells, because the two disagree where a listing has been
// renamed — EQU.GBP.ICG still answers as ICP.
function resolveListing(tickers, scrapedName, market) {
  const all = [];
  for (const ticker of new Set(tickers.filter(Boolean))) {
    for (const candidate of catalogue.byTicker.get(ticker) || []) {
      if (!all.includes(candidate)) all.push(candidate);
    }
  }
  if (all.length === 0) return null;

  const allowed = MARKET_EXCHANGES[market];
  const sameMarket = allowed
    ? all.filter((row) => [...row.exchanges].some((venue) => allowed.has(venue)))
    : [];
  const candidates = sameMarket.length > 0 ? sameMarket : all;

  const scrapedTokens = nameTokens(scrapedName);
  let bestCandidate = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateTokens = nameTokens(candidate.name);
    const score = [...scrapedTokens].filter((token) => candidateTokens.has(token)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }
  if (bestCandidate) return bestCandidate;

  // A ticker on the right venue identifies a listing on its own when just one
  // catalogue line claims it; a company renamed since — abrdn to Aberdeen
  // Group — would otherwise be thrown away over a name that cannot match.
  // Across venues the name still has to agree, since IVV, VEU and IXJ each
  // name two different funds.
  return sameMarket.length === 1 ? sameMarket[0] : null;
}

function venueFor(exchanges, market, fallback) {
  const allowed = MARKET_EXCHANGES[market];
  if (allowed && exchanges) {
    for (const venue of allowed) {
      if (exchanges.has(venue)) return venue;
    }
  }
  return fallback || market || "";
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session. EasyEquities holds its
// token in memory rather than in storage, so it is read off the app's own
// traffic; loading the page is what makes it talk.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("invest-now.apps.easyequities.io")) ||
  (await browser.newPage());

const APP_URL = "https://invest-now.apps.easyequities.io/instrument/diy/etfsexpanded";
const API = "https://rest.synatic.openeasy.io/easyequities/investnow";

let token = "";
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  const auth = event.request.headers?.Authorization || event.request.headers?.authorization;
  if (auth && auth.startsWith("Bearer ")) token = auth.slice(7);
});

// A shelf is what makes the app call its API, and the call is what carries the
// token, so the app is sent to one. Reloading is worth another go: a tab left
// mid-navigation can come back without asking for anything.
async function captureToken() {
  token = "";
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    if (attempt === 0) await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    else await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});

    for (let waited = 0; waited < 30000 && !token; waited += 250) await sleep(250);
  }

  // Signing in bounces through the identity service and back, and that last
  // hop would cut short any call started in between.
  if (token) await sleep(5000);
  return Boolean(token);
}

if (!(await captureToken())) {
  throw new Error(`Could not read the EasyEquities token. Is ${APP_URL} signed in?`);
}

// Renewing the token means loading the page again, which cuts short every
// request already in flight from it. One renewal at a time, and everyone else
// waits for it rather than starting a second one.
let renewal = null;

function renewToken() {
  if (!renewal) renewal = captureToken().finally(() => (renewal = null));
  return renewal;
}

let nextSlot = 0;

async function pace() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await sleep(slot - now);
}

async function api(path, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (renewal) await renewal;
    await pace();

    let answer;
    try {
      answer = await page.evaluate(
        async (url, auth, payload) => {
          try {
            const response = await fetch(url, {
              method: payload ? "POST" : "GET",
              headers: {
                Authorization: `Bearer ${auth}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: payload ? JSON.stringify(payload) : undefined,
            });
            const text = await response.text();
            try {
              return { status: response.status, json: JSON.parse(text) };
            } catch {
              return { status: response.status };
            }
          } catch (error) {
            return { status: 0, error: String(error) };
          }
        },
        `${API}${path}`,
        token,
        body || null
      );
    } catch {
      // The page navigated under us while renewing; try again once it settles.
      await sleep(1000);
      continue;
    }

    // A shelf with nothing on it answers 204 rather than an empty list.
    if (answer.status === 204) return null;
    if (answer.status === 200) return answer.json;
    if (answer.status === 401 || answer.status === 403) await renewToken();
    else await sleep(1000 * (attempt + 1));
  }

  return null;
}

// Instruments name their accounts by number, and this is what turns 16 into
// AUD — the account whose absence blocks a purchase.
async function loadAccountNames() {
  const payload = await api("/trading_currencies");
  const names = new Map();
  for (const row of payload?.tradingCurrencies || []) {
    const label = normalize(row.tradingCurrencyShortName).toUpperCase();
    if (label) names.set(row.tradingCurrencyID, label);
  }
  return names;
}

// This one endpoint ignores every filter it is given and answers with the whole
// instrument table, ISINs included — the only place EasyEquities states them.
// It is a stale snapshot though: it carries QQQ but not SPY, Sasol but not
// Naspers, and names that stopped trading years ago. So it is read as an ISIN
// table for the live shelves rather than as a shelf itself.
async function loadReference() {
  const rows = await api("/instruments");
  const table = new Map();
  if (!Array.isArray(rows)) return table;

  for (const row of rows) {
    const code = normalize(row.ContractCode).toUpperCase();
    if (!code) continue;

    const entry = table.get(code) || {
      isin: "",
      assetGroup: normalize(row.AssetGroup),
      exchange: normalize(row.Exchange).toUpperCase(),
      name: normalize(row.InstrumentName),
      accounts: new Set(),
    };
    entry.isin = entry.isin || toIsin(row.ISINCode);

    // "EasyEquities USD" is an account a client can hold; the RISE, Ecsponent
    // and Demo lines are other people's platforms sharing the same table.
    const currency = normalize(row.TradingCurrency);
    if (/^EasyEquities /i.test(currency)) {
      entry.accounts.add(currency.replace(/^EasyEquities /i, "").toUpperCase());
    }

    table.set(code, entry);
  }

  return table;
}

// Rows repeat across pages because a fund is listed once per category tag it
// carries, so paging stops on an empty page and the caller keeps the union.
async function searchShelf(category, searchValue, accountFilter, pageLimit) {
  const rows = [];
  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const payload = await api("/search", {
      searchValue,
      account_filter: accountFilter,
      category,
      page: pageNumber,
    });

    const batch = payload?.instruments || [];
    rows.push(...batch);
    if (batch.length < 48) break;
  }
  return rows;
}

const accountNames = await loadAccountNames();
const reference = await loadReference();
console.error(
  `${accountNames.size} accounts named, ${reference.size} instruments in the reference table, ` +
    `${catalogue.byIsin.size} ISINs in the catalogues`
);

// Every listing the run has seen, keyed by the contract code that names it.
const shelf = new Map();

function harvest(rows, shelfType) {
  for (const row of rows) {
    const code = normalize(row.contractCode).toUpperCase();
    const ticker = normalizeTicker(row.ticker);
    if (!code || !ticker) continue;

    const found = shelf.get(code);
    if (found) {
      for (const id of row.accountFilters || []) found.accounts.add(id);
      continue;
    }

    shelf.set(code, {
      code,
      ticker,
      name: normalize(row.name),
      exchange: normalize(row.Exchange).toUpperCase(),
      type: shelfType,
      accounts: new Set(row.accountFilters || []),
    });
  }
}

// Paging empties the browsable shelves, which is where instruments our
// catalogues have never heard of turn up. Each account sees its own subset, so
// they are asked for one at a time as well as together.
const shelves = SHELVES.filter((entry) => entry.wanted());
const accountFilters = ["ALL", ...[...accountNames.keys()].map(String)];

for (const entry of shelves) {
  const before = shelf.size;
  for (const accountFilter of accountFilters) {
    harvest(await searchShelf(entry.category, "", accountFilter, 60), entry.type);
  }
  console.error(`  ${entry.category} paged, ${shelf.size - before} new (${shelf.size} listings)`);
}

// Search reaches instruments the browsable shelves leave out — QQQ, GLD and VTI
// are all missing from the ETF shelf yet answer by name — so the catalogues are
// walked ticker by ticker. Every row an answer carries is kept, not just the
// exact hit, because a near miss is a real listing too.
const WALK_SOURCES = {
  stocks: stocksCsvPath,
  etfs: etfsCsvPath,
  cryptos: cryptosCsvPath,
  bonds: bondsCsvPath,
};

function walkTickers(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return [];

  const seen = new Set();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const ticker = normalizeTicker(line.split(",")[0]);
    // EasyEquities tickers are short and always carry a letter, so the numeric
    // codes the Asian venues use are not worth a request.
    if (!/^[A-Z0-9][A-Z0-9.\-]{0,5}$/.test(ticker) || !/[A-Z]/.test(ticker)) continue;
    seen.add(ticker);
  }
  return [...seen];
}

const queue = [];
if (!sweepOnly) {
  for (const entry of shelves) {
    if (!entry.walk) continue;
    for (const ticker of walkTickers(WALK_SOURCES[entry.walk])) {
      queue.push({ ticker, category: entry.category, type: entry.type });
    }
  }
}

const walk = queue.slice(startIndex - 1, walkLimit > 0 ? startIndex - 1 + walkLimit : undefined);
const total = walk.length;
console.error(`${total} ticker queries to make across ${shelves.length} shelves`);

let done = 0;
const workers = Array.from({ length: lanes }, async () => {
  for (;;) {
    const item = walk.shift();
    if (!item) return;

    harvest(await searchShelf(item.category, item.ticker.toLowerCase(), "ALL", 4), item.type);
    done += 1;
    if (done % 2000 === 0) {
      console.error(`  ${done}/${total} asked, ${shelf.size} listings`);
    }
  }
});
await Promise.all(workers);

const outputPath = new URL("easyequities-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    for (const entry of Array.isArray(existing) ? existing : []) {
      if (!entry?.query || seen.has(entry.query)) continue;
      seen.add(entry.query);
      results.push(entry);
    }
    console.error(`${results.length} listings already saved`);
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

let noIsin = 0;
let wrappers = 0;
let fromReference = 0;

function addRow(row) {
  if (seen.has(row.query)) return false;
  seen.add(row.query);
  results.push(row);
  return true;
}

for (const listing of shelf.values()) {
  // Everything exchange traded lives in the EQU namespace; the rest are
  // wrappers — retirement pots, unit trusts, EasyProperties — that only make
  // sense inside EasyEquities. Coins have no namespace at all.
  const isCrypto = listing.type === "CRYPTO";
  if (!listing.code.startsWith("EQU.") && !isCrypto && !keepEverything) {
    wrappers += 1;
    continue;
  }

  const market = listing.code.includes(".") ? listing.code.split(".")[1] : "";
  // Bonds are shown under the number of their coupon line — 188 for the R188 —
  // which is not what the market calls them.
  const codeTicker = normalizeTicker(listing.code.split(".").slice(2).join("."));
  const ticker = /^\d+$/.test(listing.ticker) && codeTicker ? codeTicker : listing.ticker;

  const known = reference.get(listing.code);
  const match = resolveListing([ticker, codeTicker], listing.name, market);
  const isin = known?.isin || match?.isin || "";

  if (!isin && !isCrypto && !keepEverything) {
    noIsin += 1;
    continue;
  }

  const exchange = venueFor(
    match?.exchanges || catalogue.byIsin.get(isin)?.exchanges,
    market,
    known?.exchange || listing.exchange
  );
  const type = refineType(listing.type, listing.name);
  const currency = MARKET_CURRENCIES[market] || null;
  const accounts = [...listing.accounts]
    .map((id) => accountNames.get(id) || String(id))
    .filter(Boolean)
    .sort();

  addRow({
    query: listing.code,
    ticker,
    name: listing.name,
    exchange,
    currency,
    type,
    accounts,
    raw: `${listing.code} ${listing.name} ${exchange}`.trim(),
    isin: isin || null,
  });
}

// The reference table also knows the shelves this login cannot see — a client
// without a ZAR account is shown no JSE listings at all — so those are taken
// from it, but only where a catalogue still carries the ISIN, which is what
// says the listing is current rather than a leftover of the snapshot.
for (const [code, entry] of reference) {
  if (shelf.has(code)) continue;
  if (!code.startsWith("EQU.") && !keepEverything) continue;

  const listed = entry.isin ? catalogue.byIsin.get(entry.isin) : null;
  if (!listed && !keepEverything) continue;

  const market = code.includes(".") ? code.split(".")[1] : "";
  const ticker = normalizeTicker(code.split(".").pop());

  // The snapshot files a few trackers under Equities. Where it is that vague
  // and a catalogue carries the ISIN as something more definite, the catalogue
  // is the newer word; where it names a fund or a note, it is the better one.
  const grouped = ASSET_GROUP_TYPES[entry.assetGroup.toUpperCase()] || "";
  const type = refineType(
    (grouped === "STOCK" ? listed?.kind : grouped) || listed?.kind || "STOCK",
    entry.name
  );
  const exchange = venueFor(
    listed?.exchanges,
    market,
    entry.exchange === "JSE ETFS" ? "JSE" : entry.exchange
  );

  const added = addRow({
    query: code,
    ticker,
    name: entry.name,
    exchange,
    currency: MARKET_CURRENCIES[market] || null,
    type,
    accounts: [...entry.accounts].sort(),
    raw: `${code} ${entry.name} ${exchange}`.trim(),
    isin: entry.isin || null,
  });
  if (added) fromReference += 1;
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = {};
for (const row of results) byType[row.type] = (byType[row.type] || 0) + 1;
const tally = new Map();
for (const row of results) {
  for (const account of row.accounts) tally.set(account, (tally.get(account) || 0) + 1);
}

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin).filter(Boolean)).size} ISINs ` +
    `(${Object.entries(byType)
      .sort((left, right) => right[1] - left[1])
      .map(([type, count]) => `${count} ${type}`)
      .join(", ")}), ${fromReference} only in the reference table, ` +
    `${noIsin} with no ISIN to match, ${wrappers} wrappers skipped`
);
console.error(
  `by account ` +
    [...tally.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([name, count]) => `${name}:${count}`)
      .join(" ")
);

await browser.disconnect();
