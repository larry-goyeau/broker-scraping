// The whole Yangon Stock Exchange (YSX) book, read from the exchange's own
// public pages, for any broker whose only place is the YSX.
//
// The YSX has two boards, each with its own company list:
//   Main Board (MB), listed companies
//     https://ysx-mm.com/main-board/listing/company/
//   Pre-Listing Board (PLB), registered companies
//     https://ysx-mm.com/pre-listing-board/registered-companies/company-list/
//
// Lines left out:
//   - companies on the board's delisting / deregistration list
//     https://ysx-mm.com/listing/delisting/
//     https://ysx-mm.com/pre-listing-board/registered-companies/deregistration/
//   - companies the board's "Stock trading data" page does not quote. The
//     YSX publishes no separate suspension list; a halted or suspended line
//     drops off that daily table, so a company on the company list but not
//     in the table is taken as not trading.
//     https://ysx-mm.com/main-board/mktdata/stocktradingdata/
//     https://ysx-mm.com/pre-listing-board/marketdata/stock-trading-data/
// Companies on a board's watch list stay (they still trade); the entry is
// written into raw.
//     https://ysx-mm.com/main-board/listing/watchlist/
//     https://ysx-mm.com/pre-listing-board/registered-companies/watch-list/
//
// The YSX lists only ordinary shares of Myanmar companies: no ETF, ETN, ETC
// or foreign line. Every line is quoted in kyat (MMK). The exchange gives a
// five-digit company code, not an ISIN; the ISIN comes from assets/stocks.csv
// ("YSX:<ticker>").
//
// The trading data page also gives, per share, whether foreign buy orders
// are "Accepted" or "Suspended" (foreign ownership cap reached). That depends
// on the client, so it is a remark, not a removal: it is written into raw
// ("foreign buy orders Suspended").
//
//   import { ysxBook } from "../kbzstirlingcolem/ysxBook.mjs";
//   const rows = await ysxBook();
//
//   node brokers/kbzstirlingcolem/ysxBook.mjs   (prints the counts)

import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);

export const YSX_BOARDS = [
  {
    board: "Main Board",
    list: "https://ysx-mm.com/main-board/listing/company/",
    removed: "https://ysx-mm.com/listing/delisting/",
    watch: "https://ysx-mm.com/main-board/listing/watchlist/",
    trading: "https://ysx-mm.com/main-board/mktdata/stocktradingdata/",
    floor: 8,
  },
  {
    board: "Pre-Listing Board",
    list: "https://ysx-mm.com/pre-listing-board/registered-companies/company-list/",
    removed: "https://ysx-mm.com/pre-listing-board/registered-companies/deregistration/",
    watch: "https://ysx-mm.com/pre-listing-board/registered-companies/watch-list/",
    trading: "https://ysx-mm.com/pre-listing-board/marketdata/stock-trading-data/",
    floor: 1,
  },
];

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function cellsOf(table) {
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)(?=<tr[^>]*>|<\/tbody>|<\/table>|$)/g)].map(([, row]) =>
    [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => decode(cell[1])),
  );
}

function tables(page) {
  return [...page.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((m) => cellsOf(m[1]));
}

// Company list: "Company name (TICKER)" | five-digit code | date.
// The site menu names each company "TICKER (code)" when the table does not.
async function companyList({ board, list, floor }) {
  const page = await get(list);
  const tickerOf = new Map([...page.matchAll(/>\s*([A-Za-z]+) \((\d{5})\)\s*</g)].map((m) => [m[2], m[1].toUpperCase()]));
  const lines = tables(page)[0];
  if (!lines) throw new Error(`YSX ${board}: no company table`);
  if (lines[0]?.[0] !== "Company name" || lines[0]?.[1] !== "Code") throw new Error(`YSX ${board}: unexpected header ${lines[0]?.join("|")}`);
  const companies = [];
  for (const cells of lines.slice(1).filter((cells) => /^\d{5}$/.test(cells[1]))) {
    const ticker = cells[0].match(/\(([A-Z]+)\)\s*$/)?.[1] || tickerOf.get(cells[1]);
    if (!ticker) throw new Error(`YSX ${board}: no ticker for ${cells[0]} ${cells[1]}`);
    companies.push({ ticker, name: cells[0].replace(/\s*\([A-Z]+\)\s*$/, ""), code: cells[1], since: cells[2] || "" });
  }
  if (companies.length < floor) throw new Error(`YSX ${board}: ${companies.length} companies`);
  return companies;
}

// Delisting / deregistration / watch list: "<date> | Company name | Code | Reason".
// An empty list prints one row of dashes. Returns code -> "date: reason".
async function codeList(board, url, what) {
  const page = await get(url);
  const lines = tables(page)[0];
  if (!lines) throw new Error(`YSX ${board} ${what}: no table`);
  const header = lines[0] || [];
  if (header[1] !== "Company name" || header[2] !== "Code") throw new Error(`YSX ${board} ${what}: unexpected header ${header.join("|")}`);
  const codes = new Map();
  for (const cells of lines.slice(1)) {
    if (cells.every((cell) => /^[–\-\s]*$/.test(cell))) continue;
    const code = cells[2]?.match(/\d{5}/)?.[0];
    if (!code) throw new Error(`YSX ${board} ${what}: unreadable row ${cells.join("|")}`);
    codes.set(code, `${cells[0]}: ${cells[3] || ""}`.trim());
  }
  return codes;
}

// Stock trading data: the day's quote per code, plus the foreign buy order status.
async function tradingData({ board, trading }) {
  const page = await get(trading);
  const asOf = decode(page.match(/As of([^<]+)</)?.[1] || "");
  const all = tables(page);
  const book = all.find((lines) => lines[0]?.[0] === "Name" && lines[0]?.[1] === "Code" && lines[0]?.[2] === "Close" && lines[0]?.includes("No. of listed shares"));
  if (!book) throw new Error(`YSX ${board}: no stock trading table`);
  const quoted = new Map();
  for (const cells of book.slice(1)) {
    if (!/^\d{5}$/.test(cells[1] || "")) continue;
    quoted.set(cells[1], { ticker: cells[0].replace(/\s*\(PLB\)\s*$/, ""), close: cells[2], volume: cells[8] });
  }
  const foreign = new Map();
  const status = all.find((lines) => lines[0]?.[0] === "Name" && lines.some((cells) => /^Issue Code/.test(cells[0] || "")));
  if (status) {
    const codes = status.find((cells) => /^Issue Code/.test(cells[0]));
    const buy = status.find((cells) => /^Status of buy order acceptance/.test(cells[0] || ""));
    if (codes && buy) codes.slice(1).forEach((code, i) => { if (/^\d{5}$/.test(code) && buy[i + 1]) foreign.set(code, buy[i + 1]); });
  }
  return { asOf, quoted, foreign };
}

function stocksCsvIsins() {
  const isins = new Map();
  for (const line of fs.readFileSync(STOCKS, "utf8").split("\n")) {
    const m = line.match(/^YSX:([A-Z0-9.]+),YSX,([A-Z]{2}[A-Z0-9]{9}\d),/);
    if (m) isins.set(m[1], m[2]);
  }
  return isins;
}

// Returns one row per YSX share that trades: { query, ticker, name, exchange,
// mic, currency, type, isin, raw }; raw starts with the board name.
// boards: which boards to keep ("Main Board", "Pre-Listing Board"); default both.
export async function ysxBook({ boards = YSX_BOARDS.map((b) => b.board), log = console.error } = {}) {
  const isins = stocksCsvIsins();
  const rows = [];
  for (const spec of YSX_BOARDS.filter((b) => boards.includes(b.board))) {
    const companies = await companyList(spec);
    await sleep(600);
    const removed = await codeList(spec.board, spec.removed, "delisting");
    await sleep(600);
    const watch = await codeList(spec.board, spec.watch, "watch list");
    await sleep(600);
    const { asOf, quoted, foreign } = await tradingData(spec);
    await sleep(600);
    if (!quoted.size) throw new Error(`YSX ${spec.board}: the stock trading table is empty`);
    for (const company of companies) {
      const { ticker, name, code, since } = company;
      if (removed.has(code)) { log(`YSX ${spec.board}: ${ticker} dropped, delisted ${removed.get(code)}`); continue; }
      const quote = quoted.get(code);
      if (!quote) { log(`YSX ${spec.board}: ${ticker} (${code}) dropped, not on the stock trading data of ${asOf}`); continue; }
      if (quote.ticker !== ticker) throw new Error(`YSX ${spec.board}: code ${code} is ${ticker} on the list, ${quote.ticker} on the trading data`);
      const foreignBuy = foreign.get(code) || "";
      rows.push({
        query: ticker,
        ticker,
        name,
        exchange: "Yangon Stock Exchange",
        mic: "YSX",
        currency: "MMK",
        type: "STOCK",
        isin: isins.get(ticker) || "",
        raw: [
          spec.board,
          ticker,
          name,
          `code ${code}`,
          since,
          watch.has(code) ? `watch list ${watch.get(code)}` : "",
          foreignBuy ? `foreign buy orders ${foreignBuy}` : "",
        ].filter(Boolean).join(" | "),
      });
    }
    const listed = new Set(companies.map((c) => c.code));
    const unlisted = [...quoted.keys()].filter((code) => !listed.has(code));
    if (unlisted.length) log(`YSX ${spec.board}: quoted but not on the company list: ${unlisted.map((c) => `${quoted.get(c).ticker} ${c}`).join(", ")}`);
  }
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await ysxBook();
  const counts = {};
  for (const row of rows) { const key = `${row.raw.split(" | ")[0]} ${row.type}`; counts[key] = (counts[key] || 0) + 1; }
  console.error(`${rows.length} YSX lines`, counts, `without ISIN: ${rows.filter((r) => !r.isin).map((r) => r.ticker).join(" ") || "none"}`);
  for (const row of rows) console.log(`${row.ticker}\t${row.isin}\t${row.raw}`);
}
