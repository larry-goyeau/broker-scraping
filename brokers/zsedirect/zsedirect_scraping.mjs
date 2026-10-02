// What ZSE Direct sells, with no login. The app buys and sells what is
// listed on the Zimbabwe Stock Exchange. The published price sheet is
// that board: each line has an ISIN. The issuer directory is wider.
// Four shares are marked active there and are not on the sheet, so
// they are not written: OK Zimbabwe, Pretoria Portland Cement, Hwange
// Colliery and Cottco. Debt comes back empty. VFEX is another app.
//
// The sheet names the company and not the ticker. The ticker is the
// issuer's short name. A line that does not meet an issuer is an error.
//
//   https://ds88jcmqc11je.cloudfront.net/api/fetch/price-sheet?exchange=ZSE
//   https://ds88jcmqc11je.cloudfront.net/api/issuers?exchange=ZSE&market=equity
//
//   node brokers/zsedirect/zsedirect_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const ROOT = "https://ds88jcmqc11je.cloudfront.net";
const SHEET = `${ROOT}/api/fetch/price-sheet?exchange=ZSE`;
const ISSUERS = `${ROOT}/api/issuers?exchange=ZSE&market=`;
const BOOKS = [
  ["equity", "STOCK"],
  ["etf", "ETF"],
  ["reit", "REIT"],
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const MARKET_TYPE = { 1: "STOCK", 41: "ETF", 43: "REIT" };
const STOP = new Set([
  "LIMITED", "LTD", "PLC", "COMPANY", "THE", "INC", "PVT", "PRIVATE",
  "EXCHANGE", "TRADED", "FUND", "TRUST", "ETF", "AND", "CO",
]);

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function words(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

function score(line, issuer) {
  let value = overlap(words(line.name), issuer.words);
  const packed = issuer.words.join("");
  const compact = String(line.name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (packed.length >= 6 && compact.includes(packed)) value += 2;
  if (issuer.type === MARKET_TYPE[line.marketId]) value += 10;
  return value;
}

function overlap(left, right) {
  const bag = new Set(right);
  let score = 0;
  for (const word of left) if (bag.has(word)) score += 1;
  return score;
}

const sheetBody = await getJson(SHEET);
const sheet = sheetBody?.data;
if (!Array.isArray(sheet) || !sheet.length) throw new Error(`${SHEET} has no price sheet`);

const issuers = [];
for (const [market, type] of BOOKS) {
  const body = await getJson(`${ISSUERS}${market}`);
  if (!Array.isArray(body)) throw new Error(`${market} issuers are not a list`);
  for (const row of body) {
    if (String(row.status || "").toLowerCase() !== "active") continue;
    const ticker = String(row.short_name || "").trim().toUpperCase();
    const name = String(row.name || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) throw new Error(`unreadable ${market} issuer`);
    issuers.push({ market, type, ticker, name, words: words(name) });
  }
}

const pairs = [];
for (let sheetIndex = 0; sheetIndex < sheet.length; sheetIndex += 1) {
  const line = sheet[sheetIndex];
  for (let issuerIndex = 0; issuerIndex < issuers.length; issuerIndex += 1) {
    const value = score(line, issuers[issuerIndex]);
    if (value > 0) pairs.push({ sheetIndex, issuerIndex, score: value });
  }
}
pairs.sort((left, right) => right.score - left.score || left.sheetIndex - right.sheetIndex);

const takenSheet = new Set();
const takenIssuer = new Set();
const joined = [];
for (const pair of pairs) {
  if (takenSheet.has(pair.sheetIndex) || takenIssuer.has(pair.issuerIndex)) continue;
  takenSheet.add(pair.sheetIndex);
  takenIssuer.add(pair.issuerIndex);
  joined.push(pair);
}

if (takenSheet.size !== sheet.length) {
  const missed = sheet.filter((_, index) => !takenSheet.has(index)).map((line) => line.name);
  throw new Error(`price sheet line with no issuer: ${missed.join("; ")}`);
}

const rows = [];
const seen = new Set();
for (const pair of joined) {
  const line = sheet[pair.sheetIndex];
  const issuer = issuers[pair.issuerIndex];
  const isin = String(line.isin || "").trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) throw new Error(`no ISIN for ${line.name}`);
  if (seen.has(isin) || seen.has(issuer.ticker)) throw new Error(`repeated ${isin} ${issuer.ticker}`);
  seen.add(isin);
  seen.add(issuer.ticker);
  const name = String(line.name || issuer.name).replace(/\s+/g, " ").trim();
  rows.push({
    query: issuer.ticker,
    ticker: issuer.ticker,
    name,
    exchange: "ZSE",
    currency: "ZWG",
    type: issuer.type,
    isin,
    raw: [issuer.ticker, name, isin, issuer.type].join(" "),
  });
}

const leftOut = issuers.filter((_, index) => !takenIssuer.has(index));
rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("zsedirect-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));

const byType = new Map();
for (const row of rows) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${rows.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). ` +
    `Left off the sheet: ${leftOut.map((row) => row.ticker).join(", ") || "none"}.`
);
