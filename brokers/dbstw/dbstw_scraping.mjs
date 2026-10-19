// What DBS Bank (Taiwan) sells in foreign shares and exchange-traded
// funds, with no login. Two public PDFs are the lists. The sheet dated
// 15 July 2026 is the one on the site. A later change is a separate
// announcement, so this file reads whatever date the PDF now prints.
//
//   shares   https://www.dbs.com.tw/iwov-resources/pdf/foreign-stocks/foreign_stock_list.pdf
//   funds    https://www.dbs.com.tw/iwov-resources/pdf/foreign-stocks/foreign_etf_list.pdf
//
// The exchange column names the country. The United States stays "US".
// Japan is stored as Tokyo, the venue those codes list on. Australia
// stays "Australia": the sheet does not say ASX. Hong Kong is Hong Kong.
// The PDFs print no ISIN. One is filled from the shared lists when a
// single code on the allowed places matches. Several matches stay blank.
//
// Electronic Arts (EA) is still on the July share list. Nasdaq removed
// it on 4 August 2026, so the row is left out.
// A fund marked PI, TPC or DBU is still sold, to that client. The mark
// stays on the row.
//
//   node brokers/dbs/dbs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const STOCKS_PDF = "https://www.dbs.com.tw/iwov-resources/pdf/foreign-stocks/foreign_stock_list.pdf";
const FUNDS_PDF = "https://www.dbs.com.tw/iwov-resources/pdf/foreign-stocks/foreign_etf_list.pdf";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const JP_PLACES = ["TSE", "NAG"];
const AU_PLACES = ["ASX", "CXA"];
const PLACE = { 美國: "US", 香港: "Hong Kong", 日本: "Tokyo", 澳洲: "Australia" };
const FUND_CCY = { 美元: "USD", 港幣: "HKD", 日幣: "JPY", 澳幣: "AUD", 人民幣: "CNH" };
const STOCK_CCY = { US: "USD", "Hong Kong": "HKD", Tokyo: "JPY", Australia: "AUD" };
// Delisted 4 August 2026, still on the 15 July share list.
const DELISTED = new Set(["EA"]);

async function getBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/pdf" },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${url} did not return a PDF`);
        return bytes;
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function wordsOf(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
words = []
for page_no, page in enumerate(doc):
    for x0, y0, _x1, _y1, text, *_rest in page.get_text("words"):
        text = text.strip()
        if text:
            words.append({"page": page_no, "x": round(x0, 1), "y": round(y0, 1), "t": text})
json.dump(words, sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.error || python.status !== 0) {
    const detail = python.stderr?.toString() || python.error?.message || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
  }
  return JSON.parse(python.stdout.toString());
}

function editionOf(words) {
  const text = words.map((word) => word.t).join("");
  const match = text.match(/\[(\d{4}年\d{2}月\d{2}日)\]/);
  if (!match) throw new Error("the PDF does not print an edition date");
  return match[1];
}

function bandsOf(words, minY) {
  const pages = new Map();
  for (const word of words) {
    if (word.y < minY) continue;
    const page = pages.get(word.page) || [];
    pages.set(word.page, page);
    page.push(word);
  }
  const bands = [];
  for (const page of pages.values()) {
    page.sort((left, right) => left.y - right.y || left.x - right.x);
    let band = [];
    let top = null;
    for (const word of page) {
      if (top != null && word.y - top > 4 && band.length) {
        bands.push(band);
        band = [];
      }
      if (!band.length) top = word.y;
      band.push(word);
    }
    if (band.length) bands.push(band);
  }
  return bands;
}

function cell(band, from, to) {
  return band
    .filter((word) => word.x >= from && word.x < to)
    .sort((left, right) => left.x - right.x)
    .map((word) => word.t)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function listingType(name) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const header = table[0].split(",").map((item) => item.trim().toLowerCase());
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
  if (!/^\d+$/.test(digits)) return [row.ticker];
  return [...new Set([row.ticker, digits, digits.padStart(4, "0"), digits.padStart(5, "0")])];
}

function placesOf(row) {
  if (row.exchange === "US") return US_PLACES;
  if (row.exchange === "Tokyo") return JP_PLACES;
  if (row.exchange === "Hong Kong") return ["HKEX"];
  if (row.exchange === "Australia") return AU_PLACES;
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
  rows.push(row);
}

function shareRows(words) {
  const rows = [];
  let dropped = 0;
  for (const band of bandsOf(words, 120)) {
    const ticker = cell(band, 240, 285).toUpperCase();
    const name = cell(band, 0, 230);
    const exchange = PLACE[cell(band, 450, 500)];
    const currency = cell(band, 505, 600);
    if (!ticker && !name) continue;
    if (!ticker || !name || !exchange) throw new Error(`unreadable share row ${ticker} ${name}`);
    if (currency !== STOCK_CCY[exchange]) throw new Error(`${exchange} ${ticker} is priced in ${currency}`);
    if (DELISTED.has(ticker)) {
      dropped += 1;
      continue;
    }
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency,
      type: "STOCK",
      isin: "",
      raw: [ticker, name, exchange, currency, "STOCK"].join(" "),
    });
  }
  if (dropped !== 1) throw new Error(`expected to drop EA, dropped ${dropped}`);
  if (rows.length < 1500) throw new Error(`only ${rows.length} shares`);
  return rows;
}

function fundMark(band) {
  const found = new Set();
  for (const word of band) {
    if (word.x >= 130) continue;
    if (word.t === "Y" && word.x < 80) found.add("PI");
    else if (word.t === "★" && word.x < 110) found.add("TPC");
    else if (word.t === "★") found.add("DBU");
  }
  return ["PI", "TPC", "DBU"].filter((mark) => found.has(mark));
}

function fundRows(words) {
  const rows = [];
  for (const band of bandsOf(words, 105)) {
    const ticker = cell(band, 390, 435).toUpperCase();
    const name = cell(band, 130, 390);
    const exchange = PLACE[cell(band, 435, 468)];
    const currency = FUND_CCY[cell(band, 505, 600)];
    if (!ticker && !name) continue;
    if (!ticker || !name || !exchange || !currency) throw new Error(`unreadable fund row ${ticker} ${name}`);
    const type = listingType(name);
    const marks = fundMark(band);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency,
      type,
      isin: "",
      raw: [ticker, name, exchange, currency, type, ...marks].join(" "),
    });
  }
  if (rows.length < 500) throw new Error(`only ${rows.length} funds`);
  return rows;
}

const shareWords = wordsOf(await getBytes(STOCKS_PDF));
const fundWords = wordsOf(await getBytes(FUNDS_PDF));
const shareEdition = editionOf(shareWords);
const fundEdition = editionOf(fundWords);
if (shareEdition !== fundEdition) throw new Error(`share list ${shareEdition}, fund list ${fundEdition}`);

const seen = new Set();
const rows = [];
for (const row of shareRows(shareWords)) pushRow(rows, seen, row);
for (const row of fundRows(fundWords)) pushRow(rows, seen, row);

const tally = attachIsins(rows, loadIsinIndex());
rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("dbs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${rows.length} listings (${tally.one} with an ISIN, ${tally.none} unmatched, ${tally.several} ambiguous), edition ${shareEdition} ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
