// Shares (shares.io) publishes its instrument list on the KID page, one CSV
// per country of residence, with no login. The help centre calls it the
// fractional shares and ETFs available for trading in that country. Each
// line has a symbol, a name, an ISIN, a kind (stock, etf, commodity), the
// fund manager, the PEA flag and the KID link.
//
// Eight countries trade shares and ETFs (FR, BE, LU, PT, IT, DE, NL, PL).
// The country files differ only in the ETFs: a fund without a KID for that
// country is left out of its file. The catalogue is one row per listing over
// all eight files, so it is the French file (BE and LU are the same file),
// and a line only another country carries would be added. The ISIN is the
// listing key; no ISIN is on two lines.
//
// The execution policy names the place. EUR-listed shares, fractions and
// ETFs go to Upvest Securities, which executes on Tradegate or Quotrix
// (Düsseldorf). Neither file says which of the two a line goes to, so each
// EUR line is written on both, Tradegate and Quotrix, as broker-list.json
// names them, in EUR. USD-listed shares
// go to Alpaca; the row keeps the US listing from the KID file name
// (NYSE, NASDAQ, AMEX = NYSE American, BATS = Cboe BZX), in USD. The other
// codes in that name (PAR, LON, XEX, ETR, HKG, ...) are Shares' reference
// listing, not where the order is executed. A US line stays one row: the
// US book is one NBBO.
//
// kind "commodity" is a physical metal ETC. Crypto is not in these files.
//
//   https://support.shares.io/en/articles/81376-key-information-documents-kid
//   https://app-support.shares.io/instruments/kids/FR.html
//   https://app-support.shares.io/instruments/kids/FR.csv
//   https://support.shares.io/en/articles/564-countries-currently-supported
//   https://www.shares.io/fr/terms/best-execution-policy
//
//   node brokers/shares/shares_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://app-support.shares.io/instruments/kids/";
const COUNTRIES = ["FR", "BE", "LU", "PT", "IT", "DE", "NL", "PL"];

// KID file-name market for a USD listing (Alpaca).
const US = {
  NYSE: { exchange: "NYSE", mic: "XNYS" },
  NASDAQ: { exchange: "NASDAQ", mic: "XNAS" },
  AMEX: { exchange: "NYSE American", mic: "XASE" },
  BATS: { exchange: "Cboe BZX", mic: "BATS" },
};
// Every other market code seen in the file names. A new one is an error.
const EUR_MARKETS = new Set([
  "PAR", "AMS", "BRU", "LON", "XEX", "ETR", "FRA", "TDG", "MIL", "MCE", "SWX",
  "OME", "HEL", "OSL", "CSE", "HKG", "SES", "ISEF", "ZZDE",
]);

const KIND = { stock: "STOCK", etf: "ETF", commodity: "ETC" };

const FLOOR = { USD: 1300, EUR: 500 };

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

async function countryRows(country) {
  const url = `${BASE}${country}.csv`;
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const table = parseCsv(await response.text());
  if (table[0]?.length !== 7) throw new Error(`${country}.csv header is ${(table[0] || []).join(";")}`);
  return table.slice(1);
}

function rowOf(line, country) {
  const [symbol, label, isinCell, kind, manager, pea, kid] = line.map(normalize);
  const isin = toIsin(isinCell);
  const type = KIND[kind];
  const market = kid.match(/\/kid\/[A-Z]{2}_([A-Z]+)_[^/]+\.pdf$/)?.[1] || "";
  if (!isin || !type || !market || !symbol) throw new Error(`${country}.csv line not read: ${line.join(";")}`);
  const ticker = symbol.toUpperCase();
  const name = label || ticker;
  const us = US[market];
  if (!us && !EUR_MARKETS.has(market)) throw new Error(`${country}.csv has a new market code ${market} (${ticker})`);
  const out = {
    query: isin,
    ticker,
    name,
    exchange: us ? us.exchange : "Tradegate",
    mic: us ? us.mic : "XGAT",
    currency: us ? "USD" : "EUR",
    type,
    isin,
    raw: [ticker, name, isin, kind, manager, market, pea === "true" ? "PEA" : ""].filter(Boolean).join(" "),
  };
  return out;
}

const results = [];
const seen = new Set();
const added = new Map();
for (const country of COUNTRIES) {
  const lines = await countryRows(country);
  if (lines.length < 1000) throw new Error(`${country}.csv is short: ${lines.length} lines`);
  for (const line of lines) {
    const row = rowOf(line, country);
    const key = `${row.isin}:${row.currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(row);
    if (country !== COUNTRIES[0]) added.set(country, (added.get(country) || 0) + 1);
  }
}

// The second EUR place.
for (const row of results.filter((line) => line.mic === "XGAT")) {
  results.push({ ...row, exchange: "Quotrix", mic: "XQTX" });
}

const byCurrency = new Map();
for (const row of results) byCurrency.set(row.currency, (byCurrency.get(row.currency) || 0) + 1);
for (const [currency, floor] of Object.entries(FLOOR)) {
  if ((byCurrency.get(currency) || 0) < floor) {
    throw new Error(`${currency} book is short: ${byCurrency.get(currency) || 0} (floor ${floor})`);
  }
}

results.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(
  new URL("shares-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(results)), null, 2)
);

const byBook = new Map();
for (const row of results) {
  const label = `${row.exchange} ${row.type}`;
  byBook.set(label, (byBook.get(label) || 0) + 1);
}
console.error(
  `${results.length} listings (${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
console.error(
  `Lines not in ${COUNTRIES[0]}.csv: ${added.size ? [...added].map(([country, count]) => `${count} ${country}`).join(", ") : "none"}`
);
