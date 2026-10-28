// The Qatar Stock Exchange book, for a broker that deals in all of it
// (../globalsecurities). Every QSE share and ETF open to trade, in riyals,
// from the exchange's own market watch (qe.com.qa), with no login.
//
// The QSE market watch reads one data file that prints every listed line
// of the normal market (NM) with its symbol, English name, sector, kind
// (CompType) and trading state (StateEN, empty when the line trades):
//   COMP  the listed companies of the main market       STOCK
//   V     the venture market (QVM: Techno Q)              STOCK
//   ETF   QE Index ETF, Al Rayan Qatar ETF                ETF
//   BOND  government and corporate bonds, sukuk, T-bills  left out
// A line with a state (suspended, halted...) is left out.
//
//   https://www.qe.com.qa/wp/mws/index/en
//   https://www.qe.com.qa/wp/mw/data/MarketWatch.txt
//
// The file prints no ISIN. It is copied from ../../assets/stocks.csv when
// that ticker on QSE names a single Qatari ISIN, as ../qsc does; the two
// ETFs have none there and stay without (venues.mjs has no Qatar book, so
// stampRows cannot fill it).
//
// Row: { query, ticker, name, exchange "Qatar Stock Exchange", mic "DSMD",
// currency "QAR", type STOCK|ETF, isin, raw }, as ../qsc writes them.
//
//   import { qseBook } from "../globalsecurities/qseBook.mjs";
//   const { rows, leftOut } = await qseBook();
//
//   node brokers/globalsecurities/qseBook.mjs      (prints the counts)

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "Qatar Stock Exchange";
export const MIC = "DSMD";
const FEED = "https://www.qe.com.qa/wp/mw/data/MarketWatch.txt";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const KINDS = { COMP: "STOCK", V: "STOCK", ETF: "ETF" };
const FLOOR = { STOCK: 45, ETF: 2 };
const MUST = ["QNBK", "IQCD", "QETF", "ORDS"];

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://www.qe.com.qa/wp/mws/index/en" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return JSON.parse(await response.text());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(last);
}

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

export async function qseBook() {
  const lines = (await getJson(FEED))?.rows;
  if (!Array.isArray(lines) || lines.length < 60) throw new Error(`the QSE market watch has ${lines?.length ?? "no"} lines`);
  const isins = qseIsins();
  const rows = [];
  const leftOut = new Map();
  const skip = (label) => leftOut.set(label, (leftOut.get(label) || 0) + 1);
  const seen = new Set();
  for (const line of lines) {
    const ticker = clean(line.Symbol).toUpperCase();
    const name = clean(line.CompanyEN);
    const kind = clean(line.CompType);
    if (!/^[A-Z][A-Z0-9]{2,7}$/.test(ticker) || !name) throw new Error(`unreadable QSE line ${JSON.stringify(line).slice(0, 200)}`);
    if (kind === "BOND") {
      skip("bonds, sukuk and T-bills");
      continue;
    }
    const type = KINDS[kind];
    if (!type) throw new Error(`${ticker} (${name}) is of an unknown kind ${kind}`);
    if (seen.has(ticker)) throw new Error(`${ticker} repeats on the QSE market watch`);
    seen.add(ticker);
    const state = clean(line.StateEN);
    if (state) {
      skip(`${ticker} ${state}`);
      continue;
    }
    const hit = isins.get(ticker);
    const isin = type === "STOCK" && hit?.size === 1 ? [...hit][0] : "";
    rows.push({
      query: isin || ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "QAR",
      type,
      isin,
      raw: [ticker, name, clean(line.SectorEN), kind === "V" ? "Venture Market" : "Main Market", "QAR"].join(" | "),
    });
  }
  const count = { STOCK: 0, ETF: 0 };
  for (const row of rows) count[row.type] += 1;
  for (const [type, floor] of Object.entries(FLOOR)) if (count[type] < floor) throw new Error(`only ${count[type]} QSE ${type} lines`);
  for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the QSE book`);
  rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  return { rows, leftOut };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { rows, leftOut } = await qseBook();
  const count = {};
  for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
  console.log(`${rows.length} QSE rows`, count, `${rows.filter((row) => row.isin).length} with an ISIN`);
  console.log(`left out: ${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}`);
}
