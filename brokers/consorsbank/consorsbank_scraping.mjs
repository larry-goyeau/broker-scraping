// What Consorsbank (BNP Paribas, Germany) sells as shares and ETFs, with no
// login. Its public market-data service has a share finder and an ETF
// finder, 50 lines a page, sorted by name so the paging stays stable. Each
// finder line gives the ISIN, the WKN (NSIN) and the name used here.
//
//   https://www.consorsbank.de/web-financialinfo-service/api/marketdata/stocks/finderv1?pagesize=50&page=N&sort=name_asc
//   https://www.consorsbank.de/web-financialinfo-service/api/marketdata/etfs/finderv1?pagesize=50&page=N&sort=name_asc
//
// The places of a title are its "ExchangesV2" list, read with its "BasicV1"
// block in the same call:
//
//   https://www.consorsbank.de/web-financialinfo-service/api/marketdata/stocks?id=<ISIN>&field=ExchangesV2&field=BasicV1
//   https://www.consorsbank.de/web-financialinfo-service/api/marketdata/etfs?id=<ISIN>&field=ExchangesV2&field=BasicV1
//
// One line of that list is one place and one currency. Only lines flagged
// IS_TRADEABLE are kept. The flag is absent for places Consorsbank shows a
// price for but does not route to, such as Tokyo. A title left with no
// tradable line is dropped. Each kept place and currency is one row: the
// German floors, gettex, LS Exchange, Quotrix and Tradegate, SIX (its CHF,
// USD, EUR and GBP lines), London (GBX, GBP, USD, EUR and other lines),
// Euronext with its Growth and Access segments, Madrid and BME Growth, the
// Nordic markets with First North, and the Canadian markets (TSX, TSX
// Venture, CSE, and "CNSX Pure Trading", stored as Pure Trading). "Nasdaq
// Basic" is Nasdaq's feed of the whole American tape; the US is one NBBO
// market, so it gives one US row. A line in a currency the euro replaced
// (one Stuttgart line in ATS) is a data error and is skipped. A place code
// the table below does not know is skipped and printed.
//
// Left out: "außerbörslich Deutschland" (direct trading with Baader, Lang &
// Schwarz, Société Générale and other market makers or issuers: no
// exchange book), the fund-company lines such as "BlackRock Asset
// Management Ireland Limited - EUR" (a subscription with the issuer, not a
// trade), and "London Stock Exchange European Trade Reporting" (a report of
// off-book trades, not a book; comdirect's scraper leaves it out too).
// "Euronext Expert Market" (Brussels' periodic auctions of delisted and
// unlisted lines, with no continuous book) is left out as well. Every
// other line whose code starts with "@" is direct trading too and stays out.
// "Stuttgart FXplus" is Börse Stuttgart's foreign-currency segment: it is
// stored as Börse Stuttgart in its own currency, and folds into the
// ordinary Stuttgart row when the currency is the same. Börse Düsseldorf
// and Quotrix (Düsseldorf's electronic book) stay two rows, as Consorsbank
// shows them. Xetra answers the currency "$$$" for some foreign shares; its
// price there is the euro price, so the line is read as EUR.
//
// Ticker: the service gives no ticker per place. BasicV1.SYMBOL is the
// Deutsche Börse short code that every German venue shares, so a German
// row carries it. A foreign row carries the WKN. The US row takes its US
// ticker and listing exchange (Nasdaq, NYSE, NYSE American) from
// assets/stocks.csv; a US title not found there keeps its WKN and is
// stored as Nasdaq, which stands in for the tape. Pence lines (GBp) are
// written GBX.
//
// Type: a share-finder title is a STOCK. An ETF-finder title is an ETF,
// an ETC or ETN when its name says so.
//
// The detail answers are cached one file per title outside the repo, so a
// rerun resumes; --fresh ignores the cache.
//
//   node brokers/consorsbank/consorsbank_scraping.mjs
//   node brokers/consorsbank/consorsbank_scraping.mjs --cache=/some/dir --fresh --limit=50

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://www.consorsbank.de/web-financialinfo-service/api/marketdata";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WORKERS = 4;
const PAGE = 50;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
// Currencies the euro replaced. A line quoted in one is a data error.
const DEAD = new Set(["ATS", "BEF", "DEM", "ESP", "FIM", "FRF", "GRD", "IEP", "ITL", "LUF", "NLG", "PTE"]);

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const CACHE = arg("cache") || path.join(os.tmpdir(), "consorsbank-detail");
const LIMIT = Number(arg("limit") || 0);
const FRESH = process.argv.includes("--fresh");
fs.mkdirSync(CACHE, { recursive: true });

// EXCHANGE_CODE -> [exchange as stored, MIC, German venue]. null drops it.
const PLACE = {
  GAT: ["Tradegate", "XGAT", true],
  GER: ["Börse Xetra", "XETR", true],
  STU: ["Börse Stuttgart", "XSTU", true],
  BTP: ["Börse Stuttgart", "XSTU", true],
  MUN: ["Börse München", "XMUC", true],
  FRA: ["Börse Frankfurt", "XFRA", true],
  HAM: ["Börse Hamburg", "XHAM", true],
  DUS: ["Börse Düsseldorf", "XDUS", true],
  HAN: ["Börse Hannover", "XHAN", true],
  TRO: ["gettex", "XMUN", true],
  LSX: ["LS Exchange", "LSEX", true],
  QUO: ["Quotrix", "XQTX", true],
  SWX: ["SIX Swiss Exchange", "XSWX", false],
  LSE: ["London Stock Exchange", "XLON", false],
  PAR: ["Euronext Paris", "XPAR", false],
  AMS: ["Euronext Amsterdam", "XAMS", false],
  BRU: ["Euronext Brussels", "XBRU", false],
  MIL: ["Euronext Milan", "XMIL", false],
  OSL: ["Oslo Børs", "XOSL", false],
  HEX: ["Nasdaq Helsinki", "XHEL", false],
  TOR: ["Toronto Stock Exchange", "XTSE", false],
  VAN: ["TSX Venture", "XTSX", false],
  CVE: ["TSX Venture", "XTSX", false],
  CNQ: ["Canadian Securities Exchange", "XCNQ", false],
  PUR: ["Pure Trading", "PURE", false],
  ALT: ["Euronext Growth Paris", "ALXP", false],
  ISE: ["Euronext Dublin", "XMSM", false],
  MCE: ["Bolsa de Madrid", "XMAD", false],
  MBA: ["BME Growth", "MABX", false],
  STO: ["Nasdaq Stockholm", "XSTO", false],
  FNS: ["First North Stockholm", "SSME", false],
  CPH: ["Nasdaq Copenhagen", "XCSE", false],
  FNH: ["First North Helsinki", "FSME", false],
  HEL: ["Nasdaq Helsinki", "XHEL", false],
  FND: ["First North Denmark", "DSME", false],
  ICX: ["Nasdaq Iceland", "XICE", false],
  FNI: ["First North Iceland", "FNIS", false],
  LIS: ["Euronext Lisbon", "XLIS", false],
  ABR: ["Euronext Growth Brussels", "ALXB", false],
  ALI: ["Euronext Growth Lisbon", "ALXL", false],
  EAP: ["Euronext Access Paris", "XMLI", false],
  ENB: ["Euronext Access Brussels", "MLXB", false],
  ENL: ["Euronext Access Lisbon", "ENXL", false],
  BER: ["Börse Berlin", "XBER", true],
  NSB: "US",
  LST: null,
  EEM: null,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function json(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      if (response.ok) return JSON.parse(text);
      last = `${response.status} ${url} ${text.slice(0, 120)}`;
    } catch (error) {
      last = `${url} ${error.message || error}`;
    }
    await sleep(700 * 2 ** attempt);
  }
  throw new Error(last);
}

async function pool(items, work) {
  let index = 0;
  const out = new Array(items.length);
  async function worker() {
    while (index < items.length) {
      const at = index++;
      out[at] = await work(items[at], at);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return out;
}

async function finder(kind) {
  const first = (await json(`${API}/${kind}/finderv1?pagesize=${PAGE}&page=1&sort=name_asc`)).FinderV1;
  const pages = Array.from({ length: first.TOTAL_PAGES - 1 }, (_, i) => i + 2);
  const rest = await pool(pages, async (page) => (await json(`${API}/${kind}/finderv1?pagesize=${PAGE}&page=${page}&sort=name_asc`)).FinderV1.ITEMS);
  const byIsin = new Map();
  for (const item of [first.ITEMS, ...rest].flat()) if (ISIN.test(item.ISIN || "")) byIsin.set(item.ISIN, item);
  console.error(`${kind}: ${byIsin.size} titles of ${first.TOTAL_AMOUNT} announced`);
  if (byIsin.size < first.TOTAL_AMOUNT * 0.98) throw new Error(`${kind} finder returned only ${byIsin.size} of ${first.TOTAL_AMOUNT}`);
  return [...byIsin.values()];
}

let done = 0;
async function detail(kind, isin) {
  const file = path.join(CACHE, `${kind}-${isin}.json`);
  if (!FRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const answer = (await json(`${API}/${kind}?id=${isin}&field=ExchangesV2&field=BasicV1`))[0] || {};
  const kept = { BasicV1: answer.BasicV1 || null, ExchangesV2: answer.ExchangesV2 || [] };
  fs.writeFileSync(file, JSON.stringify(kept));
  done += 1;
  if (done % 1000 === 0) console.error(`${done} details fetched`);
  return kept;
}

// ISIN -> [ticker, exchange, MIC] of the US listing, from the shared list.
function usListings() {
  const venue = { NASDAQ: ["Nasdaq", "XNAS"], NYSE: ["New York Stock Exchange", "XNYS"], AMEX: ["NYSE American", "XASE"] };
  const out = new Map();
  const text = fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [symbol, exchange, isin] = line.split(",");
    if (!venue[exchange] || !isin || out.has(isin)) continue;
    out.set(isin, [symbol.slice(exchange.length + 1), ...venue[exchange]]);
  }
  return out;
}

function typeOf(kind, name) {
  if (kind === "stocks") return "STOCK";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  return "ETF";
}

const currencyOf = (line) => (line.ISO_CURRENCY === "GBp" ? "GBX" : String(line.ISO_CURRENCY || "").toUpperCase());

const us = usListings();
const rows = [];
const tally = { titles: 0, noTradable: 0, noDetail: 0, usFromList: 0, usStandIn: 0, badCurrency: 0 };
const unknown = {};
const dropped = {};

for (const kind of ["stocks", "etfs"]) {
  let titles = await finder(kind);
  if (LIMIT) titles = titles.slice(0, LIMIT);
  const details = await pool(titles, (title) => detail(kind, title.ISIN));
  titles.forEach((title, at) => {
    tally.titles += 1;
    const { BasicV1: basic, ExchangesV2: lines } = details[at];
    if (!lines.length) tally.noDetail += 1;
    const name = String(title.NAME || basic?.NAME_SECURITY || "").trim();
    const wkn = title.NSIN || basic?.ID?.WKN || title.ISIN;
    const symbol = basic?.ID?.SYMBOL || "";
    const type = typeOf(kind, name);
    const seen = new Set();
    let count = 0;
    for (const line of lines) {
      if (line.IS_TRADEABLE !== true) continue;
      const code = String(line.EXCHANGE_CODE || "");
      const label = String(line.EXCHANGE_NAME || line.CONSORS_EXCHANGE_NAME || code).replace(/ - [A-Za-z]{3}$/, "");
      const place = code.startsWith("@") ? null : PLACE[code];
      if (place === undefined) {
        const key = `${code} ${label} ${line.ISO_CURRENCY}`;
        unknown[key] = (unknown[key] || 0) + 1;
        continue;
      }
      if (!place) {
        const group = code === "@W$" ? "fund company" : label;
        dropped[group] = (dropped[group] || 0) + 1;
        continue;
      }
      let currency = currencyOf(line);
      // Xetra answers "$$$" for some Spanish and Dutch shares; its price is
      // the euro price the other German places show.
      if (currency === "$$$" && place !== "US" && place[2]) currency = "EUR";
      if (!/^[A-Z]{3}$/.test(currency) || DEAD.has(currency)) {
        tally.badCurrency += 1;
        continue;
      }
      let ticker = wkn;
      let exchange;
      let mic;
      if (place === "US") {
        const hit = us.get(title.ISIN);
        if (hit) [ticker, exchange, mic] = hit;
        else [exchange, mic] = ["Nasdaq", "XNAS"];
        if (seen.has("US")) continue;
        seen.add("US");
        tally[hit ? "usFromList" : "usStandIn"] += 1;
      } else {
        const [label, code2, german] = place;
        [exchange, mic] = [label, code2];
        if (german && symbol) ticker = symbol;
      }
      const key = `${exchange} ${currency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      count += 1;
      rows.push({
        query: ticker,
        ticker,
        name,
        exchange,
        mic,
        currency,
        type,
        isin: title.ISIN,
        raw: `${name} ${title.ISIN} ${wkn}${symbol ? ` ${symbol}` : ""} | ${line.EXCHANGE_NAME} ${line.ISO_CURRENCY}`,
      });
    }
    if (!count) tally.noTradable += 1;
  });
}

rows.sort((a, b) => a.name.localeCompare(b.name) || a.isin.localeCompare(b.isin) || a.exchange.localeCompare(b.exchange) || a.currency.localeCompare(b.currency));
fs.writeFileSync(new URL("consorsbank-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const counts = {};
for (const row of rows) {
  const key = `${row.exchange} ${row.mic} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.error(`${key}: ${count}`);
const types = {};
for (const row of rows) types[row.type] = (types[row.type] || 0) + 1;
console.error("types", types);
console.error("left out", dropped);
if (Object.keys(unknown).length) console.error("UNKNOWN places", unknown);
console.error(`${rows.length} rows`, tally);
