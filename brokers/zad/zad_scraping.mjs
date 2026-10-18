// Zad (The Securities House, Kuwait) trades US stocks and ETFs. Its public
// "Assets" page is fed by an open API that pages through every symbol Zad
// carries, with the company name, a Shari'a flag and a tradable flag.
// No login.
//
//   https://www.joinzad.com/assets/
//   https://api.joinzad.com/api/v1/asset/asset-exports?page=0&size=2000
//
// Rows with tradable=false are skipped, and so are units, warrants and
// rights. Zad prints no venue, type or ISIN. The venue comes from the
// Nasdaq Trader symbol directory, which lists every security on a US
// exchange today; its ETF flag, or a line in assets/etfs.csv, makes a row an
// ETF. The API still marks about 2,400 delisted names tradable: a symbol
// that is in neither the directory nor, as an over-the-counter line (mostly
// ADRs), in assets/stocks.csv is dropped. The ISIN comes from the asset lists.
//
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//
//   node brokers/zad/zad_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv } from "../../indianCash.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const API = "https://api.joinzad.com/api/v1/asset/asset-exports";
const PAGE = 2000;
const NASDAQ = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
// Places in the asset lists that are a US exchange.
const VENUES = { NYSE: "XNYS", NASDAQ: "XNAS", AMEX: "XASE", CBOE: "BATS" };
// otherlisted.txt exchange codes; Q is the Nasdaq file itself.
const DIRECTORY = {
  Q: ["Nasdaq", "XNAS"],
  N: ["NYSE", "XNYS"],
  A: ["NYSE American", "XASE"],
  P: ["NYSE Arca", "ARCX"],
  Z: ["Cboe BZX", "BATS"],
  V: ["IEX", "IEXG"],
  F: ["NYSE Texas", "XCHI"],
};
const NOT_SHARE = /\b(units?|warrants?|rights?)\b/i;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOk(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, Origin: "https://www.joinzad.com" },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const getJson = async (url) => (await fetchOk(url, "application/json")).json();
const getText = async (url) => (await fetchOk(url, "text/plain")).text();

// Catalogue spelling of a Zad symbol: ABR.PRD -> ABR/PD, BF.B stays BF.B.
function spellings(symbol) {
  const out = [symbol];
  const preferred = symbol.match(/^([A-Z]+)\.PR([A-Z]?)$/);
  if (preferred) out.push(`${preferred[1]}/P${preferred[2]}`);
  if (symbol.includes(".")) out.push(symbol.replace(".", "/"));
  return out;
}

// Directory spellings: a preferred ABR.PRD is ABR$D (ACT), ABRpD (CQS) or
// ABR-D (Nasdaq); a class share BF.B is BF.B or BF/B.
function directoryKeys(symbol) {
  const out = [symbol, symbol.replace(/\./g, "/")];
  const preferred = symbol.match(/^([A-Z]+)\.PR([A-Z]?)$/);
  if (preferred) out.push(`${preferred[1]}$${preferred[2]}`, `${preferred[1]}p${preferred[2]}`, `${preferred[1]}-${preferred[2]}`);
  return out;
}

// Every line of the two directory files, test issues left out, by each of
// its symbol spellings.
function directory(nasdaqText, otherText) {
  const listings = new Map();
  for (const [text, file] of [[nasdaqText, "nasdaq"], [otherText, "other"]]) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines.shift().split("|");
    const column = (name) => {
      const index = header.indexOf(name);
      if (index < 0) throw new Error(`${file} directory has no ${name} column`);
      return index;
    };
    const keys = file === "nasdaq" ? ["Symbol"] : ["ACT Symbol", "CQS Symbol", "NASDAQ Symbol"];
    const [etf, test] = ["ETF", "Test Issue"].map(column);
    const exchange = file === "nasdaq" ? -1 : column("Exchange");
    let count = 0;
    for (const line of lines) {
      const cells = line.split("|");
      if (cells.length < header.length || cells[test] === "Y") continue;
      const venue = DIRECTORY[file === "nasdaq" ? "Q" : cells[exchange]];
      if (!venue) continue;
      count += 1;
      for (const key of keys.map((name) => cells[column(name)]).filter(Boolean)) {
        if (!listings.has(key)) listings.set(key, { exchange: venue[0], mic: venue[1], etf: cells[etf] === "Y" });
      }
    }
    if (count < 3000) throw new Error(`${file} directory has only ${count} lines`);
  }
  return listings;
}

function catalogue() {
  const byTicker = new Map();
  for (const [file, type] of [["../../assets/stocks.csv", "STOCK"], ["../../assets/etfs.csv", "ETF"]]) {
    for (const row of parseCsv(fs.readFileSync(new URL(file, import.meta.url), "utf8"))) {
      const venue = normalize(row.exchange).toUpperCase();
      if (!VENUES[venue] && venue !== "OTC") continue;
      const ticker = normalize(row.ticker).split(":").pop().toUpperCase();
      const isin = normalize(row.isin).toUpperCase();
      if (!byTicker.has(ticker)) byTicker.set(ticker, []);
      byTicker.get(ticker).push({ venue, type, isin: /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) ? isin : "" });
    }
  }
  return byTicker;
}

const assets = [];
let total = 0;
for (let page = 0; ; page += 1) {
  if (page > 50) throw new Error("asset export did not end");
  const body = await getJson(`${API}?page=${page}&size=${PAGE}`);
  if (!total) total = body.paginationMeta.totalElements;
  assets.push(...body.content);
  if (page + 1 >= body.paginationMeta.totalPages) break;
  await sleep(300);
}
if (assets.length !== total) throw new Error(`export announced ${total}, returned ${assets.length}`);

const book = catalogue();
const listed = directory(await getText(NASDAQ), await getText(OTHER));
const rows = [];
const seen = new Set();
const tally = { untradable: 0, notShare: 0, otcOnly: 0, delisted: 0 };
for (const asset of assets) {
  const symbol = normalize(asset.symbol).toUpperCase();
  const name = normalize(asset.companyName);
  if (!asset.tradable) {
    tally.untradable += 1;
    continue;
  }
  if (NOT_SHARE.test(name) || /\.(U|WS|RT)$/.test(symbol)) {
    tally.notShare += 1;
    continue;
  }
  const all = spellings(symbol).flatMap((spelling) => book.get(spelling) || []);
  const hits = all.filter((hit) => VENUES[hit.venue]);
  const line = directoryKeys(symbol).map((key) => listed.get(key)).find(Boolean);
  let exchange, mic, isins;
  if (line) {
    ({ exchange, mic } = line);
    isins = hits.map((hit) => hit.isin);
  } else if (all.some((hit) => hit.venue === "OTC")) {
    exchange = "OTC";
    tally.otcOnly += 1;
    isins = all.filter((hit) => hit.venue === "OTC").map((hit) => hit.isin);
  } else {
    tally.delisted += 1;
    continue;
  }
  const type = line?.etf || hits.some((hit) => hit.type === "ETF") ? "ETF" : "STOCK";
  isins = [...new Set(isins.filter(Boolean))];
  const key = `${exchange}|${symbol}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push({
    query: symbol,
    ticker: symbol,
    name,
    exchange,
    ...(mic ? { mic } : {}),
    currency: "USD",
    type,
    isin: isins.length === 1 ? isins[0] : "",
    raw: [symbol, name, asset.sector, asset.shariahFlag ? "shariah" : ""].filter(Boolean).join(" | "),
  });
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("zad-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
console.error(`${rows.length} rows from ${assets.length} exported symbols`, tally);
