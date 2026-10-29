// The Cambodia Securities Exchange (CSX, MIC XCSX) share book, for a broker
// whose only place is the CSX and that sells all its listed shares.
//
// Sources, the exchange's own public API (no login):
//   - the list of listed companies: symbol, ISIN (icode), name, listing
//     date. The CSX lists only ordinary shares and bonds; bonds are another
//     list and are not read. It lists no ETF.
//       https://csx.com.kh/api/v1/website/company/stock/list-companies
//   - the stock-price page's data (POST), which gives the symbols of each
//     board (Main Board, Growth Board) and, per symbol, the daily history:
//       https://csx.com.kh/api/v1/website/market-data/stock/prices
//       {"board":"main","symbol":"<ISIN>","fromDate":"yyyymmdd","toDate":"yyyymmdd","tradingMethod":""}
//
// Every listed company must sit on one board, and every board symbol must
// be a listed company, or the run stops. A share with no trade (volume over
// zero) in the last 30 calendar days is taken as suspended or not trading
// and left out; the CSX publishes no separate suspension list.
//
// Rows: { query, ticker, name, exchange: "Cambodia Securities Exchange",
// mic: "XCSX", currency: "KHR", type: "STOCK", isin, raw }. Shares trade and
// settle in riel.
//
//   import { csxBook } from "../acledabank/csxBook.mjs";
//   const { rows, quiet } = await csxBook();
//
//   node brokers/acledabank/csxBook.mjs      prints the rows

import { fileURLToPath } from "node:url";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const LIST = "https://csx.com.kh/api/v1/website/company/stock/list-companies";
const PRICES = "https://csx.com.kh/api/v1/website/market-data/stock/prices?lang=en";
const BOARDS = { main: "Main Board", growth: "Growth Board" };
const QUIET_DAYS = 30;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(url, body) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: { "User-Agent": UA, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await pause(1_000 * (attempt + 1));
  }
  throw new Error(last);
}

const ymd = (date) => date.toISOString().slice(0, 10).replace(/-/g, "");

export async function csxBook({ log = console.error } = {}) {
  const listing = await call(LIST);
  const companies = listing.data || [];
  if (companies.length !== listing.totalRecords) throw new Error(`CSX announced ${listing.totalRecords} companies, sent ${companies.length}`);
  if (companies.length < 11) throw new Error(`CSX lists only ${companies.length} companies`);

  const to = new Date();
  const from = new Date(to.getTime() - QUIET_DAYS * 86400_000);
  const boardOf = new Map();
  for (const board of Object.keys(BOARDS)) {
    const answer = await call(PRICES, { board, symbol: "", fromDate: ymd(to), toDate: ymd(to), tradingMethod: "" });
    const symbols = answer.data?.symbolList || [];
    if (!symbols.length) throw new Error(`CSX ${BOARDS[board]} lists no symbol`);
    for (const { value, label } of symbols) boardOf.set(String(value).trim(), { board, symbol: String(label).trim() });
  }

  const rows = [];
  const quiet = [];
  for (const company of companies) {
    const isin = String(company.icode || "").trim().toUpperCase();
    const symbol = String(company.symbolEn || "").trim();
    const name = String(company.nameEn || "").replace(/\s+/g, " ").trim();
    if (!/^KH[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`CSX gives ${symbol} no ISIN`);
    const seat = boardOf.get(isin);
    if (!seat) throw new Error(`${symbol} (${isin}) is on no CSX board`);
    if (seat.symbol !== symbol) throw new Error(`${isin} is ${symbol} on the list, ${seat.symbol} on the board`);
    boardOf.delete(isin);
    await pause(300);
    const answer = await call(PRICES, { board: seat.board, symbol: isin, fromDate: ymd(from), toDate: ymd(to), tradingMethod: "" });
    const days = (answer.data?.historicalPrice || []).filter((day) => Number(String(day.tradingVolume || "0").replace(/,/g, "")) > 0);
    const last = days.map((day) => day.date.split("/").reverse().join("-")).sort().pop() || "";
    if (!last) {
      quiet.push(`${symbol} (no trade since ${ymd(from)})`);
      continue;
    }
    rows.push({
      query: symbol,
      ticker: symbol,
      name,
      exchange: "Cambodia Securities Exchange",
      mic: "XCSX",
      currency: "KHR",
      type: "STOCK",
      isin,
      raw: [symbol, isin, name, BOARDS[seat.board], `listed ${company.date}`, `last trade ${last}`].join(" | "),
    });
  }
  if (boardOf.size) throw new Error(`CSX board symbols not on the company list: ${[...boardOf.values()].map((seat) => seat.symbol).join(", ")}`);
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  log(`CSX: ${rows.length} shares trading (${companies.length} listed); left out ${quiet.length}${quiet.length ? `: ${quiet.join(", ")}` : ""}`);
  return { rows, quiet };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { rows } = await csxBook();
  for (const row of rows) console.log(row.raw);
}
