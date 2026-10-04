// What E.SUN sells in foreign shares and exchange-traded funds,
// with no login. The United States page is titled as a ranking and
// numbers every row, from the best day to the worst, so the whole
// shelf is on it. Preferred shares are the same page under esun2.
// Hong Kong is a four-page quote list. Japan and the funds are JSON.
// Shanghai and Shenzhen are one JSON file. The bank says those names
// are for a professional investor only, and every row is flagged Y.
// That line is still sold. The mark stays on the row.
//
// The pages name the market, not the exchange inside the United
// States, so that row stays "US". Japan is stored as Tokyo. Hong Kong
// is Hong Kong. Shanghai and Shenzhen are the two connect markets.
// None of these files prints an ISIN. One is filled from the shared
// lists when a single code on the allowed places matches. Several
// matches stay blank. The China file prints RMB. That coin is stored
// as CNH, the name the other Taiwan shelves use for renminbi.
//
//   https://wealth.esunbank.com.tw/usstock/esun/rank9001.xdjhtm
//   https://wealth.esunbank.com.tw/usstock/esun2/rank9001.xdjhtm
//   https://esunbankhknew.moneydj.com/hkb2b/Quote/StocksQuote.xdjhtm?VIPVersion=D&Type=4&Group1=esun&Group2=&Page=1
//   https://esunbank.moneydj.com/w/djjson/stocklistjson.djjson?a=JP
//   https://wealth.esunbank.com.tw/cnstock/cn/CNRank.djhtm
//   https://wealth.esunbank.com.tw/ETFData/Json/EsunSearchJson.djjson?A1=&T=&B=&P1=esun&R=0
//
//   node brokers/e.sun/e.sun_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const US = "https://wealth.esunbank.com.tw/usstock/esun/rank9001.xdjhtm";
const PREFERRED = "https://wealth.esunbank.com.tw/usstock/esun2/rank9001.xdjhtm";
const HK = "https://esunbankhknew.moneydj.com/hkb2b/Quote/StocksQuote.xdjhtm?VIPVersion=D&Type=4&Group1=esun&Group2=&Page=";
const JAPAN = "https://esunbank.moneydj.com/w/djjson/stocklistjson.djjson?a=JP";
const CHINA_PAGE = "https://wealth.esunbank.com.tw/cnstock/cn/CNRank.djhtm";
const FUNDS = "https://wealth.esunbank.com.tw/ETFData/Json/EsunSearchJson.djjson?A1=&T=&B=&P1=esun&R=0";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const JP_PLACES = ["TSE", "NAG"];
const FUND_CCY = { 美元: "USD", 港幣: "HKD", 人民幣: "CNH" };

async function getBytes(url, referer) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function textOfBytes(bytes) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (utf8.includes("\uFFFD") || /charset=big5/i.test(utf8.slice(0, 1500))) {
    return new TextDecoder("big5").decode(bytes);
  }
  return utf8;
}

function jsonOf(bytes) {
  const text = textOfBytes(bytes).replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

function textOf(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listingType(name, fallback = "STOCK") {
  const text = String(name || "").normalize("NFKC");
  if (/ETN(?![A-Z])/i.test(text)) return "ETN";
  if (/ETC(?![A-Z])/i.test(text)) return "ETC";
  if (/ETF/i.test(text)) return "ETF";
  return fallback;
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const header = table[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${header.join(",")}`);
    }
    for (const line of table.slice(1)) {
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
  if (row.exchange === "Tokyo") return JP_PLACES;
  if (row.exchange === "Hong Kong") return ["HKEX"];
  if (row.exchange === "Shanghai") return ["SSE"];
  if (row.exchange === "Shenzhen") return ["SZSE"];
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

function rankedShares(html, exchange, currency) {
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const ticker = tr.match(/basic0001\.xdjhtm\?a=([^"&]+)/i)?.[1]?.trim().toUpperCase();
    if (!ticker) continue;
    const rank = Number(tr.match(/class="col02">(\d+)</)?.[1]);
    const name = textOf(tr.match(/class="col04"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || "");
    if (!Number.isInteger(rank)) throw new Error(`${exchange} ${ticker} has no rank`);
    rows.push({ rank, ticker, name: name || ticker, exchange, currency, type: "STOCK" });
  }
  rows.sort((left, right) => left.rank - right.rank);
  if (!rows.length) throw new Error(`${exchange} published no share`);
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].rank !== i + 1) throw new Error(`${exchange} rank stops at ${rows[i - 1]?.rank}, so the page is not the shelf`);
  }
  const tickers = new Set(rows.map((row) => row.ticker));
  if (tickers.size !== rows.length) throw new Error(`${exchange} repeats a ticker`);
  return rows;
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

const rows = [];
const seen = new Set();

const usHtml = textOfBytes(await getBytes(US));
const usRows = rankedShares(usHtml, "US", "USD");
for (const row of usRows) pushRow(rows, seen, row);
console.error(`${usRows.length} shares on US`);

const preferredHtml = textOfBytes(await getBytes(PREFERRED));
const preferredRows = rankedShares(preferredHtml, "US", "USD");
for (const row of preferredRows) pushRow(rows, seen, row);
console.error(`${preferredRows.length} preferred shares on US`);

const hkSeen = new Set();
let hkCount = 0;
for (let page = 1; page <= 15; page += 1) {
  const html = textOfBytes(await getBytes(`${HK}${page}`, "https://esunbankhknew.moneydj.com/"));
  const found = [...html.matchAll(/GenLink2stk\('(\d+)\.HK','([^']*)','E'\)/g)];
  if (!found.length) break;
  let added = 0;
  for (const match of found) {
    const ticker = match[1];
    if (hkSeen.has(ticker)) continue;
    hkSeen.add(ticker);
    added += 1;
    hkCount += 1;
    pushRow(rows, seen, {
      ticker,
      name: match[2].replace(/\s+/g, " ").trim() || ticker,
      exchange: "Hong Kong",
      currency: "HKD",
      type: "STOCK",
    });
  }
  if (!added) break;
}
if (!hkCount) throw new Error("Hong Kong published no share");
console.error(`${hkCount} shares on Hong Kong`);

const japan = jsonOf(await getBytes(JAPAN, "https://esunbank.moneydj.com/w/html/stocklist.djhtm?a=JP"));
const japanRows = japan.ResultSet?.Result;
if (!Array.isArray(japanRows) || !japanRows.length) throw new Error("Japan published no share");
if (String(japan.ResultSet.DataLength) !== String(japanRows.length)) {
  throw new Error(`Japan says ${japan.ResultSet.DataLength} rows and prints ${japanRows.length}`);
}
for (const cell of japanRows) {
  const ticker = String(cell.V2 || "").trim().toUpperCase();
  const chinese = String(cell.V4 || "").replace(/\s+/g, " ").trim();
  const english = String(cell.V7 || "").replace(/\s+/g, " ").trim();
  if (!ticker) throw new Error("Japan has a row with no ticker");
  pushRow(rows, seen, {
    ticker,
    name: english || chinese || ticker,
    exchange: "Tokyo",
    currency: "JPY",
    type: listingType(`${chinese} ${english}`),
  });
}
console.error(`${japanRows.length} listings on Tokyo`);

const chinaPage = textOfBytes(await getBytes(CHINA_PAGE, "https://wealth.esunbank.com/zh-tw/stock/cn-list"));
const chinaPath = chinaPage.match(/\/cnstock\/djjson\/CNStockJSONEsun\.djjson\?a=\d+&Exchange=All&count=\d+&order=/);
if (!chinaPath) throw new Error("the China list page does not name its file");
const china = jsonOf(await getBytes(`https://wealth.esunbank.com.tw${chinaPath[0].replace(/count=\d+/, "count=2000")}&d=5`));
const chinaRows = Array.isArray(china.ResultSet) ? china.ResultSet : china.ResultSet?.Result;
if (!Array.isArray(chinaRows) || !chinaRows.length) throw new Error("China published no share");
if (chinaRows.length >= 2000) throw new Error("China returned the row cap, so the shelf may be longer");
for (const cell of chinaRows) {
  const printed = String(cell.V2 || "").trim().toUpperCase();
  const board = printed.slice(0, 2);
  const ticker = printed.slice(2);
  const exchange = board === "SH" ? "Shanghai" : board === "SZ" ? "Shenzhen" : "";
  const name = String(cell.V17 || cell.V16 || cell.V3 || "").replace(/\s+/g, " ").trim();
  if (!exchange || !/^\d+$/.test(ticker)) throw new Error(`unreadable China code ${printed}`);
  if (String(cell.V13 || "").trim().toUpperCase() !== "RMB") throw new Error(`${printed} is priced in ${cell.V13}`);
  if (String(cell.V14 || "").trim().toUpperCase() !== "Y") throw new Error(`${printed} is not marked professional`);
  pushRow(rows, seen, {
    ticker,
    name: name || ticker,
    exchange,
    currency: "CNH",
    type: "STOCK",
    professional: true,
  });
}
console.error(`${chinaRows.length} professional shares on Shanghai and Shenzhen`);

const funds = jsonOf(await getBytes(FUNDS));
const fundRows = funds.ResultSet?.Result;
if (!Array.isArray(fundRows) || !fundRows.length) throw new Error("the fund file has no result list");
if (String(funds.ResultSet.DataLength) !== String(fundRows.length)) {
  throw new Error(`funds say ${funds.ResultSet.DataLength} rows and print ${fundRows.length}`);
}
for (const cell of fundRows) {
  const printed = String(cell.V2 || "").split("~")[0].trim().toUpperCase();
  const suffix = printed.endsWith(".HK") ? "HK" : "";
  const ticker = suffix ? printed.slice(0, -3) : printed;
  const exchange = suffix ? "Hong Kong" : "US";
  const currency = FUND_CCY[String(cell.V5 || "").trim()];
  const name = String(cell.V4 || "").replace(/\s+/g, " ").trim();
  if (!ticker || !currency) throw new Error(`unreadable fund ${cell.V2} ${cell.V5}`);
  pushRow(rows, seen, {
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type: listingType(name, "ETF"),
  });
}
console.error(`${fundRows.length} funds`);

const tally = attachIsins(rows, loadIsinIndex());
rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("e.sun-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const byBook = new Map();
let professional = 0;
for (const row of rows) {
  byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
  if (row.raw.endsWith(" professional")) professional += 1;
}
console.error(
  `${rows.length} listings, ${professional} professional ` +
    `(${tally.one} with an ISIN, ${tally.none} unmatched, ${tally.several} ambiguous) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
