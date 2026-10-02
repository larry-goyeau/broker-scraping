// What Mega International Commercial Bank sells in foreign shares
// and exchange-traded funds, with no login. The shares are three
// public lists. A row without the buy button is on the page and is
// not sold. The funds are one public file. The purchase field says
// who may buy. A blank and a "none" stay out. Some of the rest are
// limited to a professional investor. That line is still sold.
//
// The page names the United States, Hong Kong and Japan. It does not
// name the exchange inside the United States, so that row stays "US".
// The file prints no ISIN. One is filled from the shared lists when
// a single code on that market matches. Several matches stay blank.
//
// The coin is not sold. These pages have no coin shelf.
//
//   https://fund.megabank.com.tw/w/stocklist.djhtm?a=us
//   https://fund.megabank.com.tw/w/stocklist.djhtm?a=HK
//   https://fund.megabank.com.tw/w/stocklist.djhtm?a=JP
//   https://fund.megabank.com.tw/ETFData/djjson/et020001jsonMega.djjson?FD=E&b=1&a=null
//
//   node brokers/megabank/megabank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const ROOT = "https://fund.megabank.com.tw";
const LISTS = [
  ["us", "US", "USD"],
  ["HK", "Hong Kong", "HKD"],
  ["JP", "Tokyo", "JPY"],
];
const FUNDS = `${ROOT}/ETFData/djjson/et020001jsonMega.djjson?FD=E&b=1&a=null`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const JP_PLACES = ["TSE", "NAG"];

async function getBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function textOf(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tableRows(html) {
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => textOf(match[1]));
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function listingType(name) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const header = table[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${header.join(",")}`);
    }
    for (const line of table.slice(1)) {
      const cells = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
          if (char === '"') {
            if (line[i + 1] === '"') {
              field += '"';
              i += 1;
            } else quoted = false;
          } else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
          cells.push(field);
          field = "";
        } else field += char;
      }
      cells.push(field);
      const code = String(cells[0] || "").trim().toUpperCase().split(":").pop();
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

function codesOf(row) {
  if (row.exchange !== "Hong Kong") return [row.ticker];
  const digits = row.ticker.replace(/^0+/, "") || "0";
  return [...new Set([row.ticker, digits, digits.padStart(4, "0"), digits.padStart(5, "0")])];
}

function placesOf(row) {
  if (row.exchange === "US") return US_PLACES;
  if (row.exchange === "Tokyo") return JP_PLACES;
  if (row.exchange === "Hong Kong") return ["HKEX"];
  return [];
}

function attachIsins(rows, index) {
  let one = 0;
  let none = 0;
  let several = 0;
  for (const row of rows) {
    const found = new Set();
    for (const code of codesOf(row)) {
      const book = index.get(code);
      for (const place of placesOf(row)) {
        for (const isin of book?.get(place) || []) found.add(isin);
      }
    }
    if (found.size === 1) {
      row.isin = [...found][0];
      one += 1;
    } else if (found.size === 0) none += 1;
    else several += 1;
  }
  return { one, none, several };
}

const rows = [];
const seen = new Set();

for (const [query, exchange, currency] of LISTS) {
  const html = new TextDecoder("big5").decode(await getBytes(`${ROOT}/w/stocklist.djhtm?a=${query}`));
  let bought = 0;
  for (const cells of tableRows(html)) {
    if (cells[0] !== "申購") continue;
    const ticker = String(cells[1] || "").trim().toUpperCase();
    const name = String(cells[2] || "").replace(/\s+/g, " ").trim();
    const printed = exchange === "Tokyo" ? currency : String(cells[4] || "").trim().toUpperCase();
    if (!ticker) throw new Error(`${exchange} has a buy row with no ticker`);
    if (printed !== currency) throw new Error(`${exchange} ${ticker} is priced in ${printed}`);
    const key = `${exchange}|${ticker}`;
    if (seen.has(key)) throw new Error(`repeated ${key}`);
    seen.add(key);
    bought += 1;
    rows.push({
      query: ticker,
      ticker,
      name: name || ticker,
      exchange,
      currency,
      type: "STOCK",
      isin: "",
      raw: [ticker, name, exchange, currency, "STOCK"].filter(Boolean).join(" "),
    });
  }
  if (!bought) throw new Error(`${exchange} published no buy row`);
  console.error(`${bought} shares on ${exchange}`);
}

const CCY = { 美元: "USD", 日圓: "JPY", 港幣: "HKD", 人民幣: "CNH" };
const PLACE = { JP: "Tokyo", HK: "Hong Kong" };
const fundText = new TextDecoder("big5").decode(await getBytes(FUNDS));
const fundRows = JSON.parse(fundText).ResultSet?.Result;
if (!Array.isArray(fundRows)) throw new Error(`${FUNDS} has no result list`);
let funds = 0;
for (const cell of fundRows) {
  const right = String(cell.V40 || "").trim();
  if (!right || right === "無") continue;
  const printed = String(cell.V1 || "").trim().toUpperCase();
  const suffix = printed.includes(".") ? printed.split(".").pop() : "";
  const ticker = suffix ? printed.slice(0, -(suffix.length + 1)) : printed;
  const exchange = PLACE[suffix] || (suffix ? "" : "US");
  const currency = CCY[String(cell.V3 || "").trim()];
  const name = String(cell.V2 || "").replace(/\s+/g, " ").trim();
  if (!ticker || !exchange || !currency) throw new Error(`unreadable fund ${printed} ${cell.V3} ${right}`);
  const type = listingType(name);
  const key = `${exchange}|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  funds += 1;
  rows.push({
    query: ticker,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type,
    isin: "",
    raw: [ticker, name, exchange, currency, type, right].filter(Boolean).join(" "),
  });
}
console.error(`${funds} funds with a purchase right`);

const tally = attachIsins(rows, loadIsinIndex());
rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("megabank-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));
const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${rows.length} listings (${tally.one} with an ISIN, ${tally.none} unmatched, ${tally.several} ambiguous) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
