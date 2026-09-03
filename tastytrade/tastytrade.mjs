import puppeteer from "puppeteer-core";
import fs from "node:fs";

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").split(/[/]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// tastytrade names venues by their ISO code; the CSV files NYSE Arca, NYSE
// American and Cboe under the exchanges that own them.
const EXCHANGE_NAMES = {
  ARCX: "AMEX",
  XASE: "AMEX",
  BATS: "CBOE",
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  OTC: "OTC",
};

const AMERICAN_VENUES = new Set(Object.values(EXCHANGE_NAMES));

// An ISIN is its CUSIP with the country in front and a check digit behind, so
// the number tastytrade files an instrument under names it outright and spares
// the guesswork of comparing wordings.
function isinFrom(country, cusip) {
  const body = `${country}${(cusip || "").trim().toUpperCase()}`;
  if (!/^[A-Z]{2}[0-9A-Z]{9}$/.test(body)) return "";

  const digits = [...body]
    .map((character) => (/[0-9]/.test(character) ? character : String(character.charCodeAt(0) - 55)))
    .join("");

  let sum = 0;
  let double = true;
  for (let position = digits.length - 1; position >= 0; position -= 1) {
    let digit = Number(digits[position]);
    if (double) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
    sum += digit;
    double = !double;
  }

  return `${body}${(10 - (sum % 10)) % 10}`;
}

// Both readings of that number, because neither rule holds on its own. A fund
// or an American company is a US line. A foreign issuer is filed under a CINS,
// built the same way but belonging to the country it is incorporated in: Jin
// Medical's G5140V120 is KYG5140V1207. Yet the depositary receipt of that same
// company is itself an American security with an American ISIN, so both
// readings are offered and whichever one the CSV knows wins.
function candidateIsins(instrument) {
  const country = String(instrument["country-of-incorporation"] || "").toUpperCase();
  const countries = country && country !== "US" && /^[A-Z]{2}$/.test(country) ? ["US", country] : ["US"];
  return countries.map((code) => isinFrom(code, instrument.cusip)).filter(Boolean);
}

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
function loadCsv(csvPath) {
  const byTicker = new Map();
  const namesByIsin = new Map();
  if (!fs.existsSync(csvPath)) return { byTicker, namesByIsin };

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    // Third column in the four-column files, second in the three-column ones.
    // Searching from the left would find the wrong one on Luxembourg's bond
    // lines, where the ticker is the ISIN itself and the name would then be
    // read as everything after the ticker, venue and number included.
    const isinIndex = toIsin(columns[2])
      ? 2
      : columns.findIndex((column, index) => index > 0 && Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = (columns[isinIndex - 1] || "").trim().toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    if (!namesByIsin.has(isin)) namesByIsin.set(isin, name);

    const candidates = byTicker.get(ticker) || [];
    byTicker.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({ isin, names: [name], exchanges: new Set(exchange ? [exchange] : []) });
    }
  }

  return { byTicker, namesByIsin };
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
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE", "CO",
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

function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// A company's common shares, its preferred series, its warrants and its rights
// are different securities that share a name -- and, once a ticker loses its
// suffix on the way into the lists, a ticker too: "AMEX:BCV/PA" is filed under
// BCV, beside the common line it is not. So before a wording is allowed to
// settle anything, both sides have to be the same kind of thing.
const CLASS_MARKERS = [
  ["PREFERRED", /\b(PREFERRED|PFD|PRF)\b/],
  ["WARRANT", /\b(WARRANTS?|WTS?)\b/],
  ["RIGHT", /\bRIGHTS?\b/],
  ["UNIT", /\bUNITS?\b/],
  ["NOTE", /\b(NOTES?|ETNS?|DEBENTURES?)\b/],
];

function shareClass(name) {
  const text = (name || "").toUpperCase();
  return CLASS_MARKERS.filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label)
    .join("+");
}

// Only for the instruments tastytrade files without a usable CUSIP. Where a
// ticker covers several listings the venue tells them apart before the name
// has to.
//
// What counts as eligible differs by kind. A fund on offer here is an American
// share class, so its ISIN says US outright. A company, on the other hand, can
// be incorporated in the Caymans and still trade on Nasdaq, so for shares it is
// the venue that has to be American and not the ISIN -- otherwise the Danish
// line of a company whose receipt trades in New York would answer for it.
function resolveByName(byTicker, listing, { fund }) {
  // Without a wording there is nothing to corroborate a match with, and
  // tastytrade leaves a few of its listings undescribed.
  if (!listing.name) return null;

  const pool = byTicker.get(listing.ticker) || [];
  const eligible = fund
    ? pool.filter((candidate) => candidate.isin.startsWith("US"))
    : pool.filter((candidate) =>
        [...candidate.exchanges].some((exchange) => AMERICAN_VENUES.has(exchange))
      );

  // Among shares the suffix-stripped ticker collects the whole family, so the
  // kind has to agree. Funds are spared the test: "Units" is an ordinary word
  // in a fund's name and means nothing by it.
  const kind = shareClass(listing.name);
  const sameKind = fund
    ? eligible
    : eligible
        .map((candidate) => ({
          ...candidate,
          names: candidate.names.filter((name) => shareClass(name) === kind),
        }))
        .filter((candidate) => candidate.names.length > 0);
  if (sameKind.length === 0) return null;

  const venue = EXCHANGE_NAMES[listing.exchange];
  const sameVenue = venue ? sameKind.filter((candidate) => candidate.exchanges.has(venue)) : [];
  const candidates = sameVenue.length > 0 ? sameVenue : sameKind;

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(listing.name, candidate),
  }));

  // A lone candidate used to be taken on trust. It is not enough: a nameless or
  // unrelated line under a shared ticker would inherit an ISIN that belongs to
  // another security, so every match has to earn its wording.
  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const shortlist = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return shortlist.length === 1 ? shortlist[0] : null;
}

// `--csv=PATH` overrides the fund list (defaults to etfs.csv),
// `--stocks-csv=PATH` the share list (defaults to stocks.csv) and
// `--cryptos-csv=PATH` the coin list (defaults to cryptos.csv). Shares and
// funds come out of the one equities book; crypto is a second endpoint.
// `--funds-only` answers for the funds alone; `--no-crypto` leaves the pairs
// out; `--crypto-only` answers for the pairs alone.
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
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const fundsOnly = hasFlag("funds-only");
const cryptoOnly = hasFlag("crypto-only");
const skipCrypto = hasFlag("no-crypto") || fundsOnly;
const skipEquities = cryptoOnly;

// Naming tickers on the command line narrows a run down to those, which is
// handy for checking one fund without waiting on the whole book.
const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter(Boolean)
);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://my.tastytrade.com/app.html";

const pages = await browser.pages();
const page =
  pages.find((candidate) => /tastytrade|tastyworks/i.test(candidate.url())) ||
  (await browser.newPage());
if (!/tastytrade|tastyworks/i.test(page.url())) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// The session no longer travels as a bearer token: it lives in a cookie the
// page cannot read, and the API guards it by insisting on a header no other
// origin could set. So the calls are made from inside the page, which sends the
// cookie for us, and the header is sent for the guard's sake -- its value is
// never checked, only its presence.
async function fetchJson(url, what) {
  const answer = await page.evaluate(async (target) => {
    try {
      const response = await fetch(target, {
        credentials: "include",
        headers: { Accept: "application/json", "X-Tastyworks-CSRF": "1" },
      });
      if (!response.ok) return { status: response.status, error: (await response.text()).slice(0, 200) };
      return { status: 200, body: await response.json() };
    } catch (error) {
      return { status: 0, error: String(error) };
    }
  }, url);

  if (answer?.status === 401 || answer?.status === 403) {
    throw new Error(`tastytrade would not answer for this session. Sign in at ${APP_URL} and run this again.`);
  }
  if (answer?.status !== 200) {
    throw new Error(`tastytrade answered ${answer?.status} for ${what}: ${answer?.error || ""}`);
  }
  return answer.body;
}

async function fetchJsonOrNull(url, what) {
  try {
    return await fetchJson(url, what);
  } catch (error) {
    console.error(String(error.message || error));
    return null;
  }
}

const cryptoNames = skipCrypto ? new Map() : loadCryptoNames(cryptosCsvPath);
if (!skipCrypto) {
  console.error(`${cryptoNames.size} coins in the list to name crypto pairs against`);
}

const results = [];
const seen = new Set();
let byCusip = 0;
let byName = 0;
let unmatched = 0;

if (!skipEquities) {
  // Everything tastytrade trades in shares comes down a page at a time, so the
  // offer is read whole instead of a search per ticker.
  //
  // Fixed income is left out on purpose. tastytrade does sell Treasuries, on a
  // screen of their own that `/instruments/fixed-income-securities` feeds, but the
  // offer is 49 bills of which six mature beyond six months, the smallest ticket
  // is ten bills of $1,000 face, and notes and bonds are bought by reading a CUSIP
  // to the trade desk rather than off any screen.
  const instruments = [];
  for (let offset = 0; offset < 100; offset += 1) {
    const body = await fetchJson(
      `https://api.tastytrade.com/instruments/equities/active?per-page=1000&page-offset=${offset}`,
      `equity page ${offset}`
    );
    const items = body?.data?.items || [];
    instruments.push(...items);

    const totalPages = body?.pagination?.["total-pages"] || 0;
    console.error(`  ${instruments.length} instruments read`);
    if (items.length === 0 || offset + 1 >= totalPages) break;
  }

  const open = instruments.filter(
    (instrument) => instrument.active && !instrument["is-closing-only"]
  );
  console.error(
    `${instruments.length} instruments offered, ${instruments.length - open.length} of them closing-only`
  );

  const funds = loadCsv(csvPath);
  const shares = fundsOnly ? { byTicker: new Map(), namesByIsin: new Map() } : loadCsv(stocksCsvPath);
  console.error(
    `${funds.namesByIsin.size} funds and ${shares.namesByIsin.size} shares in the lists to match against`
  );

  // Which list an ISIN turns up in is what says whether a line is a fund or a
  // company, and it is a better witness than tastytrade's own `is-etf` flag: that
  // flag misses newly launched funds, and calls a closed-end fund a share.
  function matchByIsin(instrument) {
    for (const isin of candidateIsins(instrument)) {
      if (funds.namesByIsin.has(isin)) {
        return { isin, name: funds.namesByIsin.get(isin), type: "ETF" };
      }
      if (shares.namesByIsin.has(isin)) {
        return { isin, name: shares.namesByIsin.get(isin), type: "STOCK" };
      }
    }
    return null;
  }

  for (const instrument of open.sort((left, right) =>
    String(left.symbol).localeCompare(String(right.symbol))
  )) {
    const ticker = String(instrument.symbol || "").toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

    const exchange = String(instrument["listed-market"] || "").toUpperCase();
    const name = String(instrument.description || instrument["short-description"] || "")
      .replace(/\s+/g, " ")
      .trim();

    const isFund = Boolean(instrument["is-etf"]);
    let candidate = matchByIsin(instrument);
    if (candidate) {
      byCusip += 1;
    } else {
      if (fundsOnly && !isFund) continue;
      const book = isFund ? funds : shares;
      const resolved = resolveByName(book.byTicker, { ticker, name, exchange }, { fund: isFund });
      candidate = resolved ? { ...resolved, type: isFund ? "ETF" : "STOCK" } : null;
      if (candidate) byName += 1;
    }

    if (!candidate) {
      unmatched += 1;
      continue;
    }
    if (fundsOnly && candidate.type !== "ETF") continue;

    seen.add(ticker);
    results.push({
      query: ticker,
      ticker,
      name: name || candidate.name,
      exchange: EXCHANGE_NAMES[exchange] || exchange || null,
      currency: "USD",
      type: candidate.type,
      raw: [ticker, name, exchange].filter(Boolean).join(" "),
      isin: candidate.isin,
    });
  }
}

if (!skipCrypto) {
  const body = await fetchJsonOrNull(
    "https://api.tastytrade.com/instruments/cryptocurrencies",
    "cryptocurrencies"
  );
  const coins = body?.data?.items || [];
  const dealable = coins.filter((item) => item.active && !item["is-closing-only"]);
  console.error(
    `${coins.length} crypto pairs listed, ${coins.length - dealable.length} of them closing-only`
  );

  function cryptoWanted(symbol) {
    if (onlyTickers.size === 0) return true;
    const pair = String(symbol || "").toUpperCase();
    const base = cryptoBase(pair);
    return onlyTickers.has(pair) || onlyTickers.has(base);
  }

  let unnamed = 0;
  for (const item of dealable
    .filter((coin) => cryptoWanted(coin.symbol))
    .sort((left, right) => String(left.symbol).localeCompare(String(right.symbol)))) {
    const ticker = String(item.symbol).toUpperCase();
    if (seen.has(ticker)) continue;

    const base = cryptoBase(ticker);
    const quote = cryptoQuote(ticker);
    const listed = cryptoNames.get(base);
    if (!listed) unnamed += 1;

    const name = String(item["short-description"] || item.description || "")
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
      isin: null,
    });
  }

  if (unnamed > 0) {
    console.error(`${unnamed} pairs are named by tastytrade alone; their base coin is not in cryptos.csv`);
  }
}

fs.writeFileSync(new URL("tastytrade-parsed.json", import.meta.url), JSON.stringify(results, null, 2));

const matchedFunds = results.filter((row) => row.type === "ETF").length;
const matchedShares = results.filter((row) => row.type === "STOCK").length;
const matchedCrypto = results.filter((row) => row.type === "CRYPTO").length;
console.error(
  `${results.length} matched: ${matchedFunds} funds, ${matchedShares} shares and ${matchedCrypto} crypto. ` +
    `${byCusip} were named by their CUSIP and ${byName} by their wording; ${unmatched} are in neither list`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
