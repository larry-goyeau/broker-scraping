// What Investona (Czech Asset Investments, a.s., Czech Republic) sells in
// its "Vlastní strategie" (own strategy) mode: single shares and ETFs, with
// no login. Investona's own funds are not part of this list.
//
// The public selector "Akcie a ETF" reads one JSON file, which holds every
// title it offers: "shares" (type STOCK) and "etfs" (type ETF), each with a
// name, an ISIN, a currency and a Bloomberg code ("OR FP", "IUHC LN").
//
//   https://www.investona.cz/akcie-a-etf
//   https://www.investona.cz/api/investona/products
//
// The place is the Bloomberg exchange code at the end of that code:
//
//   US, UN, UW, UQ  United States. US venues are one NBBO market, so a US
//                   title is one row, in USD, on its listing exchange from
//                   the repository's listing files (Nasdaq XNAS, NYSE XNYS,
//                   NYSE American XASE, Cboe BZX BATS), found by ISIN, the
//                   line with Investona's symbol first. UBS UN is UBS's NYSE
//                   line.
//   GY  Börse Xetra (XETR)          FP  Euronext Paris (XPAR)
//   NA  Euronext Amsterdam (XAMS)   BB  Euronext Brussels (XBRU)
//   IM  Euronext Milan (XMIL)       SM  Bolsa de Madrid (XMAD)
//   AV  Wiener Börse (XWBO)         CP  Prague Stock Exchange (XPRA)
//   LN  London Stock Exchange (XLON) SW  SIX Swiss Exchange (XSWX)
//
// The row keeps the currency Investona prints for the line and the root of
// the Bloomberg code as its ticker ("BRK/B" is written BRK.B). An ETF's
// ticker is the exchange's own symbol for that ISIN, place and currency when
// the exchange data below has one: Bloomberg's DAXEX GY is Xetra's EXS1, and
// IH2O LN in USD is London's dollar line DH2O (IH2O is the pence line). The
// place and currency stay Investona's. Euronext's ETF file has no Amsterdam
// dollar lines, so COPM, CITY, ICHN and PLAY NA stand on Investona's word.
//
// Some codes carry no exchange code (CSPX, SWDA, HONA). A share in USD with
// no exchange code is placed in the United States when a US listing file has
// its ISIN. An ETF with no exchange code is placed on every listing, on one
// of the places broker-list.json gives Investona, that has Investona's symbol
// and currency for that ISIN: the LSE's own lines, Euronext's ETF file
// (Paris, Amsterdam, Brussels, and Milan's ETFplus), SIX's reference file,
// and the Xetra and Vienna listing files (EUR). When no line has the symbol,
// every listing there in Investona's currency stands in. A line that matches
// nothing keeps one row by ISIN, with no exchange. CSPX in USD is London's
// CSPX line; SWDA in USD is SIX's USD line (London's SWDA is in pence).
//
//   https://api.londonstockexchange.com/api/gw/lse/search/autocomplete?q=<ISIN>
//   https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>
//   https://live.euronext.com/pd_es/data/track/download?mics=XPAR,XAMS,XBRU,ETFP
//   https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency&where=ISIN=<ISIN>
//
// Type: the file's own STOCK or ETF; an ETF line whose name says ETC or ETN
// is that. Every (exchange, mic, currency) is checked with resolveVenue.
//
//   node brokers/investona/investona_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { lseLines } from "../../lseListings.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SOURCE = "https://www.investona.cz/api/investona/products";
const EURONEXT = "https://live.euronext.com/pd_es/data/track/download?mics=XPAR,XAMS,XBRU,ETFP";
const SIX = "https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency&where=ISIN=";
const OUTPUT = new URL("investona-parsed.json", import.meta.url);
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const FLOOR = { shares: 120, etfs: 50 };

const US_CODES = new Set(["US", "UN", "UW", "UQ"]);
// Bloomberg exchange code -> [exchange, MIC].
const CODE = {
  GY: ["Börse Xetra", "XETR"],
  FP: ["Euronext Paris", "XPAR"],
  NA: ["Euronext Amsterdam", "XAMS"],
  BB: ["Euronext Brussels", "XBRU"],
  IM: ["Euronext Milan", "XMIL"],
  SM: ["Bolsa de Madrid", "XMAD"],
  AV: ["Wiener Börse", "XWBO"],
  CP: ["Prague Stock Exchange", "XPRA"],
  LN: ["London Stock Exchange", "XLON"],
  SW: ["SIX Swiss Exchange", "XSWX"],
};
// US listing file -> [exchange, MIC].
const US = {
  NASDAQ: ["Nasdaq", "XNAS"],
  NYSE: ["New York Stock Exchange", "XNYS"],
  AMEX: ["NYSE American", "XASE"],
  CBOE: ["Cboe BZX", "BATS"],
};
// broker-list.json place -> MIC, for the lines with no exchange code.
const PLACE_MIC = {
  "Prague Stock Exchange": "XPRA",
  "Börse Xetra": "XETR",
  "London Stock Exchange": "XLON",
  "Euronext Amsterdam": "XAMS",
  "Euronext Paris": "XPAR",
  "Euronext Milan": "XMIL",
  "Wiener Börse": "XWBO",
  "Euronext Brussels": "XBRU",
  "Bolsa de Madrid": "XMAD",
  "SIX Swiss Exchange": "XSWX",
  "New York Stock Exchange": "US",
  Nasdaq: "US",
};
const EXCHANGE = Object.fromEntries([...Object.values(CODE), ...Object.values(US)].map(([name, mic]) => [mic, name]));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, accept = "application/json") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// The places broker-list.json gives Investona, as MICs.
function investonaPlaces() {
  const list = JSON.parse(fs.readFileSync(new URL("../../broker-list.json", import.meta.url), "utf8"));
  const entry = list.find((row) => row.name === "Investona");
  if (!entry) throw new Error("Investona is not in broker-list.json");
  const places = Object.keys(entry.exchanges);
  const unknown = places.filter((place) => !PLACE_MIC[place]);
  if (unknown.length) throw new Error(`no MIC for ${unknown.join(", ")}`);
  return new Set(places.map((place) => PLACE_MIC[place]));
}

// assets/stocks.csv and etfs.csv: ISIN -> [{file, symbol}].
function listingFiles() {
  const book = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const cells = line.split(",");
      const exchange = normalize(cells[1]).toUpperCase();
      const symbol = normalize(String(cells[0] || "").split(":").slice(1).join(":")).toUpperCase();
      const isin = normalize(cells[2]).toUpperCase();
      if (!exchange || !symbol || !ISIN.test(isin)) continue;
      if (!book.has(isin)) book.set(isin, []);
      book.get(isin).push({ file: exchange, symbol });
    }
  }
  return book;
}

// Euronext's ETF file: ISIN -> [{mic, ticker, currency}]. A line listed on
// several markets ("Euronext Amsterdam, Paris") is placed on the first.
async function euronextLines() {
  const text = await get(EURONEXT, "text/csv");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0].split(";").map((cell) => cell.replace(/"/g, ""));
  const at = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Euronext file has no ${name} column`);
    return index;
  };
  const [isin, symbol, market, currency] = ["ISIN", "Symbol", "Market", "Currency"].map(at);
  const out = new Map();
  let count = 0;
  for (const line of lines.slice(1)) {
    const cells = line.match(/("[^"]*"|[^;]*)(;|$)/g)?.map((cell) => cell.replace(/;$/, "").replace(/^"|"$/g, "").trim()) || [];
    if (!ISIN.test(cells[isin] || "")) continue;
    const first = cells[market].split(",")[0].trim();
    const mic = /^ETF Plus/i.test(first) ? "XMIL" : /^Euronext Paris/i.test(first) ? "XPAR" : /^Euronext Amsterdam/i.test(first) ? "XAMS" : /^Euronext Brussels/i.test(first) ? "XBRU" : "";
    if (!mic) continue;
    if (!out.has(cells[isin])) out.set(cells[isin], []);
    out.get(cells[isin]).push({ mic, ticker: cells[symbol].toUpperCase(), currency: cells[currency].toUpperCase(), from: "Euronext" });
    count += 1;
  }
  if (count < 1500) throw new Error(`Euronext file has only ${count} ETF lines`);
  return out;
}

// SIX's lines of one ISIN, each with its symbol and trading currency.
async function sixLines(isin) {
  const text = await get(SIX + encodeURIComponent(isin), "text/csv");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  if (lines[0] !== "ISIN;ValorSymbol;TradingBaseCurrency") throw new Error(`SIX reference file header changed: ${lines[0]}`);
  return lines.slice(1).map((line) => line.split(";")).filter((cells) => cells[0] === isin).map((cells) => ({ mic: "XSWX", ticker: cells[1].toUpperCase(), currency: cells[2].toUpperCase(), from: "SIX" }));
}

function typeOf(item) {
  if (item.type === "STOCK") return "STOCK";
  if (item.type !== "ETF") throw new Error(`${item.codename}: type ${item.type}`);
  if (/\bETNs?\b/i.test(item.name)) return "ETN";
  if (/\bETCs?\b/i.test(item.name)) return "ETC";
  return "ETF";
}

const data = JSON.parse(await get(SOURCE));
for (const [key, floor] of Object.entries(FLOOR)) {
  if (!Array.isArray(data[key])) throw new Error(`the file has no ${key} list`);
  if (data[key].length < floor) throw new Error(`${data[key].length} ${key}, expected at least ${floor}`);
}
const items = [...data.shares, ...data.etfs];
const places = investonaPlaces();
const files = listingFiles();
const euronext = await euronextLines();

function makeRow(item, { ticker, mic, currency, extra = [] }) {
  const isin = normalize(item.isin).toUpperCase();
  const row = {
    query: ticker,
    ticker,
    name: normalize(item.name),
    exchange: mic ? EXCHANGE[mic] : undefined,
    mic: mic || undefined,
    currency,
    type: typeOf(item),
    isin: ISIN.test(isin) ? isin : "",
    raw: [item.codename.trim(), normalize(item.name), item.isin, item.currency, item.type, ...extra].filter(Boolean).join(" | "),
  };
  if (!mic) {
    delete row.exchange;
    delete row.mic;
  }
  return row;
}

// The US listing of an ISIN: the line with Investona's symbol first.
function unitedStates(item, symbol) {
  const lines = (files.get(item.isin) || []).filter((line) => US[line.file]);
  const order = Object.keys(US);
  lines.sort((a, b) => (b.symbol === symbol) - (a.symbol === symbol) || order.indexOf(a.file) - order.indexOf(b.file));
  return lines[0] || null;
}

// Every listing of an ETF with no exchange code, on Investona's places.
async function europeanLines(item) {
  const lines = [
    ...(places.has("XLON") ? (await lseLines(item.isin)).map((line) => ({ mic: "XLON", ticker: line.ticker.toUpperCase(), currency: line.currency, from: "LSE" })) : []),
    ...(euronext.get(item.isin) || []),
    ...(places.has("XSWX") ? await sixLines(item.isin) : []),
    ...(files.get(item.isin) || []).filter((line) => line.file === "XETR").map((line) => ({ mic: "XETR", ticker: line.symbol, currency: "EUR", from: "Xetra file" })),
    ...(files.get(item.isin) || []).filter((line) => line.file === "VIE").map((line) => ({ mic: "XWBO", ticker: line.symbol, currency: "EUR", from: "Vienna file" })),
  ];
  return lines.filter((line) => places.has(line.mic));
}

const rows = [];
const tally = { coded: 0, localSymbol: 0, unchecked: 0, us: 0, bySymbol: 0, byCurrency: 0, unplaced: 0 };
const unplaced = [];
const unchecked = [];
for (const item of items) {
  const code = normalize(item.codename).toUpperCase();
  const [root, suffix = ""] = code.split(" ");
  const symbol = root.replace(/\//g, ".");
  const currency = normalize(item.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${code}: currency ${item.currency}`);

  if (suffix && US_CODES.has(suffix) || !suffix && item.type === "STOCK" && currency === "USD") {
    const line = unitedStates(item, symbol);
    if (!line) {
      if (suffix) throw new Error(`${code} ${item.isin} is in no US listing file`);
    } else {
      if (currency !== "USD") throw new Error(`${code}: US line in ${currency}`);
      rows.push(makeRow(item, { ticker: symbol, mic: US[line.file][1], currency, extra: [`${line.file}:${line.symbol}`] }));
      tally.us += 1;
      continue;
    }
  }
  if (suffix) {
    const place = CODE[suffix];
    if (!place) throw new Error(`${code}: unknown exchange code ${suffix}`);
    let ticker = symbol;
    const extra = [];
    if (item.type === "ETF") {
      const own = (await europeanLines(item)).filter((line) => line.mic === place[1] && line.currency === currency);
      const line = own.find((hit) => hit.ticker === symbol) || own[0];
      if (line) {
        ticker = line.ticker;
        extra.push(`${line.from} ${line.mic} ${line.ticker} ${line.currency}`);
        if (ticker !== symbol) tally.localSymbol += 1;
      } else {
        tally.unchecked += 1;
        unchecked.push(`${code} ${currency}`);
      }
    }
    rows.push(makeRow(item, { ticker, mic: place[1], currency, extra }));
    tally.coded += 1;
    continue;
  }

  const lines = await europeanLines(item);
  let kept = lines.filter((line) => line.ticker === symbol && line.currency === currency);
  if (kept.length) tally.bySymbol += 1;
  else {
    kept = lines.filter((line) => line.currency === currency);
    if (kept.length) tally.byCurrency += 1;
  }
  const seen = new Set();
  for (const line of kept) {
    if (seen.has(line.mic)) continue;
    seen.add(line.mic);
    rows.push(makeRow(item, { ticker: line.ticker, mic: line.mic, currency, extra: [`${line.from} ${line.mic} ${line.ticker} ${line.currency}`] }));
  }
  if (!kept.length) {
    tally.unplaced += 1;
    unplaced.push(`${code} ${item.isin} ${currency}`);
    rows.push(makeRow(item, { ticker: symbol, currency }));
  }
}

const unique = new Map();
for (const row of rows) unique.set(`${row.isin}|${row.mic || ""}|${row.currency}`, row);
const sorted = [...unique.values()].sort((a, b) => (a.exchange || "").localeCompare(b.exchange || "") || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));

const unresolved = sorted.filter((row) => row.mic && !resolveVenue(row).venue);
if (unresolved.length) throw new Error(`unresolved venue: ${[...new Set(unresolved.map((row) => `${row.exchange} ${row.mic} ${row.currency}`))].join(", ")}`);
if (!sorted.some((row) => row.ticker === "CEZ" && row.mic === "XPRA")) throw new Error("ČEZ is missing");
if (!sorted.some((row) => row.ticker === "AAPL" && row.mic === "XNAS")) throw new Error("Apple is missing");

const kept = stampRows(withoutObligations(sorted));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) {
  const key = `${row.exchange || "no exchange"} ${row.mic || "-"} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
if (unplaced.length) console.error(`no listing: ${unplaced.join(", ")}`);
if (unchecked.length) console.error(`coded ETF line the exchange data does not show in that currency: ${unchecked.join(", ")}`);
console.error(`${data.shares.length} shares and ${data.etfs.length} ETFs listed; ${kept.length} rows, ${kept.filter((row) => row.isin).length} with an ISIN`, tally);
