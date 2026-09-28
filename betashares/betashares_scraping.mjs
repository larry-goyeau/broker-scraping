// What Betashares Direct sells. The app's instrument file is the list.
// A row with tradable set to false stays out. A row tagged disable_buy or
// disable_sell stays out: those names cannot be traded. Two unlisted funds
// have no exchange and stay out. What remains is a selection of ASX shares
// and the ETFs on ASX and Cboe Australia. There is no ETC or ETN kind.
// The file has no ISIN. An ASX code is joined to ../stocks.csv and
// ../etfs.csv when that place has exactly one ISIN.
//
//   https://www.betashares.com.au/direct/
//   https://instruments.wealth.betashares.com.au/instruments.json
//
//   node betashares/betashares_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const FILE = "https://instruments.wealth.betashares.com.au/instruments.json";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const STOCKS = new URL("../stocks.csv", import.meta.url);
const ETFS = new URL("../etfs.csv", import.meta.url);
const FILE_EXCHANGE = { ASX: ["ASX"], "Cboe Australia": ["CXA"] };

const EXCHANGE = { ASX: "ASX", CXA: "Cboe Australia" };

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
    else if (char === ",") {
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

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    if (!fs.existsSync(file)) throw new Error(`missing ${file.pathname}`);
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    const header = table[0]?.map((cell) => cell.trim().toLowerCase());
    if (header?.[0] !== "ticker" || header?.[1] !== "exchange" || header?.[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${(header || []).join(",")}`);
    }
    for (const line of table.slice(1)) {
      const code = normalize(line[0]).toUpperCase().split(":").pop();
      const exchange = normalize(line[1]).toUpperCase();
      const isin = normalize(line[2]).toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

function attachIsins(rows) {
  const index = loadIsinIndex();
  const tally = { one: 0, none: 0, several: 0 };
  for (const row of rows) {
    const places = FILE_EXCHANGE[row.exchange] || [];
    const found = new Set();
    const book = index.get(row.ticker);
    for (const place of places) {
      for (const isin of book?.get(place) || []) found.add(isin);
    }
    if (found.size === 1) {
      const isin = [...found][0];
      row.isin = isin;
      row.query = isin;
      tally.one += 1;
    } else tally[found.size === 0 ? "none" : "several"] += 1;
  }
  return tally;
}

const response = await fetch(FILE, { headers: { "User-Agent": UA, Accept: "application/json" } });
if (!response.ok) throw new Error(`Betashares instruments answered ${response.status}`);
const instruments = await response.json();
if (!Array.isArray(instruments) || !instruments.length) throw new Error("Betashares instrument file was empty");

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];
for (const row of instruments) {
  const tags = new Set(row?.tags || []);
  if (row?.tradable !== true) {
    skip("not tradable");
    continue;
  }
  if (tags.has("disable_buy") || tags.has("disable_sell")) {
    skip("buy and sell blocked");
    continue;
  }
  const kind = normalize(row?.kind);
  if (kind === "unlisted_fund" || !normalize(row?.exchange)) {
    skip("unlisted fund");
    continue;
  }
  const exchange = EXCHANGE[normalize(row?.exchange).toUpperCase()];
  if (!exchange) throw new Error(`unread exchange: ${row?.exchange} ${row?.symbol}`);
  if (normalize(row?.base_currency).toUpperCase() !== "AUD") {
    throw new Error(`unread currency: ${row?.base_currency} ${row?.symbol}`);
  }
  const type = kind === "etf" ? "ETF" : kind === "equity" ? "STOCK" : "";
  if (!type) throw new Error(`unread kind: ${kind} ${row?.symbol}`);
  const ticker = normalize(row?.symbol).toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(ticker)) throw new Error(`unread ticker: ${row?.symbol}`);
  const key = `${ticker}:${exchange}:${type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = normalize(row?.display_name) || ticker;
  results.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency: "AUD",
    type,
    raw: [ticker, name, exchange, kind].filter(Boolean).join(" "),
    isin: "",
  });
}

if (!results.length) throw new Error("Betashares instrument file kept no row");

const isins = attachIsins(results);
results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("betashares-parsed.json", import.meta.url), JSON.stringify(stampRows(results), null, 2));

const byBook = new Map();
for (const row of results) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instrumentsN = new Set(results.map((row) => row.isin || `${row.type}:${row.ticker}`)).size;
console.error(
  `${results.length} listings over ${instrumentsN} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
console.error(`ISIN ${isins.one}. ${isins.several} codes match several. ${isins.none} match none.`);
