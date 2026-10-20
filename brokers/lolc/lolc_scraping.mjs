// What LOLC Securities sells in shares on the Colombo Stock Exchange, with
// no login. The StockLens screener on the broker's site reads one JSON file
// from the same host: every listed share, with its ticker, name, sector and
// price. That file is the book.
//
//   https://www.lolcsecurities.lk/stock-screener
//   https://www.lolcsecurities.lk/api/stock-screener/
//
// Voting (.N), non-voting (.X) and preference (.P) shares stay. The file
// carries no right, warrant, debenture or closed-end fund unit; a line of
// that kind would be left out. The file's blank placeholder line is skipped.
// Colombo lists no exchange-traded fund. Every line is quoted in rupees.
// The ISIN is joined from assets/stocks.csv by ticker, as the Capital
// Alliance scraper does.
//
//   node brokers/lolc/lolc_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const LIST = "https://www.lolcsecurities.lk/api/stock-screener/";
const PAGE = "https://www.lolcsecurities.lk/stock-screener";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const OUTPUT = new URL("lolc-parsed.json", import.meta.url);
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

// .N voting, .X non-voting, .P preference. .R right, .D debenture,
// .U closed-end fund unit, .W warrant.
const SHARE = new Set(["N", "X", "P"]);
const OTHER = new Set(["R", "D", "U", "W"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function screener() {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(LIST, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: PAGE },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (Array.isArray(body?.data)) return body;
        last = `the screener answered ${JSON.stringify(body).slice(0, 120)}`;
      } else last = `the screener answered ${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function lkIsins() {
  const byTicker = new Map();
  const clashes = new Set();
  for (const file of [STOCKS, ETFS]) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
      const parts = line.split(",");
      if (parts.length < 4) continue;
      const isin = parts[2].trim().toUpperCase();
      const ticker = parts[0].split(":").pop().trim().toUpperCase();
      if (!isin.startsWith("LK") || !ticker) continue;
      const prev = byTicker.get(ticker);
      if (prev && prev !== isin) clashes.add(ticker);
      else byTicker.set(ticker, isin);
    }
  }
  for (const ticker of clashes) byTicker.delete(ticker);
  return byTicker;
}

const body = await screener();
const lines = body.data;
if (lines.length < 280) throw new Error(`the screener returned ${lines.length} lines`);

const isins = lkIsins();
const rows = [];
const seen = new Set();
let blank = 0;
let other = 0;
for (const line of lines) {
  const ticker = clean(line["Company Tiker"] ?? line["Company Ticker"]).toUpperCase();
  const name = clean(line["Company Name"]);
  if (!ticker && (!name || name === "0")) {
    blank += 1;
    continue;
  }
  const match = ticker.match(/^[A-Z0-9&]+\.([A-Z])\d{4}$/);
  if (!match || !name) throw new Error(`an unreadable screener line: ${JSON.stringify(line).slice(0, 200)}`);
  if (OTHER.has(match[1])) {
    other += 1;
    continue;
  }
  if (!SHARE.has(match[1])) throw new Error(`unknown share class ${match[1]} on ${ticker}`);
  if (seen.has(ticker)) continue;
  seen.add(ticker);
  const isin = isins.get(ticker) || "";
  const sector = clean(line.Sector);
  rows.push({
    query: isin || ticker,
    ticker,
    name,
    exchange: "CSE",
    currency: "LKR",
    type: "STOCK",
    isin,
    raw: [ticker, name, sector, "CSE", "LKR", "STOCK"].filter(Boolean).join(" "),
  });
}
if (blank > 3) throw new Error(`${blank} blank screener lines`);
if (rows.length < 280) throw new Error(`only ${rows.length} Colombo shares stayed`);
for (const ticker of ["JKH.N0000", "COMB.N0000", "COMB.X0000"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} was not a Colombo share`);
}

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));
const byClass = {};
for (const row of kept) {
  const share = row.ticker.match(/\.([A-Z])\d{4}$/)[1];
  byClass[share] = (byClass[share] || 0) + 1;
}
console.error(
  `${kept.length} listings on CSE (${Object.entries(byClass).map(([share, n]) => `${n} .${share}`).join(", ")}), ` +
    `${kept.filter((row) => row.isin).length} with an ISIN; file dated ${body.last_modified}; skipped ${blank} blank, ${other} other products`,
);
