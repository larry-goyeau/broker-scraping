// What Shanghai Commercial & Savings Bank sells in foreign shares and
// exchange-traded funds, with no login. The product page is five shelves:
// US shares, US preferred shares, Hong Kong, Japan and funds. A row
// marked 禁止買進 has no buy button on the share list, or is marked N
// on the fund file. That line is not sold.
//
// The pages name the market, not the exchange inside the United States,
// so that row stays "US". Japan is stored as Tokyo. Hong Kong is Hong
// Kong. The fund file prints the coin: US dollars, Hong Kong dollars,
// yen or renminbi. Renminbi is stored as CNH. The Hong Kong and Japan
// share lists do not print a coin. Those shelves are HKD and JPY.
// None of these files prints an ISIN. One is filled from the shared
// lists when a single code on the allowed places matches. Several
// matches stay blank.
//
//   https://fund.scsb.com.tw/w/djjson/usspStockListJSON.djjson?a=US
//   https://fund.scsb.com.tw/w/djjson/usspStockListJSON.djjson
//   https://fund.scsb.com.tw/w/html/hkstocklist.djhtm
//   https://fund.scsb.com.tw/w/djjson/stocklistjson.djjson?a=JP
//   https://fund.scsb.com.tw/w/djjson/overseasRankListJosn.djjson?A=4&B=0
//   https://fund.scsb.com.tw/w/djjson/overseasRankListJosn.djjson?A=0&B=0
//   https://fund.scsb.com.tw/jsondata/json/etfjsondataB2B.xdjjson?x=AspidRankDefaultROI&a=E800120&aspid=scsb&Showall=1
//
//   node brokers/scsb/scsb_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const ROOT = "https://fund.scsb.com.tw";
const US = `${ROOT}/w/djjson/usspStockListJSON.djjson?a=US`;
const PREFERRED = `${ROOT}/w/djjson/usspStockListJSON.djjson`;
const HK = `${ROOT}/w/html/hkstocklist.djhtm`;
const JAPAN = `${ROOT}/w/djjson/stocklistjson.djjson?a=JP`;
const JAPAN_FLAG = `${ROOT}/w/djjson/overseasRankListJosn.djjson?A=4&B=0`;
const FUNDS = `${ROOT}/w/djjson/overseasRankListJosn.djjson?A=0&B=0`;
const FUND_FLAG = `${ROOT}/jsondata/json/etfjsondataB2B.xdjjson?x=AspidRankDefaultROI&a=E800120&aspid=scsb&Showall=1`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const JP_PLACES = ["TSE", "NAG"];
const FUND = {
  美元: { exchange: "US", currency: "USD", suffix: "" },
  港幣: { exchange: "Hong Kong", currency: "HKD", suffix: ".HK" },
  人民幣: { exchange: "Hong Kong", currency: "CNH", suffix: ".HK" },
  日圓: { exchange: "Tokyo", currency: "JPY", suffix: ".JP" },
};

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
  return JSON.parse(textOfBytes(bytes).replace(/^\uFEFF/, ""));
}

function textOf(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resultRows(doc, label) {
  const rows = doc?.ResultSet?.Result;
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${label} published no row`);
  if (String(doc.ResultSet.DataLength) !== String(rows.length)) {
    throw new Error(`${label} says ${doc.ResultSet.DataLength} rows and prints ${rows.length}`);
  }
  return rows;
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
    raw: [row.ticker, row.name, row.exchange, row.currency, row.type].filter(Boolean).join(" "),
  });
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function banned(name) {
  return name.includes("禁止買進");
}

function usShares(doc, label) {
  const rows = [];
  let skipped = 0;
  for (const cell of resultRows(doc, label)) {
    const ticker = clean(cell.V1).toUpperCase();
    const name = clean(cell.V3);
    const buy = clean(cell.V5).toUpperCase() === "Y";
    const currency = clean(cell.V11).toUpperCase();
    if (!ticker) throw new Error(`${label} has a row with no ticker`);
    if (currency !== "USD") throw new Error(`${label} ${ticker} is priced in ${cell.V11}`);
    if (buy === banned(name)) throw new Error(`${label} ${ticker} buy flag and 禁止買進 disagree`);
    if (!buy) {
      skipped += 1;
      continue;
    }
    rows.push({ ticker, name, exchange: "US", currency: "USD", type: "STOCK" });
  }
  if (!rows.length) throw new Error(`${label} published no share for sale`);
  return { rows, skipped };
}

function hongKongShares(html) {
  const rows = [];
  let skipped = 0;
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => textOf(match[1]));
    if (cells[1] === "股票代號") continue;
    const ticker = clean(cells[1]);
    if (!/^\d+$/.test(ticker)) continue;
    if (!/^\d{4}$/.test(ticker)) throw new Error(`Hong Kong code ${ticker} is not four digits`);
    const name = clean(cells[2]);
    const buy = /sFundBuy/.test(tr);
    if (buy === banned(name)) throw new Error(`Hong Kong ${ticker} buy button and 禁止買進 disagree`);
    if (!buy) {
      skipped += 1;
      continue;
    }
    rows.push({ ticker, name: name || ticker, exchange: "Hong Kong", currency: "HKD", type: "STOCK" });
  }
  if (!rows.length) throw new Error("Hong Kong published no share for sale");
  return { rows, skipped };
}

function japanShares(listDoc, rankDoc) {
  const approved = new Set();
  for (const cell of resultRows(rankDoc, "Japan rank")) {
    const ticker = clean(cell.V4).toUpperCase();
    const on = clean(cell.V12).toUpperCase() === "Y" && !banned(clean(cell.V2));
    if (on) approved.add(ticker);
  }
  const rows = [];
  for (const cell of resultRows(listDoc, "Japan")) {
    const ticker = clean(cell.V2).toUpperCase();
    const chinese = clean(cell.V4);
    const english = clean(cell.V7);
    if (!/^[A-Z0-9]+$/.test(ticker)) throw new Error(`Japan code ${ticker} is not a ticker`);
    if (banned(chinese) || banned(english)) throw new Error(`Japan ${ticker} is marked 禁止買進`);
    if (!approved.has(ticker)) throw new Error(`Japan ${ticker} is on the list and not approved`);
    approved.delete(ticker);
    rows.push({
      ticker,
      name: english || chinese || ticker,
      exchange: "Tokyo",
      currency: "JPY",
      type: listingType(`${chinese} ${english}`),
    });
  }
  if (approved.size) throw new Error(`Japan rank has ${[...approved][0]} and the list does not`);
  if (!rows.length) throw new Error("Japan published no share for sale");
  return rows;
}

function fundRows(shelf, flagDoc) {
  const approved = new Map();
  for (const cell of resultRows(flagDoc, "fund flags")) {
    approved.set(clean(cell.V1).toUpperCase(), clean(cell.V12).toUpperCase());
  }
  const rows = [];
  let skipped = 0;
  const seen = new Set();
  for (const cell of resultRows(shelf, "funds")) {
    const id = clean(cell.V4).toUpperCase();
    const name = clean(cell.V2);
    const book = FUND[clean(cell.V15)];
    if (!book) throw new Error(`fund ${id} is priced in ${cell.V15}`);
    if (book.suffix) {
      if (!id.endsWith(book.suffix)) throw new Error(`fund ${id} is ${cell.V15} without ${book.suffix}`);
    } else if (id.includes(".")) throw new Error(`fund ${id} is a US dollar line with a suffix`);
    const ticker = book.suffix ? id.slice(0, -book.suffix.length) : id;
    const flag = approved.get(id);
    if (flag == null) throw new Error(`fund ${id} is not on the approved file`);
    const marked = banned(name);
    if (flag === "Y" && marked) throw new Error(`fund ${id} is approved and marked 禁止買進`);
    if (flag !== "Y" && !marked) throw new Error(`fund ${id} is not approved and the name does not say 禁止買進`);
    seen.add(id);
    if (flag !== "Y") {
      skipped += 1;
      continue;
    }
    rows.push({
      ticker,
      name: name || ticker,
      exchange: book.exchange,
      currency: book.currency,
      type: listingType(name, "ETF"),
    });
  }
  for (const id of approved.keys()) {
    if (!seen.has(id)) throw new Error(`the approved file has ${id} and the fund shelf does not`);
  }
  if (!rows.length) throw new Error("the fund file published nothing for sale");
  return { rows, skipped };
}

const rows = [];
const seen = new Set();

const us = usShares(jsonOf(await getBytes(US)), "US");
for (const row of us.rows) pushRow(rows, seen, row);
console.error(`${us.rows.length} shares on US, ${us.skipped} not sold`);

const preferred = usShares(jsonOf(await getBytes(PREFERRED)), "preferred");
for (const row of preferred.rows) pushRow(rows, seen, row);
console.error(`${preferred.rows.length} preferred shares on US, ${preferred.skipped} not sold`);

const hk = hongKongShares(textOfBytes(await getBytes(HK)));
for (const row of hk.rows) pushRow(rows, seen, row);
console.error(`${hk.rows.length} shares on Hong Kong, ${hk.skipped} not sold`);

const japan = japanShares(
  jsonOf(await getBytes(JAPAN, `${ROOT}/W/HTML/STOCKLIST.DJHTM?A=JP`)),
  jsonOf(await getBytes(JAPAN_FLAG, ROOT))
);
for (const row of japan) pushRow(rows, seen, row);
console.error(`${japan.length} listings on Tokyo`);

const funds = fundRows(jsonOf(await getBytes(FUNDS, ROOT)), jsonOf(await getBytes(FUND_FLAG, ROOT)));
for (const row of funds.rows) pushRow(rows, seen, row);
console.error(`${funds.rows.length} funds, ${funds.skipped} not sold`);

const tally = attachIsins(rows, loadIsinIndex());
rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("scsb-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${rows.length} listings (${tally.one} with an ISIN, ${tally.none} unmatched, ${tally.several} ambiguous) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
