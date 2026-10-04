// Union Bank of Taiwan publishes the foreign shelf on yesfund without a login.
// A row is sold only when the page prints the buy button. US shares and
// preferred shares are the stock-list HTML. Overseas ETFs are the rank file,
// where the button is the Y flag. Hong Kong shares without that button stay
// out. The empty China shelf stays out. A professional-only name stays sold:
// the mark is the raw token, not part of the name.

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";

const STOCK = "https://www.yesfund.com.tw/w/stocklist.djhtm?a=";
const ETF = "https://www.yesfund.com.tw/w/djjson/overseasRankListJosn.djjson?A=0&B=0";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "unionbank-parsed.json");

const CCY = { 美元: "USD", 港幣: "HKD", 人民幣: "CNH" };
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];

function textOf(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

async function getBytes(url, referer) {
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: referer || url } });
      if (!response.ok) throw new Error(`${url} -> ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      last = error.message || String(error);
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw new Error(last);
}

function textOfBytes(bytes) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const declared = /charset=big5/i.test(utf8.slice(0, 400));
  if (!declared && !utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("big5").decode(bytes);
}

function jsonOf(bytes) {
  return JSON.parse(textOfBytes(bytes));
}

function cellsOf(tr) {
  return [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => textOf(match[1]));
}

function listingType(name, fallback) {
  const label = String(name || "");
  if (/(?<![A-Za-z])ETN(?![A-Za-z])/i.test(label)) return "ETN";
  if (/(?<![A-Za-z])ETC(?![A-Za-z])/i.test(label)) return "ETC";
  if (/(?<![A-Za-z])ETF(?![A-Za-z])/i.test(label)) return "ETF";
  return fallback;
}

function shownName(name) {
  const professional = /限專投/.test(name);
  const clean = name.replace(/\s*[(（]\s*限專投\s*[)）]\s*/g, " ").replace(/限專投/g, " ").replace(/\s+/g, " ").trim();
  return { name: clean, professional };
}

function loadIsinIndex() {
  const index = new Map();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const lines = readFileSync(join(root, "assets", file), "utf8").split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file} header is ${header.join(",")}`);
    }
    for (const line of lines.slice(1)) {
      const cells = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
          if (char === '"') {
            if (line[i + 1] === '"') {
              field += '"';
              i += 1;
            } else quoted = false;
          } else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
          cells.push(field);
          field = "";
        } else field += char;
      }
      cells.push(field);
      const code = String(cells[0] || "").trim().toUpperCase().split(":").pop();
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

function codesOf(row) {
  if (row.exchange !== "Hong Kong") return [row.ticker];
  const digits = row.ticker.replace(/^0+/, "") || "0";
  return [...new Set([row.ticker, digits, digits.padStart(4, "0"), digits.padStart(5, "0")])];
}

function placesOf(row) {
  if (row.exchange === "US") return US_PLACES;
  if (row.exchange === "Hong Kong") return ["HKEX"];
  return [];
}

function attachIsins(rows, index) {
  let one = 0;
  let none = 0;
  let several = 0;
  for (const row of rows) {
    const groups = new Map();
    for (const code of codesOf(row)) {
      const book = index.get(code);
      for (const place of placesOf(row)) {
        const ids = book?.get(place);
        if (!ids?.size) continue;
        if (!groups.has(place)) groups.set(place, new Set());
        for (const isin of ids) groups.get(place).add(isin);
      }
    }
    const found = new Set();
    for (const ids of groups.values()) for (const isin of ids) found.add(isin);
    if (found.size === 1) {
      row.isin = [...found][0];
      one += 1;
    } else if (found.size === 0) none += 1;
    else {
      several += 1;
      stampIsinMatches(row, groups, row.ticker);
    }
  }
  return { one, none, several };
}

function pushRow(rows, seen, row) {
  const key = `${row.exchange}|${row.ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    currency: row.currency,
    type: row.type,
    isin: "",
    raw: [row.ticker, row.name, row.exchange, row.currency, row.type, row.professional ? "professional" : ""]
      .filter(Boolean)
      .join(" "),
  });
}

function tickerOf(printed) {
  // Class shares arrive as BRK/B. The catalogues keep the dot.
  return String(printed || "").trim().toUpperCase().replaceAll("/", ".");
}

function stockRows(html, exchange) {
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    if (!/buyStock\(/.test(tr)) continue;
    const cells = cellsOf(tr);
    let ticker = tickerOf(cells[1]);
    const place = ticker.endsWith(".HK") ? "Hong Kong" : exchange;
    if (ticker.endsWith(".HK")) ticker = ticker.slice(0, -3);
    const coin = CCY[cells.find((cell) => CCY[cell])];
    const shown = shownName(cells[2] || "");
    if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(ticker) || !shown.name || !coin) {
      throw new Error(`unreadable ${exchange} row ${ticker || cells.join(" | ")}`);
    }
    if (place !== exchange) throw new Error(`${ticker} is on the ${exchange} list`);
    rows.push({
      ticker,
      name: shown.name,
      exchange,
      currency: coin,
      type: "STOCK",
      professional: shown.professional,
    });
  }
  const tickers = new Set(rows.map((row) => row.ticker));
  if (tickers.size !== rows.length) throw new Error(`${exchange} repeats a ticker`);
  return rows;
}

const rows = [];
const seen = new Set();

const usHtml = textOfBytes(await getBytes(`${STOCK}us`));
const usRows = stockRows(usHtml, "US");
if (!usRows.length) throw new Error("US published no share");
for (const row of usRows) pushRow(rows, seen, row);
console.error(`${usRows.length} shares on US, ${usRows.filter((row) => row.professional).length} professional`);

const preferredHtml = textOfBytes(await getBytes(`${STOCK}usp`));
const preferredRows = stockRows(preferredHtml, "US");
if (!preferredRows.length) throw new Error("US preferred published no share");
for (const row of preferredRows) pushRow(rows, seen, row);
console.error(`${preferredRows.length} preferred shares on US`);

const hkHtml = textOfBytes(await getBytes(`${STOCK}hk`));
const hkRows = stockRows(hkHtml, "Hong Kong");
for (const row of hkRows) pushRow(rows, seen, row);
console.error(`${hkRows.length} shares on Hong Kong`);

const funds = jsonOf(await getBytes(ETF, "https://www.yesfund.com.tw/w/overseasrank.djhtm"));
const fundRows = funds.ResultSet?.Result;
if (!Array.isArray(fundRows) || !fundRows.length) throw new Error("the ETF file has no result list");
if (String(funds.ResultSet.DataLength) !== String(fundRows.length)) {
  throw new Error(`ETFs say ${funds.ResultSet.DataLength} rows and print ${fundRows.length}`);
}
let fundKept = 0;
let professional = 0;
for (const cell of fundRows) {
  if (String(cell.V12 || "").trim().toUpperCase() !== "Y") continue;
  const printed = tickerOf(cell.V3);
  const place = printed.endsWith(".HK") ? "Hong Kong" : "US";
  const ticker = printed.endsWith(".HK") ? printed.slice(0, -3) : printed;
  const coin = CCY[String(cell.V15 || "").trim()];
  const shown = shownName(String(cell.V2 || "").replace(/\s+/g, " ").trim());
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(ticker) || !shown.name || !coin) {
    throw new Error(`unreadable fund ${cell.V3} ${cell.V15}`);
  }
  if (printed.includes(".") && !printed.endsWith(".HK")) throw new Error(`unreadable fund code ${printed}`);
  pushRow(rows, seen, {
    ticker,
    name: shown.name,
    exchange: place,
    currency: coin,
    type: listingType(shown.name, "ETF"),
    professional: shown.professional,
  });
  fundKept += 1;
  if (shown.professional) professional += 1;
}
if (!fundKept) throw new Error("ETFs published no buy row");
console.error(`${fundKept} funds, ${professional} professional`);

const tally = attachIsins(rows, loadIsinIndex());
const kept = stampRows(withoutObligations(rows));
kept.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
console.error(
  `${kept.length} listings, ${tally.one} with one ISIN, ${tally.several} with several, ${tally.none} with none`,
);
