// What MeDirect sells in shares and ETFs, with no login. Belgium and
// Malta each print a navigator. Mutual funds are another navigator and
// stay out. A row is sold when enabled and viewable are both 1.
//
// Belgium's navigator is the book a Belgian client buys. Malta's
// navigator still lists names the trading screen does not sell, and it
// misses names that screen does sell. The screen was read on 2026-10-09
// from Explore investments (equities and ETFs). That book is
// malta-screen.json. A navigator name the screen does not sell loses
// Malta. If Belgium does not sell it either, it drops out. A screen
// name the navigator does not have is added for Malta. A name only
// Belgium sells stays Belgian.
//
// Each name carries the residences of the bank whose list it is on.
// Belgium is a resident of Belgium. Malta is a resident of an EEA
// country, Switzerland or the UK. A name on both lists carries both.
// Malta leaves the title blank on some ETFs. The name is then the one
// Belgium prints for that ISIN, or the ticker when neither does.
//
//   https://www.medirect.be/wp-json/v1/assets/EQ
//   https://www.medirect.be/wp-json/v1/assets/ETF
//   https://www.medirect.com.mt/wp-json/v1/assets/EQ
//   https://www.medirect.com.mt/wp-json/v1/assets/ETF
//
//   node brokers/medirect/medirect_scraping.mjs

import { stampRows, EEA } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const KINDS = { EQ: "STOCK", ETF: "ETF" };
const BELGIUM = ["BE"];
const MALTA = [...new Set([...EEA, "CH", "GB"])].sort();
const BOOKS = [
  { id: "BE", root: "https://www.medirect.be/wp-json/v1/assets", countries: BELGIUM },
  { id: "MT", root: "https://www.medirect.com.mt/wp-json/v1/assets", countries: MALTA },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

async function universe(root, kind) {
  const first = await getJson(`${root}/${kind}?page=1&amount=1`);
  const count = Number(first.count);
  if (!Number.isInteger(count) || count < 1) throw new Error(`${kind} announced ${first.count}`);
  const body = await getJson(`${root}/${kind}?page=1&amount=${count}`);
  const rows = Array.isArray(body.result) ? body.result : null;
  if (!rows || rows.length !== count || Number(body.count) !== count) {
    throw new Error(`${kind} announced ${count} and returned ${rows ? rows.length : "nothing"}`);
  }
  return rows;
}

function readLine(line, kind, book) {
  const enabled = String(line.enabled ?? "");
  const viewable = String(line.viewable ?? "");
  if (enabled !== "1" || viewable !== "1") {
    if (enabled !== "0" && enabled !== "1") throw new Error(`${book} ${line.ticker || line.ISIN} enabled is ${enabled || "blank"}`);
    if (viewable !== "0" && viewable !== "1") throw new Error(`${book} ${line.ticker || line.ISIN} viewable is ${viewable || "blank"}`);
    return null;
  }
  const ticker = normalize(line.ticker).toUpperCase();
  const name = normalize(line.title);
  const exchange = normalize(line.exchange);
  const currency = normalize(line.currency).toUpperCase();
  const isin = normalize(line.ISIN).toUpperCase();
  if (!ticker || !exchange) throw new Error(`unreadable ${book} ${kind} row ${line.performance_id || isin || ticker}`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${book} ${ticker} is quoted ${currency || "nowhere"}`);
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${book} ${ticker} has no ISIN`);
  return { ticker, name, exchange, currency, isin, type: KINDS[kind] };
}

function screenOf() {
  const screen = JSON.parse(fs.readFileSync(new URL("malta-screen.json", import.meta.url), "utf8"));
  if (!Array.isArray(screen) || !screen.length) throw new Error("the Malta trading screen is empty");
  return screen;
}

function rewrite(row) {
  const countries = [...row.supportedCountries].sort();
  row.supportedCountries = countries;
  row.books = [...row.books].sort();
  row.raw = [row.ticker, row.name, row.exchange, row.isin, row.type, countries.join(" ")].join(" ");
  return row;
}

// The public Malta list is wider than the screen and also short of it.
// Belgium is left as the navigator printed it.
function alignMalta(rows) {
  const screen = screenOf();
  const sold = new Set(screen.map((line) => line.isin));
  const kept = [];
  let dropped = 0;
  let narrowed = 0;
  let widened = 0;
  for (const row of rows) {
    const books = new Set(row.books);
    if (books.has("MT") && !sold.has(row.isin)) {
      books.delete("MT");
      if (!books.size) {
        dropped += 1;
        continue;
      }
      narrowed += 1;
      row.books = books;
      row.supportedCountries = ["BE"];
    } else if (!books.has("MT") && sold.has(row.isin)) {
      widened += 1;
      books.add("MT");
      row.books = books;
      row.supportedCountries = [...MALTA];
    }
    kept.push(rewrite(row));
  }
  const have = new Set(kept.map((row) => row.isin));
  let added = 0;
  for (const line of screen) {
    if (have.has(line.isin)) continue;
    have.add(line.isin);
    added += 1;
    kept.push(rewrite({
      query: line.ticker,
      ticker: line.ticker,
      name: line.name || line.ticker,
      exchange: line.exchange,
      currency: line.currency,
      type: line.type === "ETF" ? "ETF" : "STOCK",
      isin: line.isin,
      books: new Set(["MT"]),
      supportedCountries: [...MALTA],
    }));
  }
  return { rows: kept, dropped, narrowed, widened, added };
}

const merged = new Map();
const nameByIsin = new Map();
let withheld = 0;
for (const book of BOOKS) {
  for (const kind of Object.keys(KINDS)) {
    for (const line of await universe(book.root, kind)) {
      const row = readLine(line, kind, book.id);
      if (!row) {
        withheld += 1;
        continue;
      }
      if (row.name && !nameByIsin.has(row.isin)) nameByIsin.set(row.isin, row.name);
      const key = `${row.isin}|${row.exchange}|${row.currency}|${row.type}`;
      const prior = merged.get(key);
      if (!prior) {
        merged.set(key, { ...row, countries: new Set(book.countries), books: new Set([book.id]), tickers: new Set([row.ticker]) });
        continue;
      }
      if (prior.type !== row.type) throw new Error(`${row.isin} is both ${prior.type} and ${row.type}`);
      for (const code of book.countries) prior.countries.add(code);
      prior.books.add(book.id);
      prior.tickers.add(row.ticker);
      if (!prior.name && row.name) prior.name = row.name;
    }
  }
}

const rows = [];
for (const row of merged.values()) {
  const name = row.name || nameByIsin.get(row.isin) || row.ticker;
  const tickers = [...row.tickers].sort();
  const ticker = tickers[0];
  const countries = [...row.countries].sort();
  const matches = tickers.slice(1);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: row.exchange,
    currency: row.currency,
    type: row.type,
    isin: row.isin,
    books: [...row.books].sort(),
    supportedCountries: countries,
    ...(matches.length ? { matches } : {}),
    raw: [ticker, name, row.exchange, row.isin, row.type, countries.join(" ")].join(" "),
  });
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const aligned = alignMalta(rows);
const listed = aligned.rows;
listed.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const aapl = listed.find((row) => row.isin === "US0378331005" && row.type === "STOCK");
if (!aapl?.supportedCountries.includes("BE") || !aapl.supportedCountries.includes("MT") || !aapl.supportedCountries.includes("FR")) {
  throw new Error("AAPL does not carry both client lists");
}
if (!listed.some((row) => row.supportedCountries.length === 1 && row.supportedCountries[0] === "BE")) {
  throw new Error("no name is only for a Belgian client");
}
if (!listed.some((row) => row.supportedCountries.includes("GB") && row.supportedCountries.length > 1)) {
  throw new Error("no name carries the Malta client list");
}
const screenIsin = new Set(screenOf().map((line) => line.isin));
const maltaIsin = new Set(listed.filter((row) => row.books.includes("MT")).map((row) => row.isin));
for (const isin of screenIsin) {
  if (!maltaIsin.has(isin)) throw new Error(`${isin} is on the Malta screen and missing from the catalogue`);
}
for (const row of listed) {
  if (row.books.includes("MT") && !screenIsin.has(row.isin)) throw new Error(`${row.isin} is sold to Malta and is not on the screen`);
}

const kept = stampRows(withoutObligations(listed));
fs.writeFileSync(new URL("medirect-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
let onBoth = 0;
let onlyBe = 0;
let onlyMt = 0;
for (const row of kept) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  const books = new Set(row.books);
  if (books.has("BE") && books.has("MT")) onBoth += 1;
  else if (books.has("BE")) onlyBe += 1;
  else onlyMt += 1;
}
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([label, count]) => `${count} ${label}`).join(", ")}); ` +
    `${onBoth} on both books, ${onlyBe} Belgium only, ${onlyMt} Malta only`
);
console.error(
  `Malta screen: dropped ${aligned.dropped}, left to Belgium ${aligned.narrowed}, ` +
    `opened to Malta ${aligned.widened}, added ${aligned.added}`
);
if (withheld) console.error(`${withheld} rows not enabled or not viewable`);
if (kept.length < listed.length) console.error(`${listed.length - kept.length} bonds left out`);
