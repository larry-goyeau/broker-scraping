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
  const body = (afterExchange || "").trim();
  if (!body) return "";

  // TradingView writes a preferred as `NLY/PG` and a listed note the same way;
  // Alpaca files both as `NLY.PRG`. Cutting at the slash, which is what a
  // composite ticker used to need, folded every series of a house onto its
  // common share and left the preferreds looking unnamed.
  const preferred = body.match(/^([A-Z0-9]+)\/P([A-Z])$/);
  if (preferred) return `${preferred[1]}.PR${preferred[2]}`;
  const preferredBare = body.match(/^([A-Z0-9]+)\/P$/);
  if (preferredBare) return `${preferredBare[1]}.PR`;
  const unit = body.match(/^([A-Z0-9]+)\/U$/);
  if (unit) return `${unit[1]}.U`;
  const right = body.match(/^([A-Z0-9]+)\/R(?:T)?$/);
  if (right) return `${right[1]}.RT`;

  return body.split(/[/]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// Alpaca names a listing after the venue it is quoted on, so NYSE Arca comes
// through as ARCA and Cboe BZX as BATS, both of which the CSV files under the
// exchange that owns them.
const EXCHANGE_NAMES = {
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "CBOE",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
  OTC: "OTC",
};

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
//
// Funds, shares and listed notes are read into the one pool, each candidate
// carrying the list it came from, because Alpaca's book does not say which is
// which and the ticker alone cannot settle it. A handful of American tickers
// are claimed by more than one list and they do not fall the same way: `GAB`
// is the Gabelli Equity Trust and the share list only holds its preferred
// stock, while `NEE` is NextEra Energy's common share and the fund list only
// holds one of its structured notes. So the name decides, as it already does
// between share classes, and whichever candidate wins also says what the line
// is.
function loadTickerCandidatesFromCsv(csvPath, kind, into = new Map()) {
  if (!fs.existsSync(csvPath)) return into;

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

    const candidates = into.get(ticker) || [];
    into.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({ isin, kind, names: [name], exchanges: new Set(exchange ? [exchange] : []) });
    }
  }

  return into;
}

// A crypto line has no ISIN, so it cannot go through the share loader. The
// file is `ticker,exchange,isin,name` with the number left blank; the name is
// what we want, keyed on the coin (BTC), not on a pair.
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

// Alpaca quotes a pair, `BTC/USD`. The coin the list names is the left side.
function cryptoBase(symbol) {
  const text = String(symbol || "").toUpperCase();
  const cut = text.indexOf("/");
  return cut >= 0 ? text.slice(0, cut) : text;
}

function cryptoQuote(symbol) {
  const text = String(symbol || "").toUpperCase();
  const cut = text.indexOf("/");
  return cut >= 0 ? text.slice(cut + 1) : "USD";
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
  "COMMON",
  "STOCK",
  "SHARES",
  "CLASS",
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

// Warrants, units and rights are the bulk of what no list names, and Alpaca
// spells them out in the ticker. Preferreds used to land here too, before the
// slash in TradingView's ticker was mapped onto Alpaca's `.PR` form. Knowing
// which is which is only used to say what a run could not name, never to drop
// anything.
function shapeOf(ticker, name) {
  if (/\.PR[A-Z]?$/.test(ticker) || /\bPreferred\b/i.test(name)) return "preferred share";
  if (/W$/.test(ticker) && /\bWarrants?\b/i.test(name)) return "warrant";
  if (/(\.RT|R)$/.test(ticker) && /\bRights?\b/i.test(name)) return "right";
  if (/U$/.test(ticker) && /\bUnits?\b/i.test(name)) return "unit";
  if (/\bNotes?\b/i.test(name)) return "note";
  return "share or fund";
}

const MIN_NAME_SCORE = 0.5;

// An American ticker belongs to one instrument apiece, so the fund Alpaca
// quotes under it is the one the CSV files on that same venue. Where a ticker
// covers several share classes the venue tells them apart before the name has
// to, and the name only has to settle what is left.
function resolveIsin(tickerCandidates, asset) {
  const candidates = tickerCandidates.get(asset.ticker) || [];
  if (candidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[asset.exchange];
  const sameVenue = venue
    ? candidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    isin: candidate.isin,
    kind: candidate.kind,
    ...scoreCandidate(asset.name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return winners.length === 1 ? winners[0] : null;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://app.alpaca.markets/trade/SPY";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("app.alpaca.markets")) ||
  (await browser.newPage());
if (!page.url().includes("app.alpaca.markets")) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to alpaca-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

// `--csv=PATH` overrides the fund list (defaults to etfs.csv),
// `--stocks-csv=PATH` the share list (defaults to stocks.csv),
// `--bonds-csv=PATH` the listed-note list (defaults to bonds.csv) and
// `--cryptos-csv=PATH` the coin list (defaults to cryptos.csv). Shares, funds
// and notes come out of the one `us_equity` book; crypto is a second class on
// the same endpoint. `--funds-only` answers for the funds alone; `--no-bonds`
// and `--no-crypto` leave those books out; `--crypto-only` answers for the
// pairs alone.
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

const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const bondsCsvPath = pathArg("bonds-csv", "../bonds.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const fundsOnly = hasFlag("funds-only");
const cryptoOnly = hasFlag("crypto-only");
const skipBonds = hasFlag("no-bonds") || fundsOnly || cryptoOnly;
const skipCrypto = hasFlag("no-crypto") || fundsOnly;
const skipEquities = cryptoOnly;

const tickerCandidates = skipEquities ? new Map() : loadTickerCandidatesFromCsv(csvPath, "ETF");
if (!fundsOnly && !skipEquities) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);
if (!skipBonds) loadTickerCandidatesFromCsv(bondsCsvPath, "BND", tickerCandidates);
const cryptoNames = skipCrypto ? new Map() : loadCryptoNames(cryptosCsvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));
const onlyPairs = new Set(
  positionalArgs.map((arg) => String(arg || "").trim().toUpperCase()).filter(Boolean)
);

const outputPath = new URL("alpaca-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query) seen.add(entry.query);
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

// Alpaca trades America alone, so a ticker the lists only carry abroad is a
// namesake of an American line rather than the instrument being looked for.
const MARKET_EXCHANGES = new Set(Object.values(EXCHANGE_NAMES));

const wanted = new Set();
if (!skipEquities) {
  for (const [ticker, candidates] of tickerCandidates) {
    if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;
    const exchanges = new Set(candidates.flatMap((candidate) => [...candidate.exchanges]));
    if (![...exchanges].some((exchange) => MARKET_EXCHANGES.has(exchange))) continue;
    wanted.add(ticker);
  }
  console.error(`${wanted.size} American tickers to look for`);
}
if (!skipCrypto) {
  console.error(`${cryptoNames.size} coins in the list to name crypto pairs against`);
}

// The app signs its calls with a token it renews on its own, so it is read off
// the app's own traffic rather than minted here.
let token = null;
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  if (!event.request.url.includes("alpaca.markets")) return;
  const sent = event.request.headers || {};
  const authorization = sent.Authorization || sent.authorization || "";
  if (authorization.startsWith("Bearer ")) token = authorization;
});

// The platform polls its own feeds every few seconds, so a token turns up on
// its own once a trading page is open; a reload hurries it along.
async function captureToken() {
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    for (let waited = 0; waited < 20000 && !token; waited += 250) await sleep(250);
    if (token) return true;

    await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(3000);
  }
  return Boolean(token);
}

if (!(await captureToken())) {
  throw new Error("Could not read Alpaca's API token. Is app.alpaca.markets signed in?");
}

// The whole American equity offer comes down in one answer, so there is
// nothing to page through and nothing to search for. Crypto is the same
// endpoint under `asset_class=crypto`. The Treasury and corporate books live
// on the Broker API, which this session is not subscribed to: asking them
// comes back 403.
async function loadAssets(assetClass) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await page.evaluate(
      async (authorization, cls) => {
        try {
          const response = await fetch(
            `https://app.alpaca.markets/api/v1/assets?status=active&asset_class=${cls}`,
            { headers: { Authorization: authorization } }
          );
          if (!response.ok) return { status: response.status };
          return { status: 200, rows: await response.json() };
        } catch (error) {
          return { status: 0 };
        }
      },
      token,
      assetClass
    );

    if (answer.status === 200 && Array.isArray(answer.rows)) return answer.rows;

    const stale = token;
    for (let waited = 0; waited < 30000 && token === stale; waited += 250) await sleep(250);
    if (token === stale) {
      token = null;
      await captureToken();
    }
  }

  return [];
}

let unmatched = 0;

if (!skipEquities) {
  const assets = await loadAssets("us_equity");
  if (assets.length === 0) {
    throw new Error("Alpaca returned no assets.");
  }
  console.error(`${assets.length} listings in Alpaca's book`);

  // Alpaca keeps delisted and broker-blocked shares in the book under the active
  // status, and marks what an account may actually place an order on.
  const onVenue = assets.filter((asset) =>
    EXCHANGE_NAMES[String(asset.exchange || "").toUpperCase()]
  );
  const dealable = onVenue.filter((asset) => asset.tradable);
  const refused = onVenue.length - dealable.length;
  const listings = dealable
    .filter((asset) => wanted.has(String(asset.symbol || "").toUpperCase()))
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
  console.error(
    `${dealable.length} of them can be dealt, ${refused} cannot; ` +
      `${listings.length} carry a ticker the lists know in America`
  );

  // What is left is dealable and has no line in either list, so it cannot be given
  // an ISIN here. Saying what shape it is turns a bare number into something that
  // can be acted on: rights and warrants are nobody's loss, preferred shares are.
  const unlisted = new Map();
  for (const asset of dealable) {
    if (wanted.has(String(asset.symbol || "").toUpperCase())) continue;
    if (onlyTickers.size > 0) continue;
    const shape = shapeOf(String(asset.symbol).toUpperCase(), String(asset.name || ""));
    unlisted.set(shape, (unlisted.get(shape) || 0) + 1);
  }
  if (unlisted.size > 0) {
    const total = [...unlisted.values()].reduce((sum, count) => sum + count, 0);
    console.error(`${total} dealable listings neither list names:`);
    for (const [shape, count] of [...unlisted].sort((a, b) => b[1] - a[1])) {
      console.error(`  ${String(count).padStart(5)} ${shape}`);
    }
  }

  for (const [index, asset] of listings.entries()) {
    if (index + 1 < startIndex) continue;

    const ticker = String(asset.symbol).toUpperCase();
    if (seen.has(ticker)) continue;

    const exchange = String(asset.exchange).toUpperCase();
    const name = String(asset.name || "").replace(/\s+/g, " ").trim();

    const candidate = resolveIsin(tickerCandidates, { ticker, name, exchange });
    if (!candidate) {
      unmatched += 1;
      continue;
    }

    if (fundsOnly && candidate.kind !== "ETF") continue;
    if (skipBonds && candidate.kind === "BND") continue;

    seen.add(ticker);
    const row = {
      query: ticker,
      ticker,
      name: name || candidate.name,
      exchange: EXCHANGE_NAMES[exchange],
      currency: "USD",
      type: candidate.kind,
      raw: [ticker, name, exchange].filter(Boolean).join(" "),
      isin: candidate.isin,
    };
    // Alpaca's own book: a PTP without a qualified notice cannot be bought by a
    // non-US account (10% IRS withholding on the whole sale). The ones that
    // carry an exception stay open to everyone and are not marked.
    if ((asset.attributes || []).includes("ptp_no_exception")) row.usResidentsOnly = true;
    results.push(row);
  }
}

if (!skipCrypto) {
  const coins = await loadAssets("crypto");
  const dealable = coins.filter((asset) => asset.tradable);
  console.error(
    `${coins.length} crypto pairs listed, ${dealable.length} of them still dealable`
  );

  function cryptoWanted(symbol) {
    if (onlyTickers.size === 0 && onlyPairs.size === 0) return true;
    const pair = String(symbol || "").toUpperCase();
    const base = cryptoBase(pair);
    return onlyPairs.has(pair) || onlyTickers.has(base) || onlyTickers.has(pair);
  }

  let unnamed = 0;
  const pairs = dealable
    .filter((asset) => cryptoWanted(asset.symbol))
    .sort((left, right) => String(left.symbol).localeCompare(String(right.symbol)));

  for (const asset of pairs) {
    const ticker = String(asset.symbol).toUpperCase();
    if (seen.has(ticker)) continue;

    const base = cryptoBase(ticker);
    const quote = cryptoQuote(ticker);
    const listed = cryptoNames.get(base);
    if (!listed) unnamed += 1;

    const name = String(asset.name || "")
      .replace(/\s+/g, " ")
      .trim();

    seen.add(ticker);
    results.push({
      query: ticker,
      ticker,
      name: listed || name,
      exchange: "CRYPTO",
      currency: quote || "USD",
      type: "CRYPTO",
      raw: [ticker, name, base, quote].filter(Boolean).join(" "),
      // A spot pair is not a security: there is no ISIN to file it under.
      isin: null,
    });
  }

  if (unnamed > 0) {
    console.error(`${unnamed} pairs are named by Alpaca alone; their base coin is not in cryptos.csv`);
  }
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
let usOnly = 0;
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  if (row.usResidentsOnly) usOnly += 1;
}
console.error(
  `${results.length} matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ` +
    `${unmatched} on a listed ticker the wording could not settle`
);
if (usOnly > 0) {
  console.error(`${usOnly} of them are US-residents only (PTP, no qualified notice)`);
}
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
