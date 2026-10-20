// What Qatar Securities Company sells in shares and exchange-traded funds,
// with no login. QSC deals on the Qatar Stock Exchange alone, and its public
// main market watch is the book: the page reads the broker's own WordPress
// endpoint, which answers with every QSE line it quotes, each with its
// English name, its currency and a sector. The sector "ETF" is the two QSE
// funds (QE Index ETF, Al Rayan Qatar ETF); every other sector, the venture
// market included, is a share. The feed carries no ISIN. One is copied from
// stocks.csv when that ticker on QSE names a single Qatari ISIN; the two
// funds have none there and stay without. Debt instruments are not on this
// board.
//
// venues.mjs has no Qatar book yet, so the rows say "Qatar Stock Exchange"
// with its MIC (DSMD) and resolveVenue leaves them unresolved.
//
//   https://qatar-securities.com/main-market-watch/
//   https://qatar-securities.com/wp-json/qse/v1/last-stocks
//
//   node brokers/qsc/qsc_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const PAGE = "https://qatar-securities.com/main-market-watch/";
const FEED = "https://qatar-securities.com/wp-json/qse/v1/last-stocks";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EXCHANGE = "Qatar Stock Exchange";
const MIC = "DSMD";
const FLOOR = { STOCK: 45, ETF: 2 };
// The sectors the board prints after their number ("1- Banks & Financial
// Services"). A new one is a change worth looking at, so it stops the run.
const SECTORS = {
  "Banks & Financial Services": "STOCK",
  "Consumer Goods & Services": "STOCK",
  Industrials: "STOCK",
  Insurance: "STOCK",
  "Real Estate": "STOCK",
  Telecoms: "STOCK",
  Transportation: "STOCK",
  "Venture Market": "STOCK",
  ETF: "ETF",
};

async function jsonOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: PAGE },
        signal: AbortSignal.timeout(45000),
      });
      if (response.ok) return JSON.parse(await response.text());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

// stocks.csv files Qatar as QSE. A ticker that names exactly one Qatari ISIN
// there is that line; anything else stays without.
function qseIsins() {
  const found = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const [ticker, place, isin] = line.split(",");
    if (place !== "QSE" || !/^QA[A-Z0-9]{10}$/.test(isin || "")) continue;
    const code = String(ticker).split(":").pop().trim().toUpperCase();
    if (!found.has(code)) found.set(code, new Set());
    found.get(code).add(isin);
  }
  return found;
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const body = await jsonOf(FEED);
const book = body?.stocks;
if (!Array.isArray(book)) throw new Error("the market watch did not return a stock list");

const isins = qseIsins();
const rows = [];
const seen = new Set();
for (const line of book) {
  const ticker = clean(line.symbol).toUpperCase();
  const name = clean(line.symbolNameEnglish) || clean(line.symbolNameE);
  if (!/^[A-Z][A-Z0-9]{2,7}$/.test(ticker) || !name) throw new Error(`unreadable line: ${JSON.stringify(line).slice(0, 160)}`);
  if (clean(line.exchange) !== "QE") throw new Error(`${ticker} is on exchange ${line.exchange}`);
  const currency = clean(line.cuR_CODE).toUpperCase();
  if (currency !== "QAR") throw new Error(`${ticker} trades in ${currency || "no currency"}`);
  const sector = clean(line.sectorE).replace(/^\d+\s*-\s*/, "");
  const type = SECTORS[sector];
  if (!type) throw new Error(`${ticker} is in an unknown sector: ${line.sectorE}`);
  if ((type === "ETF") !== /\bETF\b/i.test(name)) throw new Error(`${ticker} (${name}) is filed under ${sector}`);
  if (seen.has(ticker)) throw new Error(`${ticker} repeats`);
  seen.add(ticker);
  const hit = isins.get(ticker);
  const isin = type === "STOCK" && hit?.size === 1 ? [...hit][0] : "";
  rows.push({
    query: isin || ticker,
    ticker,
    name,
    exchange: EXCHANGE,
    mic: MIC,
    currency,
    type,
    ...(isin ? { isin } : {}),
    raw: [ticker, clean(line.symbolNameE), name, line.sectorE, line.exchange, line.marketType, currency].map(clean).join(" "),
  });
}

const count = { STOCK: 0, ETF: 0 };
for (const row of rows) count[row.type] += 1;
for (const [type, floor] of Object.entries(FLOOR)) {
  if (count[type] < floor) throw new Error(`only ${count[type]} ${type} lines on QSE (expected at least ${floor})`);
}

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("qsc-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const withIsin = rows.filter((row) => row.isin).length;
console.error(`${rows.length} listings: ${EXCHANGE} STOCK ${count.STOCK}, ${EXCHANGE} ETF ${count.ETF}; ${withIsin} ISINs. Left out: none.`);
