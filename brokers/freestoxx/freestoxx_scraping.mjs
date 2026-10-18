// Freestoxx sells American shares only (NYSE and Nasdaq; no ETFs for EU
// retail). Its public "find stocks" page embeds the whole list in the HTML
// as DataTables rows: name, symbol, ISIN (often blank), short selling and
// options flags. About 7,200 rows, no paging.
//
// The page does not say where a symbol is listed. The Nasdaq Trader symbol
// directory (the same files the futu scraper reads) gives the listing
// exchange; a Freestoxx symbol missing from it is no longer listed and is
// left out. "AGM/A" is written "AGM.A" there, "ABRpD" is the CQS symbol.
//
// Left out: index and currency rows marked "*" (options only), CVRs,
// warrants, rights, SPAC units, and notes or debentures. Common LP units,
// preferred shares and closed-end funds are listed shares and stay STOCK.
//
//   https://www.freestoxx.com/en-lu/commission-free-trading/find-stocks-ticker-symbol-isin-number
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//
//   node brokers/freestoxx/freestoxx_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST = "https://www.freestoxx.com/en-lu/commission-free-trading/find-stocks-ticker-symbol-isin-number";
const NASDAQ = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

// otherlisted.txt exchange codes.
const VENUES = {
  Q: ["Nasdaq", "XNAS"],
  N: ["NYSE", "XNYS"],
  A: ["NYSE American", "XASE"],
  P: ["NYSE Arca", "ARCX"],
  Z: ["Cboe BZX", "BATS"],
  V: ["IEX", "IEXG"],
  F: ["NYSE Texas", "XCHI"],
};

const CVR = /^CVR FROM\b|contingent value/i;
const DERIVED = /\b(warrants?|wrts?|rights?|rts)\b|-CW\d\d\b/i;
const UNIT = /\bunits?\b/i;
const COMMON_UNIT = /\bcommon units?\b/i;
const DEBT = /\b(notes?|debentures?)\b/i;
// "American Depositary Shares, each representing the right to receive ..."
const ADS = /\bdepositary shares\b.*\bright to receive\b/i;
const SHARE = /\b(common (stock|shares|units)|ordinary shares|shares of beneficial interest)\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function directory(textBody, file) {
  const lines = textBody.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split("|");
  const column = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`${file} has no ${name} column`);
    return index;
  };
  const out = [];
  if (file === "nasdaq") {
    const [symbol, name, etf, test] = ["Symbol", "Security Name", "ETF", "Test Issue"].map(column);
    for (const line of lines) {
      const cells = line.split("|");
      if (cells.length < header.length || cells[test] === "Y") continue;
      out.push({ keys: [cells[symbol]], code: "Q", name: cells[name], etf: cells[etf] === "Y" });
    }
  } else {
    const [act, name, exchange, cqs, etf, test, nasdaq] = ["ACT Symbol", "Security Name", "Exchange", "CQS Symbol", "ETF", "Test Issue", "NASDAQ Symbol"].map(column);
    for (const line of lines) {
      const cells = line.split("|");
      if (cells.length < header.length || cells[test] === "Y") continue;
      out.push({ keys: [cells[cqs], cells[act], cells[nasdaq]], code: cells[exchange], name: cells[name], etf: cells[etf] === "Y" });
    }
  }
  if (out.length < 3000) throw new Error(`${file} directory has only ${out.length} lines`);
  return out;
}

function lookupKeys(symbol) {
  const keys = [symbol, symbol.replace(/\//g, ".")];
  if (symbol.includes("/")) keys.push(symbol.replace(/\//g, ""));
  return keys;
}

const [page, nasdaqText, otherText] = await Promise.all([get(LIST), get(NASDAQ), get(OTHER)]);

const listings = new Map();
for (const entry of [...directory(nasdaqText, "nasdaq"), ...directory(otherText, "other")]) {
  for (const key of entry.keys) if (key && !listings.has(key)) listings.set(key, entry);
}

const source = [...page.matchAll(/table\.row\.add\((\[.*?\])\);/g)].map((match) => JSON.parse(match[1]));
if (source.length < 5000) throw new Error(`only ${source.length} rows on the Freestoxx page`);

const rows = [];
const seen = new Set();
const skipped = new Map();
const unlisted = [];
const unknownVenue = new Set();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const [rawName, rawSymbol, rawIsin, short, options] of source) {
  const name = normalize(rawName);
  const symbol = normalize(rawSymbol);
  const isin = normalize(rawIsin).toUpperCase();
  if (!name || !symbol) throw new Error(`blank row ${rawName} ${rawSymbol}`);
  if (/\*\s*$/.test(name)) { skip("index/options only"); continue; }
  if (CVR.test(name)) { skip("CVR"); continue; }
  if (DERIVED.test(name) && !ADS.test(name)) { skip("warrant/right"); continue; }
  if (UNIT.test(name) && !COMMON_UNIT.test(name)) { skip("unit"); continue; }
  if (DEBT.test(name) && !SHARE.test(name)) { skip("note"); continue; }
  const entry = lookupKeys(symbol).map((key) => listings.get(key)).find(Boolean);
  if (!entry) {
    unlisted.push(symbol);
    continue;
  }
  const venue = VENUES[entry.code];
  if (!venue) {
    unknownVenue.add(`${entry.code} (${symbol})`);
    continue;
  }
  const [exchange, mic] = venue;
  const key = `${symbol}|${mic}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push({
    query: symbol,
    ticker: symbol,
    name,
    exchange,
    mic,
    currency: "USD",
    type: entry.etf ? "ETF" : "STOCK",
    isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
    raw: [symbol, name, isin, exchange, `short:${short}`, `options:${options}`].filter(Boolean).join(" "),
  });
}

if (unknownVenue.size) throw new Error(`unmapped exchange codes: ${[...unknownVenue].slice(0, 10).join(", ")}`);
if (unlisted.length > source.length * 0.05) throw new Error(`${unlisted.length} symbols are not in the US directory`);

const count = (mic) => rows.filter((row) => row.mic === mic).length;
if (count("XNAS") < 2500 || count("XNYS") < 1500) throw new Error(`Nasdaq ${count("XNAS")}, NYSE ${count("XNYS")}`);
for (const [ticker, mic] of [["AAPL", "XNAS"], ["KO", "XNYS"], ["BRK/B", "XNYS"]]) {
  if (!rows.some((row) => row.ticker === ticker && row.mic === mic)) throw new Error(`${ticker} is not on ${mic}`);
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("freestoxx-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = new Map();
for (const row of kept) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${kept.length} listings from ${source.length} rows (${[...counts].map(([label, n]) => `${n} ${label}`).join(", ")}); ` +
    `${kept.filter((row) => row.isin).length} with an ISIN`
);
console.error(`left out ${[...skipped].map(([reason, n]) => `${n} ${reason}`).join(", ")}, ${unlisted.length} no longer listed`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
