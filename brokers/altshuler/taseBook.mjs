// Every share and exchange-traded fund on the Tel Aviv Stock Exchange
// today, read from the exchange's own market-data API (the JSON behind
// market.tase.co.il), for the brokers that sell TASE whole (altshuler,
// mercantile).
//
// Three lists, each read page by page (30 lines a page) to its TotalRec:
//   - shares: "Securities > Shares" of the securities market-data table
//     (security/securitiesmarketdata, cl1 1 = the "Shares" class of
//     security/securitiesclassifications, cl2 0 = all its sub-classes:
//     ordinary shares, REITs, participating units of limited partnerships,
//     foreign and dual-listed shares). A participating unit (oil and gas
//     and venture partnerships: NWMD, RATI, ISRA...) is the partnership's
//     listed equity and stays a share, as partnership units do in
//     ../wellstrade/usBook.mjs;
//   - ETFs: the exchange's "ETFs & Hi-Tech Funds" table (marketdata/etfs),
//     the Israeli exchange-traded funds (kranot sal, the former teudot sal
//     became funds in 2019-2020). Its one hi-tech fund (IsHiTech, IBITEC.F)
//     is a closed fund of unlisted tech holdings, not an ETF: it is kept as
//     a share, as listed closed-end funds are in usBook;
//   - foreign ETFs: the "Foreign ETFs" table (marketdata/foreignetfs), the
//     UCITS ETFs of iShares and Invesco cross-listed in Tel Aviv.
// Warrants, convertible and corporate bonds, government bonds, T-bills
// (makam), options and futures are other classes and are not read.
//
// Suspended: a line the exchange flags "Sus" (Security Suspended from
// trading) or files under "Suspended Securities" (cl1 1, cl2 4; eight
// lines on 2026-10-23, AMX, AILN, BULL-M, GLEN-M, HIVE, NXGN-M, UNVO-M,
// WNBZ-L) is dropped. A share on the maintenance list ("-M"/"-L" codes,
// indicator "Mn") still trades in two auctions a day and stays.
//
// Prices are in agorot (a hundredth of a shekel); the rows say ILS, as the
// other TASE catalogues (../ibkrus) do. Name and ISIN: the exchange's
// ISIN, and the name of ../../assets/stocks.csv or etfs.csv for that ISIN
// (the exchange's English names are cut at 15 characters), else the
// exchange's own.
//
//   https://market.tase.co.il/en/market_data/securities/data/all
//   https://market.tase.co.il/en/market_data/etfs
//   https://api.tase.co.il/api/security/securitiesclassifications?lang=1
//   https://api.tase.co.il/api/security/securitiesmarketdata (POST)
//   https://api.tase.co.il/api/marketdata/etfs (POST)
//   https://api.tase.co.il/api/marketdata/foreignetfs (POST)
// The API answers a browser-like request only (Accept and Accept-Language
// headers, the market site as Origin); a bare one gets "Request Rejected".
//
// Each row also carries the session's turnover and market value in
// thousands of shekels (book.popularity), for a broker that states a
// count of titles.
//
// Use:
//   import { taseBook } from "../altshuler/taseBook.mjs";
//   const { rows, dropped, tradeDate } = await taseBook();
//
//   node brokers/altshuler/taseBook.mjs      prints the counts

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api.tase.co.il/api/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://market.tase.co.il",
  Referer: "https://market.tase.co.il/",
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path, body) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(API + path, { method: "POST", headers: HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
      if (response.ok) {
        const json = await response.json();
        if (json && Array.isArray(json.Items)) return json;
        last = `${path}: no Items`;
      } else last = `${response.status} ${path}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// Every page of one table.
async function table(path, filter) {
  const items = [];
  let total = 0;
  let tradeDate = "";
  for (let page = 1; page <= 100; page += 1) {
    const json = await post(path, { dType: 1, TotalRec: 1, pageNum: page, lang: "1", ...filter });
    total = Number(json.TotalRec) || 0;
    tradeDate = json.TradeDate || tradeDate;
    items.push(...json.Items);
    if (!json.Items.length || items.length >= total) break;
    await sleep(300);
  }
  const ids = new Set(items.map((item) => item.Id));
  if (ids.size !== total) throw new Error(`${path} ${JSON.stringify(filter)}: ${ids.size} lines for ${total}`);
  return { items, tradeDate };
}

function assetNames() {
  const names = new Map();
  for (const [file, type] of [["stocks.csv", "STOCK"], ["etfs.csv", "ETF"]]) {
    const text = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const cells = line.split(",");
      if (cells[1] !== "TASE" || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(cells[2] || "")) continue;
      if (!names.has(cells[2])) names.set(cells[2], { name: cells.slice(3).join(",").replace(/^"|"$/g, "").trim(), type });
    }
  }
  if (names.size < 800) throw new Error(`assets hold only ${names.size} TASE lines`);
  return names;
}

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const suspended = (item) => (item.GreenIndicators || []).some((flag) => flag.Key === "Sus");

export async function taseBook() {
  const shares = await table("security/securitiesmarketdata", { cl1: "1", cl2: "0" });
  const halted = await table("security/securitiesmarketdata", { cl1: "1", cl2: "4" });
  const etfs = await table("marketdata/etfs", {});
  const foreign = await table("marketdata/foreignetfs", {});
  const names = assetNames();
  const haltedIds = new Set(halted.items.map((item) => item.Id));

  const rows = [];
  const dropped = [];
  const popularity = new Map();
  const take = (item, isin, type, taseName, kind) => {
    const ticker = clean(item.Symbol);
    if (!ticker || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin || "")) throw new Error(`TASE line without symbol or ISIN: ${JSON.stringify(item).slice(0, 200)}`);
    if (suspended(item) || haltedIds.has(item.Id)) {
      dropped.push(`${ticker} (suspended${item.SuspendStatusDate ? ` since ${item.SuspendStatusDate}` : ""})`);
      return;
    }
    const name = names.get(isin)?.name || taseName;
    rows.push({
      query: isin,
      ticker,
      name,
      exchange: "Tel Aviv Stock Exchange",
      mic: "XTAE",
      currency: "ILS",
      type,
      isin,
      raw: [ticker, taseName, `security ${item.Id}`, isin, kind].join(" | "),
    });
    popularity.set(isin, { turnover: Number(item.TurnOverValueShekel) || 0, marketValue: Number(item.MarketValue) || 0 });
  };
  for (const item of shares.items) {
    const kind = `${clean(item.Type)} / ${clean(item.SecuritySubType)}`;
    if (!/^(Shares|Participation Unit)$/.test(clean(item.Type))) throw new Error(`TASE share class holds ${item.Symbol} ${kind}`);
    take(item, item.ISIN_ID, "STOCK", clean(item.LongName || item.Name), kind);
  }
  for (const item of etfs.items) {
    const hiTech = item.IsHiTech === true;
    take(item, item.ISIN, hiTech ? "STOCK" : "ETF", clean(item.LongName || item.Name), hiTech ? "hi-tech fund" : `ETF / ${clean(item.Classification)}`);
  }
  for (const item of foreign.items) take(item, item.ISIN, "ETF", clean(item.LongName || item.Name), `foreign ETF / ${clean(item.FullBranch)}`);

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.isin)) throw new Error(`${row.isin} (${row.ticker}) is on two TASE lists`);
    seen.add(row.isin);
  }
  for (const ticker of ["TEVA", "LUMI", "POLI", "NICE", "ESLT", "ICL"]) {
    if (!rows.some((row) => row.ticker === ticker && row.type === "STOCK")) throw new Error(`TASE book has no share ${ticker}`);
  }
  const count = { STOCK: 0, ETF: 0 };
  for (const row of rows) count[row.type] += 1;
  if (count.STOCK < 450 || count.ETF < 350) throw new Error(`short TASE book: ${count.STOCK} shares, ${count.ETF} ETFs`);
  if (dropped.length > 25) throw new Error(`${dropped.length} TASE lines suspended, check the lists`);
  rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
  return {
    rows,
    dropped,
    popularity,
    tradeDate: shares.tradeDate,
    counts: { shares: shares.items.length, etfs: etfs.items.length, foreignEtfs: foreign.items.length, suspended: halted.items.length },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const book = await taseBook();
  const count = {};
  for (const row of book.rows) count[row.type] = (count[row.type] || 0) + 1;
  console.log(
    `taseBook: ${book.rows.length} rows (${Object.entries(count).map(([type, n]) => `${n} ${type}`).join(", ")}); trade date ${book.tradeDate}; ` +
      `lists ${JSON.stringify(book.counts)}; named from assets ${book.rows.filter((row) => !row.raw.startsWith(`${row.ticker} | ${row.name} |`)).length}; ` +
      `dropped ${book.dropped.join(", ") || "none"}`
  );
}
