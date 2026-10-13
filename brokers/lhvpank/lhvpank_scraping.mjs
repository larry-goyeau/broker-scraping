// What LHV Pank sells in shares and listed funds, with no login.
// The public search is the book. The securities FAQ calls it the database
// of every share LHV trades, and an ETF sits in the same table. An empty
// search is the whole list, paged. The page prints the symbol, the name
// and the exchange. It does not print a currency or an ISIN. A place
// that quotes every title in one currency gets that currency. Where the
// same title is quoted in more than one currency, the row is repeated
// once for each of those currencies, and once for each deposit currency
// the title is also quoted in. The ISIN is filled from the shared lists
// when the symbol and the place agree. A Xetra symbol takes its trading
// currency from Deutsche Börse's list of tradable instruments. A symbol
// whose list ticker ends in .EUR, .USD, .CHF or .GBP takes that currency.
// A symbol still without one is read from its Onvista quote, on that place.
//
// A US-registered ETF, ETC, ETN or ETP is in the database. The FAQ gives
// purchase and sale of those funds to a professional client only. That
// limit is the remark. An ETF on a European exchange has none.
//
//   https://www.lhv.ee/en/faq/securities-transactions/
//   https://www.lhv.ee/search/shortname.cfm?l3=en&submit=1
//
//   node brokers/lhvpank/lhvpank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { loadCurrencyEvidence } from "../N26/N26_scraping.mjs";
import fs from "node:fs";

const SEARCH = "https://www.lhv.ee/search/shortname.cfm";
const OUTPUT = new URL("lhvpank-parsed.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// One currency for the whole place. The others quote one title in more
// than one currency, and the search does not say which.
const CURRENCY = {
  "Tallinn Stock Exchange": "EUR",
  "Riga Stock Exchange": "EUR",
  "Vilnius Stock Exchange": "EUR",
  "Helsinki Stock Exchange": "EUR",
  "Stockholm Stock Exchange": "SEK",
  "American Stock Exchange": "USD",
  NASDAQ: "USD",
  "New York Stock Exchange": "USD",
  "Australian Securities Exchange": "AUD",
  "Budapest Stock Exchange": "HUF",
  "Copenhagen Stock Exchange": "DKK",
  "Mexican Stock Exchange": "MXN",
  "Milano Stock Exchange": "EUR",
  "Moscow Exchange": "RUB",
  "Oslo Stock Exchange": "NOK",
  "Sistema De Interconexion Bursatil Espanol": "EUR",
  "Tokyo Stock Exchange": "JPY",
  "Toronto Stock Exchange": "CAD",
  "Vienna Stock Exchange": "EUR",
  "Warsaw Stock Exchange": "PLN",
};

const SEVERAL = new Set([
  "XETRA",
  "Swiss Exchange",
  "London Stock Exchange",
  "London Stock Exchange IOB",
  "Hong Kong Exchanges",
  "Singapore Exchange",
  "Euronext Paris Monep",
  "Society des Bourses Francaises",
  "NYSE Euronext Amsterdam",
  "NYSE Euronext Brussels",
  "NYSE Euronext Lisbon",
]);

const US = new Set(["American Stock Exchange", "NASDAQ", "New York Stock Exchange"]);

// Cash the client can leave on an LHV account. Foreign payments name the
// first list. Trader transfers between the client's own accounts name the
// second, which adds the rouble and the New Zealand dollar.
// https://www.lhv.ee/en/payments
// https://www.lhv.ee/en/faq/trader/
const DEPOSIT = new Set([
  "AUD", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "JPY",
  "NOK", "NZD", "PLN", "RON", "RUB", "SEK", "USD",
]);

// Place codes in the shared stock and ETF lists. The search prints a
// name the venue resolver does not always accept, so the ISIN lookup
// uses these codes directly.
const LIST_PLACES = {
  "Tallinn Stock Exchange": ["OMXTSE"],
  "Riga Stock Exchange": ["OMXRSE"],
  "Vilnius Stock Exchange": ["OMXVSE"],
  "Helsinki Stock Exchange": ["OMXHEX"],
  "Stockholm Stock Exchange": ["OMXSTO"],
  "American Stock Exchange": ["AMEX"],
  NASDAQ: ["NASDAQ"],
  "New York Stock Exchange": ["NYSE"],
  XETRA: ["XETR"],
  "Australian Securities Exchange": ["ASX"],
  "Budapest Stock Exchange": ["BET"],
  "Copenhagen Stock Exchange": ["OMXCOP"],
  "Euronext Paris Monep": ["EURONEXT"],
  "Hong Kong Exchanges": ["HKEX"],
  "London Stock Exchange": ["LSE"],
  "London Stock Exchange IOB": ["LSE"],
  "Mexican Stock Exchange": ["BMV"],
  "Milano Stock Exchange": ["MIL"],
  "Moscow Exchange": ["RUS"],
  "NYSE Euronext Amsterdam": ["EURONEXT"],
  "NYSE Euronext Brussels": ["EURONEXT"],
  "NYSE Euronext Lisbon": ["EURONEXT"],
  "Oslo Stock Exchange": ["OSL"],
  "Singapore Exchange": ["SGX"],
  "Sistema De Interconexion Bursatil Espanol": ["BME"],
  "Society des Bourses Francaises": ["EURONEXT"],
  "Swiss Exchange": ["SIX"],
  "Tokyo Stock Exchange": ["TSE"],
  "Toronto Stock Exchange": ["TSX"],
  "Vienna Stock Exchange": ["VIE"],
  "Warsaw Stock Exchange": ["GPW"],
};

const MIC = {
  XETRA: "XETR",
  "Swiss Exchange": "XSWX",
  "London Stock Exchange": "XLON",
  "London Stock Exchange IOB": "XLON",
  "Hong Kong Exchanges": "XHKG",
  "Singapore Exchange": "XSES",
  "Euronext Paris Monep": "XPAR",
  "Society des Bourses Francaises": "XPAR",
  "NYSE Euronext Amsterdam": "XAMS",
  "NYSE Euronext Brussels": "XBRU",
  "NYSE Euronext Lisbon": "XLIS",
};

const ROW = /<td[^>]*>\s*([^<]*?)\s*<\/td>\s*<td[^>]*>\s*([^<]*?)\s*<\/td>\s*<td[^>]*>\s*([^<]*?)\s*<\/td>/g;

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function listingType(name) {
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETPs?\b/i.test(name)) return "ETP";
  if (/\bETFs?\b/i.test(name)) return "ETF";
  return "STOCK";
}

async function textOf(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`LHV answered ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      if (!response.ok) throw new Error(`LHV answered ${response.status}`);
      return await response.text();
    } catch (error) {
      last = error;
      if (attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw last;
}

function pageUrl(page) {
  const url = new URL(SEARCH);
  url.searchParams.set("l3", "en");
  url.searchParams.set("submit", "1");
  url.searchParams.set("type", "12001");
  if (page > 1) url.searchParams.set("page", String(page));
  return url;
}

function rowsOf(html) {
  const rows = [];
  for (const match of html.matchAll(ROW)) {
    const ticker = decode(match[1]).toUpperCase();
    const name = decode(match[2]);
    const exchange = decode(match[3]);
    if (!ticker || ticker === "SYMBOL" || !name || !exchange) continue;
    if (!CURRENCY[exchange] && !SEVERAL.has(exchange)) continue;
    rows.push({ ticker, name, exchange });
  }
  return rows;
}

function lastPage(html) {
  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1]));
  return pages.length ? Math.max(...pages) : 1;
}

const first = await textOf(pageUrl(1));
const last = lastPage(first);
if (last < 40) throw new Error(`LHV search published ${last} pages`);
const pages = [first];
const rest = [];
const concurrency = 6;
let next = 2;
async function worker() {
  for (;;) {
    const page = next;
    next += 1;
    if (page > last) return;
    rest[page] = await textOf(pageUrl(page));
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
for (let page = 2; page <= last; page++) pages.push(rest[page]);

const seen = new Set();
const results = [];
for (const html of pages) {
  for (const row of rowsOf(html)) {
    const type = listingType(row.name);
    const id = `${row.ticker}:${row.exchange}:${type}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const currency = CURRENCY[row.exchange] || "";
    const item = {
      query: row.ticker,
      ticker: row.ticker,
      name: row.name,
      exchange: row.exchange,
      currency,
      type,
      raw: [row.ticker, row.name, row.exchange, currency].filter(Boolean).join(" "),
      isin: "",
    };
    if (type !== "STOCK" && US.has(row.exchange)) item.remark = "Reserved for professional clients.";
    results.push(item);
  }
}

function cleanCurrency(currency) {
  const ccy = String(currency || "").toUpperCase();
  return ccy === "GBX" ? "GBP" : ccy;
}

const GERMAN = ["XETR", "XMUN", "XGAT", "XFRA", "XHAM", "XSTU", "XQTX", "XHAN"];

function rowIsins(row) {
  const ids = new Set();
  const own = String(row.isin || "").toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(own)) ids.add(own);
  for (const token of row.matches || []) {
    const text = String(token || "").toUpperCase();
    if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(text)) ids.add(text);
  }
  return [...ids];
}

function currenciesOn(keys, isin, listed, books) {
  const have = new Set();
  for (const key of keys) {
    const counts = listed.get(`${key}|${isin}`);
    if (counts) for (const [ccy, n] of counts) if (n >= 1) have.add(cleanCurrency(ccy));
    const book = books.get(`${key}|${isin}`);
    if (book) for (const ccy of book) have.add(cleanCurrency(ccy));
  }
  return have;
}

function quoteCurrencies(row, listed, books, extra) {
  const have = new Set();
  const own = cleanCurrency(row.currency);
  if (own) have.add(own);
  const resolved = resolveVenue(row);
  const keys = new Set();
  if (resolved.venue?.mic) keys.add(resolved.venue.mic);
  if (MIC[row.exchange]) keys.add(MIC[row.exchange]);
  for (const isin of rowIsins(row)) {
    for (const ccy of currenciesOn(keys, isin, listed, books)) have.add(ccy);
  }
  if (extra) for (const ccy of extra(row)) have.add(ccy);
  // A foreign name on Xetra is quoted in euros on the German books even
  // when Xetra itself has only one mention of that currency.
  if (!have.size && row.exchange === "XETRA") {
    for (const isin of rowIsins(row)) {
      const german = currenciesOn(GERMAN, isin, listed, books);
      if (german.has("EUR")) have.add("EUR");
    }
  }
  return have;
}

// One line for the currency the title is quoted in, and one line for each
// deposit currency that same title is also quoted in on that place.
function withCurrencies(rows, listed, books, extra) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const own = cleanCurrency(row.currency);
    const have = quoteCurrencies(row, listed, books, extra);
    const wanted = new Set();
    if (own) wanted.add(own);
    for (const ccy of have) {
      if (!own || ccy === own || DEPOSIT.has(ccy)) wanted.add(ccy);
    }
    if (!wanted.size) wanted.add("");
    for (const currency of wanted) {
      const id = `${row.exchange}|${row.ticker}|${row.type}|${currency}|${String(row.isin || "").toUpperCase()}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        ...row,
        currency,
        raw: [row.ticker, row.name, row.exchange, currency].filter(Boolean).join(" "),
      });
    }
  }
  return out;
}

const GENERIC = new Set(["SHARES", "ETF", "ETFS", "UCITS", "FUND", "FUNDS", "GROUP", "INDEX", "CLASS"]);

function nameTokens(name) {
  return new Set(
    String(name || "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length >= 5 && !GENERIC.has(token))
  );
}

// The same title is often listed on several places under one ticker, and
// only one of those rows matched an ISIN. The others borrow it when the
// names share a word, so each place can be split by the currencies that
// title is quoted in.
function borrowIsin(rows) {
  const byTicker = new Map();
  for (const row of rows) {
    const list = byTicker.get(row.ticker) || [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }
  for (const list of byTicker.values()) {
    const donors = list.filter((row) => row.isin);
    for (const row of list) {
      if (row.isin) continue;
      const mine = nameTokens(row.name);
      const hits = new Set();
      for (const donor of donors) {
        if ([...mine].some((token) => nameTokens(donor.name).has(token))) hits.add(donor.isin);
      }
      if (hits.size === 1) row.isin = [...hits][0];
    }
  }
}

function loadListBook() {
  const byPlace = new Map();
  const byTicker = new Map();
  for (const file of ["../../assets/etfs.csv", "../../assets/stocks.csv"]) {
    const csvPath = new URL(file, import.meta.url);
    if (!fs.existsSync(csvPath)) continue;
    for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const columns = line.split(",");
      const ticker = String(columns[0] || "").trim().toUpperCase().split(":").pop();
      const place = String(columns[1] || "").trim().toUpperCase();
      const isin = String(columns[2] || "").trim().toUpperCase();
      if (!ticker || !place || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
      const key = `${place}|${ticker}`;
      if (!byPlace.has(key)) byPlace.set(key, new Set());
      byPlace.get(key).add(isin);
      if (!byTicker.has(ticker)) byTicker.set(ticker, new Map());
      const places = byTicker.get(ticker);
      if (!places.has(place)) places.set(place, new Set());
      places.get(place).add(isin);
    }
  }
  return { byPlace, byTicker };
}

// The shared lists write the Swiss (and some other) trading currency after
// the symbol: SIX:CSGLDE.EUR. The search prints the symbol without it.
function suffixCurrencies(book) {
  const index = new Map();
  for (const [key, isins] of book.byPlace) {
    const bar = key.indexOf("|");
    const place = key.slice(0, bar);
    const ticker = key.slice(bar + 1);
    const match = ticker.match(/^(.*)\.(EUR|USD|CHF|GBP|GBX)$/);
    if (!match || !match[1]) continue;
    const id = `${place}|${match[1]}`;
    const entry = index.get(id) || { currencies: new Set(), isins: new Set() };
    entry.currencies.add(match[2] === "GBX" ? "GBP" : match[2]);
    for (const isin of isins) entry.isins.add(isin);
    index.set(id, entry);
  }
  return index;
}

async function xetraCurrencies() {
  const page = await textOf("https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra");
  const href = page.match(/href="(https:\/\/www\.cashmarket\.deutsche-boerse\.com\/resource\/blob\/[^"]+allTradableInstruments\.csv)"/);
  if (!href) throw new Error("Deutsche Börse did not link the Xetra instrument file");
  const csv = await textOf(href[1]);
  const lines = csv.split(/\r?\n/);
  const header = (lines[2] || "").split(";");
  const mnemonic = header.indexOf("Mnemonic");
  const isinCol = header.indexOf("ISIN");
  const currency = header.indexOf("Currency");
  if (mnemonic < 0 || isinCol < 0 || currency < 0) throw new Error("Xetra instrument columns moved");
  const map = new Map();
  for (const line of lines.slice(3)) {
    const cols = line.split(";");
    if (cols[0] !== "Active") continue;
    const symbol = String(cols[mnemonic] || "").trim().toUpperCase();
    const ccy = cleanCurrency(cols[currency]);
    if (!symbol || !/^[A-Z]{3}$/.test(ccy)) continue;
    const entry = map.get(symbol) || { currencies: new Set(), isins: new Set() };
    entry.currencies.add(ccy);
    const isin = String(cols[isinCol] || "").trim().toUpperCase();
    if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) entry.isins.add(isin);
    map.set(symbol, entry);
  }
  return map;
}

function listedHit(row, suffixes) {
  const found = { currencies: new Set(), isins: new Set() };
  for (const place of LIST_PLACES[row.exchange] || []) {
    const hit = suffixes.get(`${place}|${row.ticker}`);
    if (!hit) continue;
    for (const ccy of hit.currencies) found.currencies.add(ccy);
    for (const isin of hit.isins) found.isins.add(isin);
  }
  return found;
}

// One ISIN from the Xetra file, or from a suffixed list ticker, fills a
// row the place lookup missed. Several codes are left for matches.
function applyKnownIsins(rows, xetra, suffixes) {
  let filled = 0;
  for (const row of rows) {
    if (row.isin || row.matches?.length) continue;
    const isins = new Set();
    if (row.exchange === "XETRA") {
      const hit = xetra.get(row.ticker);
      if (hit) for (const isin of hit.isins) isins.add(isin);
    }
    for (const isin of listedHit(row, suffixes).isins) isins.add(isin);
    if (isins.size !== 1) continue;
    row.isin = [...isins][0];
    filled += 1;
  }
  return filled;
}

function extraCurrencies(row, xetra, suffixes) {
  const have = new Set();
  if (row.exchange === "XETRA") {
    const hit = xetra.get(row.ticker);
    if (hit) for (const ccy of hit.currencies) have.add(ccy);
  }
  for (const ccy of listedHit(row, suffixes).currencies) have.add(ccy);
  return have;
}

const ONVISTA_EXCHANGE = {
  XETRA: ["Xetra"],
  "Swiss Exchange": ["Swiss Exchange"],
  "London Stock Exchange": ["London Stock Exchange"],
  "London Stock Exchange IOB": ["London Stock Exchange"],
  "NYSE Euronext Amsterdam": ["Amsterdam"],
  "NYSE Euronext Brussels": ["Brussels", "Brüssel", "Euronext Brussels"],
  "NYSE Euronext Lisbon": ["Lisbon"],
  "Euronext Paris Monep": ["Paris"],
  "Society des Bourses Francaises": ["Paris"],
};

const GERMAN_VENUES = new Set([
  "Xetra", "gettex", "Tradegate BSX", "LS Exchange", "Quotrix", "Stuttgart",
  "Frankfurt", "Düsseldorf", "Hamburg", "Hannover", "München",
]);

function plainName(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/\b(PLC|SA|NV|AG|LTD|INC|CORP|THE|CO|SE|UCITS|ETF|ETFS)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesAgree(left, right) {
  const a = plainName(left);
  const b = plainName(right);
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  const word = a.split(" ").find((part) => part.length >= 3);
  if (word && b.split(" ").includes(word)) return true;
  const tokens = (text) => text.split(" ").filter((token) => token.length >= 5 && !GENERIC.has(token));
  const theirs = new Set(tokens(b));
  return tokens(a).some((token) => theirs.has(token));
}

function derivative(name) {
  return /\b(ADR|GDR|CDR|SDR)\b/i.test(name);
}

function queryName(name, dropGroup) {
  const group = dropGroup ? "|Group|Holdings|Holding" : "";
  return String(name || "")
    .replace(new RegExp(`\\b(The|PLC|Inc|AG|Ltd|Corp|CO|UCITS|ETF|ETFs|SE|SA|NV|SpA|S\\.p\\.A\\.|W/I${group})\\b`, "gi"), " ")
    .replace(/&/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function oneOff(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) !== 1 || Math.min(left.length, right.length) < 6) return false;
  const [short, long] = left.length < right.length ? [left, right] : [right, left];
  for (let skip = 0; skip < long.length; skip++) {
    if (`${long.slice(0, skip)}${long.slice(skip + 1)}` === short) return true;
  }
  return false;
}

function longWords(name) {
  return plainName(name).split(" ").filter((word) => word.length >= 5);
}

function distribution(name) {
  const text = plainName(name);
  if (/\bACC\b/.test(text)) return "ACC";
  if (/\bDIS\b|\bDIST\b/.test(text)) return "DIS";
  return "";
}

function nameCovers(left, right) {
  const a = longWords(left);
  const b = longWords(right);
  if (!a.length || !b.length) return false;
  if (a.length === 1 && a[0].length < 7) return false;
  const marker = distribution(left);
  if (marker && distribution(right) && distribution(right) !== marker) return false;
  const marks = [...String(left).toUpperCase().matchAll(/\d+(?:[.-]\d+)?/g)].map((match) => match[0]);
  if (marks.some((mark) => !String(right).toUpperCase().includes(mark))) return false;
  return a.every((word) => b.some((other) => word === other || oneOff(word, other)));
}

function normSymbol(symbol) {
  return String(symbol || "").toUpperCase().replace(/\.(L|A)$/, "").replace(/\./g, "");
}

async function onvistaSearch(query) {
  const response = await fetch(`https://api.onvista.de/api/v1/instruments/search?searchValue=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.list || [];
}

function listedShare(item) {
  return /^(Aktie|ETF|ETP)$/.test(item.displayType || "");
}

function matchSymbol(list, ticker, name) {
  const wanted = normSymbol(ticker);
  const label = (item) => item.name || item.tinyName;
  const exact = list.filter((item) => normSymbol(item.symbol) === wanted && namesAgree(name, label(item)));
  if (exact.length === 1) return { item: exact[0], symbolMatch: true };
  const home = list.filter((item) => normSymbol(item.homeSymbol) === wanted && namesAgree(name, label(item)));
  const plain = home.filter((item) => !derivative(label(item)) || derivative(name));
  return plain.length === 1 ? { item: plain[0], symbolMatch: true } : null;
}

async function searchByName(name, ticker) {
  let query = queryName(name, false);
  for (let attempt = 0; attempt < 4 && query && normSymbol(query) !== normSymbol(ticker); attempt++) {
    const list = await onvistaSearch(query);
    const chosen = matchSymbol(list, ticker, name) || matchName(list, name);
    if (chosen) return chosen;
    if (list.length) break;
    const words = query.split(" ");
    if (words.length <= 3) break;
    query = words.slice(0, -1).join(" ");
  }
  const shorter = queryName(name, true);
  if (!shorter || shorter === queryName(name, false)) return null;
  const list = await onvistaSearch(shorter);
  return matchSymbol(list, ticker, name) || matchName(list, name);
}

function matchName(list, name) {
  if (/\b(warrant|right)s?\b/i.test(name)) return null;
  const hits = list.filter((item) => listedShare(item) && (!derivative(item.name) || derivative(name)) && nameCovers(name, item.name || item.tinyName));
  return hits.length === 1 ? { item: hits[0], symbolMatch: false } : null;
}

async function onvistaQuotes(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) return new Map();
  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
  if (!match) return new Map();
  const snap = JSON.parse(match[1])?.props?.pageProps?.data?.snapshot;
  const by = new Map();
  for (const quote of snap?.quoteList?.list || []) {
    const exchange = quote.market?.nameExchange;
    const ccy = cleanCurrency(quote.isoCurrency);
    if (!exchange || !/^[A-Z]{3}$/.test(ccy)) continue;
    if (!by.has(exchange)) by.set(exchange, new Set());
    by.get(exchange).add(ccy);
  }
  return by;
}

function currenciesForPlace(exchange, by) {
  const direct = new Set();
  for (const name of ONVISTA_EXCHANGE[exchange] || []) {
    for (const ccy of by.get(name) || []) direct.add(ccy);
  }
  if (direct.size || exchange !== "XETRA") return direct;
  for (const [name, ccys] of by) {
    if (!GERMAN_VENUES.has(name)) continue;
    for (const ccy of ccys) direct.add(ccy);
  }
  return direct;
}

// Symbols the Xetra file and the suffixed list tickers do not price.
// Onvista's quote for that place is the trading currency. A match on the
// symbol may also replace an ISIN that belonged to a different listing.
async function onvistaCurrencies(rows) {
  const found = new Map();
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      const row = rows[index];
      if (!row) return;
      const key = `${row.exchange}|${row.ticker}`;
      if (found.has(key)) continue;
      try {
        const byTicker = await onvistaSearch(row.ticker);
        let chosen = matchSymbol(byTicker, row.ticker, row.name);
        if (!chosen) chosen = await searchByName(row.name, row.ticker);
        if (!chosen?.item?.urls?.WEBSITE) continue;
        const quotes = await onvistaQuotes(chosen.item.urls.WEBSITE);
        const currencies = currenciesForPlace(row.exchange, quotes);
        if (!currencies.size) continue;
        const isin = String(chosen.item.isin || "").toUpperCase();
        found.set(key, {
          currencies,
          isin: /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) ? isin : "",
          symbolMatch: chosen.symbolMatch,
        });
      } catch {
        // A missed page leaves the currency blank.
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return found;
}

function applyOnvista(rows, found) {
  let isins = 0;
  for (const row of rows) {
    const hit = found.get(`${row.exchange}|${row.ticker}`);
    if (!hit?.isin) continue;
    if (!row.isin) {
      row.isin = hit.isin;
      isins += 1;
    } else if (hit.symbolMatch && row.isin !== hit.isin) {
      row.isin = hit.isin;
      delete row.matches;
      isins += 1;
    }
  }
  return isins;
}

function applyGroups(row, groups) {
  const ids = new Set([...groups.values()].flatMap((set) => [...set]));
  if (ids.size === 1) {
    row.isin = [...ids][0];
    return "isin";
  }
  if (ids.size > 1 && stampIsinMatches(row, groups, row.ticker)) return "matches";
  if (row.matches?.length) return "matches";
  return "";
}

// One ISIN on the place is the row's code. Several stay in `matches`.
// A ticker the place does not list is read across the lists: one code is
// kept, several become matches.
function attachIsins(rows, book) {
  let single = 0;
  let several = 0;
  for (const row of rows) {
    if (row.isin || row.matches?.length) continue;
    const local = new Map();
    for (const place of LIST_PLACES[row.exchange] || []) {
      const ids = book.byPlace.get(`${place}|${row.ticker}`);
      if (ids?.size) local.set(place, ids);
    }
    const groups = local.size ? local : book.byTicker.get(row.ticker);
    const kind = groups ? applyGroups(row, groups) : "";
    if (kind === "isin") single += 1;
    if (kind === "matches") several += 1;
  }
  return { single, several };
}

const filled = stampRows(withoutObligations(results));
borrowIsin(filled);
const book = loadListBook();
const attached = attachIsins(filled, book);
const suffixes = suffixCurrencies(book);
const xetra = await xetraCurrencies();
const knownIsins = applyKnownIsins(filled, xetra, suffixes);
function exchangeTradedName(name) {
  return /\bETFs?\b|\bETCs?\b|\bETNs?\b|\bETPs?\b/i.test(name)
    || /\b(iShares|SPDR|ProShares|WisdomTree|First Trust|Direxion|VanEck|Global X|Vanguard)\b/i.test(name)
    || /\b(Gold Trust|Silver Trust|Gold Shares|QQQ Trust|Oil Fund|Natural Gas Fund)\b/i.test(name);
}
const fundIsins = new Set();
for (const line of fs.readFileSync(new URL("../../assets/etfs.csv", import.meta.url), "utf8").split(/\r?\n/)) {
  if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
  const columns = line.split(",");
  const isin = String(columns[2] || "").trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
  if (exchangeTradedName(columns.slice(3).join(","))) fundIsins.add(isin);
}
for (const row of filled) {
  if (row.remark) continue;
  const isin = String(row.isin || "").toUpperCase();
  const namedFund = row.type !== "STOCK";
  const listedFund = !namedFund && fundIsins.has(isin) && US.has(row.exchange);
  if (!namedFund && !listedFund) continue;
  if (listedFund || isin.startsWith("US") || US.has(row.exchange)) row.remark = "Reserved for professional clients.";
}
const { listed, books } = loadCurrencyEvidence("lhvpank");
const missing = filled.filter((row) => !quoteCurrencies(row, listed, books, (item) => extraCurrencies(item, xetra, suffixes)).size);
const onvista = await onvistaCurrencies(missing);
const onvistaIsins = applyOnvista(filled, onvista);
const kept = withCurrencies(filled, listed, books, (row) => {
  const have = extraCurrencies(row, xetra, suffixes);
  const hit = onvista.get(`${row.exchange}|${row.ticker}`);
  if (hit) for (const ccy of hit.currencies) have.add(ccy);
  return have;
});
const shares = kept.filter((row) => row.type === "STOCK");
const funds = kept.filter((row) => row.type !== "STOCK");
if (!kept.some((row) => row.ticker === "AIR" && row.exchange === "Tallinn Stock Exchange")) {
  throw new Error("Airobot was not on Tallinn");
}
if (!funds.some((row) => row.ticker === "IWDA")) throw new Error("IWDA was not in the search");
if (shares.length < 3000) throw new Error(`only ${shares.length} shares`);
if (funds.length < 200) throw new Error(`only ${funds.length} listed funds`);

kept.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker) || left.exchange.localeCompare(right.exchange));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const unmatched = kept.filter((row) => !row.isin && !(row.matches || []).length).length;
const blank = kept.filter((row) => !row.currency);
console.error(
  `${kept.length} listings over ${last} pages ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    `, ${attached.single} ISINs and ${attached.several} matches from the lists` +
    (knownIsins ? `, ${knownIsins} ISINs from the Xetra file or a suffixed ticker` : "") +
    (onvista.size ? `, ${onvista.size} currencies from Onvista` : "") +
    (onvistaIsins ? `, ${onvistaIsins} ISINs from that quote` : "") +
    (unmatched ? `, ${unmatched} still without either` : "") +
    (blank.length ? `, ${blank.length} still without a currency` : "")
);
