// What MeDirect sells in shares and ETFs, with no login. Belgium and
// Malta each print a navigator, and that navigator is the universe that
// bank sells. A name that is not in it is not sold until the bank adds
// it. Mutual funds are another navigator and stay out.
//
// A row is sold when enabled and viewable are both 1. The navigator
// still marks names that are no longer listed, and this file does not
// invent a second filter for them.
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
let onBoth = 0;
let onlyBe = 0;
let onlyMt = 0;
for (const row of merged.values()) {
  if (row.books.has("BE") && row.books.has("MT")) onBoth += 1;
  else if (row.books.has("BE")) onlyBe += 1;
  else onlyMt += 1;
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

const aapl = rows.find((row) => row.isin === "US0378331005" && row.type === "STOCK");
if (!aapl?.supportedCountries.includes("BE") || !aapl.supportedCountries.includes("MT") || !aapl.supportedCountries.includes("FR")) {
  throw new Error("AAPL does not carry both client lists");
}
if (!rows.some((row) => row.supportedCountries.length === 1 && row.supportedCountries[0] === "BE")) {
  throw new Error("no name is only for a Belgian client");
}
if (!rows.some((row) => row.supportedCountries.includes("GB") && row.supportedCountries.length > 1)) {
  throw new Error("no name carries the Malta client list");
}

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("medirect-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([label, count]) => `${count} ${label}`).join(", ")}); ` +
    `${onBoth} on both books, ${onlyBe} Belgium only, ${onlyMt} Malta only`
);
if (withheld) console.error(`${withheld} rows not enabled or not viewable`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
