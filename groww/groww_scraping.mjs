// What Groww sells. The public instrument file lists every name the trading
// API can route. A row is kept when a buy is allowed. A sell-only line and
// an index stay out. A future or an option is taken on exchange margin or
// on a premium, so its leverage is above 1, and it stays out. What remains
// is the cash line, paid in full. A cash line is not split into a share and
// an ETF: the file has no such type.
//
//   https://growwapi-assets.groww.in/instruments/instrument.csv
//   https://groww.in/trade-api/docs/curl/instruments
//
//   node groww/groww_scraping.mjs

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const FILE = "https://growwapi-assets.groww.in/instruments/instrument.csv";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const EXCHANGES = new Set(["NSE", "BSE", "MCX"]);
const TYPES = new Set(["EQ", "CE", "PE", "FUT"]);

async function textOf() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(FILE, {
        headers: { "User-Agent": UA, Accept: "text/csv" },
        signal: controller.signal,
      });
      if (response.ok) return response.text();
      last = `${response.status} ${FILE}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const csv = await textOf();
const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
const header = lines[0].split(",");
const col = (name) => {
  const at = header.indexOf(name);
  if (at < 0) throw new Error(`column ${name} is missing`);
  return at;
};
const exchangeAt = col("exchange");
const symbolAt = col("trading_symbol");
const nameAt = col("name");
const typeAt = col("instrument_type");
const segmentAt = col("segment");
const isinAt = col("isin");
const buyAt = col("buy_allowed");
const sellAt = col("sell_allowed");
const width = header.length;

const cells = lines.slice(1).map((line) => line.split(","));
for (const cell of cells) {
  if (cell.length !== width) throw new Error(`a row has ${cell.length} columns`);
}

const seen = new Set();
const rows = [];
for (const cell of cells) {
  const buy = cell[buyAt];
  const sell = cell[sellAt];
  const type = cell[typeAt];
  if (buy !== "0" && buy !== "1") throw new Error(`unread buy_allowed ${buy} ${cell[symbolAt]}`);
  if (sell !== "0" && sell !== "1") throw new Error(`unread sell_allowed ${sell} ${cell[symbolAt]}`);
  if (buy !== "1") {
    skip(type === "IDX" ? "index" : sell === "1" ? "sell only" : "closed");
    continue;
  }
  const segment = cell[segmentAt];
  if (segment !== "CASH" && segment !== "FNO" && segment !== "COMMODITY") {
    throw new Error(`unread segment ${segment} ${cell[symbolAt]}`);
  }
  if (!TYPES.has(type)) throw new Error(`unread type ${type} ${cell[symbolAt]}`);
  const exchange = cell[exchangeAt];
  if (!EXCHANGES.has(exchange)) throw new Error(`unread exchange ${exchange} ${cell[symbolAt]}`);
  const ticker = cell[symbolAt].trim().toUpperCase();
  if (!ticker) throw new Error("unread ticker");
  if (segment !== "CASH") {
    skip("leverage");
    continue;
  }
  const label = cell[nameAt].replace(/\s+/g, " ").trim() || ticker;
  const isin = cell[isinAt].trim().toUpperCase();
  const valid = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin);
  // One trading symbol can be several bonds. The ISIN is the line.
  const key = `${valid ? isin : ticker}:${exchange}:${type}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: valid ? isin : ticker,
    ticker,
    name: label,
    exchange,
    currency: "INR",
    type,
    raw: [ticker, label, exchange, "INR", type, segment, valid ? isin : ""].filter(Boolean).join(" "),
    isin: valid ? isin : "",
  });
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("groww-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(rows.map((row) => row.isin || `${row.type}:${row.ticker}:${row.exchange}`)).size;
console.error(
  `${rows.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
