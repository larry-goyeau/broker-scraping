// What DNSE sells in shares and exchange-traded funds, with no login.
// The public ticker file is the book. Each line names its board and a
// type, and says it is listed. Shares are STOCK and funds are ETF.
// Covered warrants, bonds, futures, indexes and closed-end fund
// certificates are other products and are not written. A delisted line
// is not in this file. The file has no ISIN; the price API prints it.
//
//   https://api.dnse.com.vn/market-api/tickers
//   https://api.dnse.com.vn/price-api/query
//
//   node brokers/dnse/dnse_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import dns from "node:dns";
import fs from "node:fs";

dns.setDefaultResultOrder("ipv4first");

const LIST = "https://api.dnse.com.vn/market-api/tickers";
const PRICE = "https://api.dnse.com.vn/price-api/query";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const SOLD = { STOCK: "STOCK", ETF: "ETF" };
const LEFT_OUT = {
  COVERED_WARRANT: "covered warrants",
  CORPORATE_BOND: "bonds",
  FU: "futures",
  INDEX: "indexes",
  IFC: "closed-end funds",
};
const BOARDS = ["HOSE", "HNX", "UPCOM"];
// Round-lot board. HOSE is market 6, HNX is 7, UPCOM is 8.
const BOARD = 2;
const MARKET = { HOSE: 6, HNX: 7, UPCOM: 8 };
const ISIN_QUERY = `query ($symbols: [String]!, $board: Int!) {
  GetKrxStockInfoBySymbols(symbols: $symbols, board: $board) {
    si { symbol isin marketId }
  }
}`;

async function getJson(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        body: options.body,
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

const body = await getJson(LIST);
const book = body?.data;
const expected = Number(body?.total);
if (!Array.isArray(book) || !book.length) throw new Error(`${LIST} has no listings`);
if (book.length !== expected) throw new Error(`ticker file has ${book.length} rows, not ${expected}`);

const rows = [];
const seen = new Set();
const leftOut = new Map();
for (const line of book) {
  const kind = String(line.type || "").trim().toUpperCase();
  const type = SOLD[kind];
  if (!type) {
    if (!LEFT_OUT[kind]) throw new Error(`unknown type ${kind || "unmarked"} on ${line.symbol}`);
    leftOut.set(kind, (leftOut.get(kind) || 0) + 1);
    continue;
  }
  if (line.isListed !== true) throw new Error(`${line.symbol} is ${line.isListed === false ? "delisted" : "unmarked"}`);
  const ticker = String(line.symbol || "").trim().toUpperCase();
  const exchange = String(line.floor || "").trim().toUpperCase();
  const name = String(line.companyName || line.companyNameEng || line.name || "").replace(/\s+/g, " ").trim();
  if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(line.symbol)}`);
  if (!BOARDS.includes(exchange)) throw new Error(`${ticker} is on ${exchange || "no board"}`);
  if (seen.has(ticker)) throw new Error(`repeated ${ticker}`);
  seen.add(ticker);
  rows.push({ ticker, name, exchange, type });
}

const isin = new Map();
const marketOf = new Map();
let pending = rows.map((row) => row.ticker);
for (let round = 0; round < 4 && pending.length; round += 1) {
  const still = [];
  for (let start = 0; start < pending.length; start += 300) {
    const slice = pending.slice(start, start + 300);
    let quote;
    try {
      quote = await getJson(PRICE, {
        method: "POST",
        body: JSON.stringify({ query: ISIN_QUERY, variables: { symbols: slice, board: BOARD } }),
      });
    } catch {
      still.push(...slice);
      continue;
    }
    if (quote?.errors?.length) {
      still.push(...slice);
      continue;
    }
    const lines = quote?.data?.GetKrxStockInfoBySymbols?.si;
    if (!Array.isArray(lines)) {
      still.push(...slice);
      continue;
    }
    const got = new Set();
    for (const line of lines) {
      const code = String(line.symbol || "").trim().toUpperCase();
      const codeIsin = String(line.isin || "").trim().toUpperCase();
      if (!code || !slice.includes(code)) continue;
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(codeIsin)) throw new Error(`no ISIN for ${code}`);
      isin.set(code, codeIsin);
      marketOf.set(code, Number(line.marketId));
      got.add(code);
    }
    for (const code of slice) if (!got.has(code)) still.push(code);
  }
  pending = still;
  if (pending.length) await new Promise((resolve) => setTimeout(resolve, 400 * (round + 1)));
}
if (pending.length) throw new Error(`no quote for ${pending.slice(0, 12).join(", ")}`);

const listings = rows.map((row) => {
  const codeIsin = isin.get(row.ticker);
  if (marketOf.get(row.ticker) !== MARKET[row.exchange]) {
    throw new Error(`${row.ticker} quote is market ${marketOf.get(row.ticker)}, not ${row.exchange}`);
  }
  if (seen.has(codeIsin)) throw new Error(`repeated ${row.ticker} ${codeIsin}`);
  seen.add(codeIsin);
  return {
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    currency: "VND",
    type: row.type,
    isin: codeIsin,
    raw: [row.ticker, row.name, row.exchange, codeIsin, row.type].join(" "),
  };
});
listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("dnse-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));

const byType = new Map();
for (const row of listings) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const skipped = [...leftOut].map(([kind, count]) => `${count} ${LEFT_OUT[kind]}`).join(", ");
console.error(
  `${listings.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). Left out: ${skipped || "none"}.`
);
