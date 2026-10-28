// Every share and exchange-traded fund on the Athens Stock Exchange
// (Euronext Athens since 2025, the former athexgroup.gr) today, read from
// the exchange's own lists, for the brokers that sell Athens whole
// (hellenicamerican).
//
// The lists are the JSON files behind the exchange's "Stocks" and "ETFs"
// pages (athexgroup.gr now redirects to athens.euronext.com):
//   https://athens.euronext.com/en/market-data/instruments/stocks
//   https://athens.euronext.com/sites/default/files/json_data_files/stocks_en.json
//   https://athens.euronext.com/sites/default/files/json_data_files/etfs_en.json
// Each line gives the code, issuer, ISIN and market: "SECURITIES MARKET"
// (the regulated Main Market, with its Surveillance segment) or "EN.A.
// Growth" (Euronext Growth Athens, the former Alternative Market, EN.A.).
// Both are kept; 138 and 14 shares, and one ETF (AETF), on 2026-10-23.
// The share list carries ordinary shares, two preferred lines (LEBEP,
// XYLEP) and one GDR (MERKO); all are shares here.
//
// The status of each line is the page's own feed (the "inbroker" JSON the
// page reads next to the list):
//   https://athens.euronext.com/en/market-data/instruments/stocks/inbroker
//   https://athens.euronext.com/en/market-data/instruments/etfs/inbroker
// A line whose instrument status is not "Active" ("Suspended": BIOT, DUR,
// MPITR, PRD, YALCO on the Surveillance segment and MASTIHA on EN.A. on
// 2026-10-23) is dropped. A line the feed does not carry stops the run.
// Warrants, bonds and derivatives are other pages and are not read.
//
// Rows: exchange "Athens Stock Exchange", MIC XATH (EN.A. lines too, as in
// the other Athens catalogues), EUR, the exchange's ISIN, and the name of
// ../../assets/stocks.csv or etfs.csv for that ISIN, else the issuer.
// book.popularity gives each ISIN's turnover of the session and market
// capitalisation in euros.
//
// Use:
//   import { athexBook } from "../hellenicamerican/athexBook.mjs";
//   const { rows, dropped, tradeDate } = await athexBook();
//
//   node brokers/hellenicamerican/athexBook.mjs      prints the counts

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const SITE = "https://athens.euronext.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MARKETS = { "SECURITIES MARKET": "Main Market", "EN.A. Growth": "EN.A. Growth" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(path) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(SITE + path, { headers: { "User-Agent": UA, Accept: "application/json, */*" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) {
        const json = await response.json();
        if (json && Array.isArray(json.data)) return json;
        last = `${path}: no data`;
      } else last = `${response.status} ${path}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

function assetNames() {
  const names = new Map();
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const text = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const cells = line.split(",");
      if (cells[1] !== "ATHEX" || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(cells[2] || "")) continue;
      if (!names.has(cells[2])) names.set(cells[2], cells.slice(3).join(",").replace(/^"|"$/g, "").trim());
    }
  }
  if (names.size < 100) throw new Error(`assets hold only ${names.size} ATHEX lines`);
  return names;
}

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

export async function athexBook() {
  const lists = {};
  for (const product of ["stocks", "etfs"]) {
    lists[product] = (await getJson(`/sites/default/files/json_data_files/${product}_en.json`)).data;
    await sleep(500);
    lists[`${product}Status`] = await getJson(`/en/market-data/instruments/${product}/inbroker`);
    await sleep(500);
  }
  const names = assetNames();
  const rows = [];
  const dropped = [];
  const popularity = new Map();
  let tradeDate = "";
  for (const [product, type] of [["stocks", "STOCK"], ["etfs", "ETF"]]) {
    const status = new Map(lists[`${product}Status`].data.map((line) => [line.isinCode, line]));
    for (const line of lists[product]) {
      const ticker = clean(line.Symbol);
      const isin = clean(line.ISIN).toUpperCase();
      if (!ticker || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) throw new Error(`Athens line without code or ISIN: ${JSON.stringify(line)}`);
      const market = type === "ETF" ? "ETF" : MARKETS[line.Market];
      if (!market) throw new Error(`${ticker} is on an unknown Athens market ${line.Market}`);
      const live = status.get(isin);
      if (!live || live.instrCode !== ticker) throw new Error(`${ticker} ${isin} has no status line`);
      if (live.currCode !== "EUR") throw new Error(`${ticker} trades in ${live.currCode}`);
      tradeDate = live.tradeDate > tradeDate ? live.tradeDate : tradeDate;
      if (live.instrStatusName !== "Active") {
        dropped.push(`${ticker} (${live.instrStatusName}, ${live.subMarketName})`);
        continue;
      }
      const issuer = clean(line._issuerFullName || line.Issuer);
      rows.push({
        query: isin,
        ticker,
        name: names.get(isin) || issuer,
        exchange: "Athens Stock Exchange",
        mic: "XATH",
        currency: "EUR",
        type,
        isin,
        raw: [ticker, clean(live.instrName), issuer, isin, market, live.subMarketName, live.cfiCode].join(" | "),
      });
      popularity.set(isin, { turnover: Number(live.totalInstrTurnover) || 0, capitalization: Number(live.capitalization) || 0 });
    }
  }
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.isin)) throw new Error(`${row.isin} (${row.ticker}) is listed twice`);
    seen.add(row.isin);
  }
  for (const ticker of ["ETE", "ALPHA", "PPC", "ALWN", "EUROB", "AETF"]) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`Athens book has no ${ticker}`);
  }
  const shares = rows.filter((row) => row.type === "STOCK").length;
  if (shares < 120) throw new Error(`only ${shares} Athens shares`);
  if (dropped.length > 20) throw new Error(`${dropped.length} Athens lines not active, check the feed`);
  rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
  return { rows, dropped, popularity, tradeDate, counts: { stocks: lists.stocks.length, etfs: lists.etfs.length } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const book = await athexBook();
  const count = {};
  for (const row of book.rows) {
    const key = `${row.type} ${row.raw.split(" | ")[4]}`;
    count[key] = (count[key] || 0) + 1;
  }
  console.log(`athexBook: ${book.rows.length} rows ${JSON.stringify(count)}; lists ${JSON.stringify(book.counts)}; trade date ${book.tradeDate}; dropped ${book.dropped.join(", ") || "none"}`);
}
