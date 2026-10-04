// What Rakuten Trade (Malaysia) sells in the United States and Hong
// Kong, with no login. Five public PDFs are the tradeable counters.
// The page says Rakuten Trade selects them.
//
//   US shares, US ETFs          11 September 2026
//   US ADRs, Hong Kong shares,
//   Hong Kong ETFs              27 August 2026
//
// Bursa is the public roster, not one of these PDFs. The terms take
// out the LEAP Market and leveraged or inverse ETFs, so those rows
// go. A bond is not a share. The clause that also drops "any other
// Securities … as notified" names no counter, so those stay.
//
// The PDFs print no ISIN. One is filled from the shared lists when a
// single code on the allowed places matches. The US file does not say
// which American exchange, so the row stays "US".
//
//   https://www.rakutentrade.my/from-wall-street-to-victoria-harbour-trade-it-all
//
//   node brokers/rakutenma/rakutenma_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { inflateSync } from "node:zlib";
import fs from "node:fs";

const PAGE = "https://www.rakutentrade.my/from-wall-street-to-victoria-harbour-trade-it-all";
const BURSA = "https://www.klsescreener.com/v2/screener/quote_results";
// Kenanga KLCI Daily 2x Leveraged (0834EA) and Daily (−1x) Inverse (0835EA).
const BURSA_OUT = new Set(["0834EA", "0835EA"]);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];

async function getBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA },
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

function pdfText(bytes) {
  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const runs = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const start = raw.indexOf("stream", cursor);
    if (start < 0) break;
    if (raw.subarray(Math.max(0, start - 3), start).toString("latin1").endsWith("end")) {
      cursor = start + 6;
      continue;
    }
    const dataStart = raw[start + 6] === 13 ? start + 8 : start + 7;
    const end = raw.indexOf("endstream", dataStart);
    if (end < 0) break;
    cursor = end + 9;
    try {
      runs.push(inflateSync(raw.subarray(dataStart, end)).toString("latin1"));
    } catch {
      // A font or image stream is not the table.
    }
  }
  return runs.join("\n");
}

function shown(inner) {
  return [...inner.matchAll(/\((?:\\\)|[^)])*\)/g)]
    .map((match) => match[0].slice(1, -1).replace(/\\([()\\])/g, "$1"))
    .join("");
}

function rowsOf(bytes) {
  const text = pdfText(bytes);
  const cells = [];
  const tm = /1 0 0 1 ([0-9.]+) ([0-9.]+) Tm/g;
  const marks = [];
  for (const match of text.matchAll(tm)) {
    marks.push({ at: match.index, x: Number(match[1]), y: Number(match[2]) });
  }
  marks.push({ at: text.length, x: null, y: null });
  let page = 0;
  let lastY = Infinity;
  for (let i = 0; i < marks.length - 1; i += 1) {
    if (marks[i].y > lastY + 20) page += 1;
    lastY = marks[i].y;
    const slice = text.slice(marks[i].at, marks[i + 1].at);
    const drawn = [...slice.matchAll(/\[(.*?)\] TJ|\((?:\\\)|[^)])*\) Tj/gs)].map((match) =>
      match[1] != null ? shown(`[${match[1]}]`) : shown(match[0].replace(/ Tj$/, ""))
    );
    const value = drawn.join("").replace(/\s+/g, " ").trim();
    if (!value) continue;
    cells.push({ page, x: marks[i].x, y: marks[i].y, text: value });
  }
  const rows = [];
  for (const index of cells) {
    if (index.x >= 160 || !/^\d+$/.test(index.text)) continue;
    const same = cells.filter((cell) => cell.page === index.page && Math.abs(cell.y - index.y) < 1.5);
    const symbol = same.filter((cell) => cell.x > 300).sort((left, right) => right.x - left.x)[0];
    const name = same
      .filter((cell) => cell.x > index.x && (!symbol || cell.x < symbol.x))
      .sort((left, right) => left.x - right.x)
      .map((cell) => cell.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!symbol || !name) continue;
    rows.push({ name, symbol: symbol.text.replace(/\s+/g, "").toUpperCase() });
  }
  return rows;
}

function listingType(name, fallback) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return fallback;
}

function decode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function bursaRows(html) {
  if (!html.includes("Leap Market") || !html.includes("0834EA") || !html.includes("0835EA")) {
    throw new Error(`${BURSA} is not the full Bursa roster`);
  }
  const rows = [];
  for (const block of html.matchAll(/<tr class="list">(.*?)<\/tr>/gs)) {
    const title = block[1].match(/<td title="([^"]*)"><a [^>]*>([^<]+)<\/a>/);
    const code = block[1].match(/<td title="Code">([^<]*)<\/td>/);
    const categoryCell = block[1].match(/class="text-muted">\s*([^<]*)<\/small>/);
    if (!title || !code) continue;
    const ticker = decode(title[2]).replace(/\s+/g, "").toUpperCase();
    const name = decode(title[1]).replace(/\s+/g, " ").trim();
    const stockCode = decode(code[1]).trim().toUpperCase();
    const category = decode(categoryCell?.[1] || "").replace(/\s+/g, " ").trim();
    const board = category.split(",").pop().trim();
    if (board === "Leap Market" || board === "Bond & Loan") continue;
    if (BURSA_OUT.has(stockCode) || /\b(leveraged|inverse)\b/i.test(name)) continue;
    if (board !== "Main Market" && board !== "Ace Market" && board !== "ETF" && board !== "") continue;
    const type = board === "ETF" ? "ETF" : /investment trust/i.test(category) ? "REIT" : "STOCK";
    rows.push({ name, symbol: ticker, type, stockCode });
  }
  return rows;
}

function kindOf(url) {
  const file = decodeURIComponent(url.split("/").pop()).toLowerCase();
  if (file.startsWith("us stock")) return { exchange: "US", currency: "USD", type: "STOCK" };
  if (file.startsWith("us etf")) return { exchange: "US", currency: "USD", type: "ETF" };
  if (file.startsWith("us_adr") || file.startsWith("us adr")) return { exchange: "US", currency: "USD", type: "STOCK" };
  if (file.startsWith("hk_stock")) return { exchange: "Hong Kong", currency: "HKD", type: "STOCK" };
  if (file.startsWith("hk_etf")) return { exchange: "Hong Kong", currency: "HKD", type: "ETF" };
  return null;
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

function attachIsins(rows, index) {
  let one = 0;
  let none = 0;
  let several = 0;
  for (const row of rows) {
    const places = row.exchange === "Hong Kong" ? ["HKEX"] : row.exchange === "Bursa" ? ["MYX"] : US_PLACES;
    const groups = new Map();
    for (const code of codesOf(row)) {
      const book = index.get(code);
      for (const place of places) {
        const ids = book?.get(place);
        if (!ids?.size) continue;
        if (!groups.has(place)) groups.set(place, new Set());
        for (const isin of ids) groups.get(place).add(isin);
      }
    }
    const found = new Set();
    for (const ids of groups.values()) for (const isin of ids) found.add(isin);
    if (found.size === 1) {
      const isin = [...found][0];
      // A Malaysian ISIN carries the Bursa code. The screener ticker can
      // still point at an older code, and that ISIN is not this line.
      const code = row.exchange === "Bursa" ? row.raw.split(" ").pop() : "";
      if (code && isin.startsWith("MYL") && !isin.includes(code)) none += 1;
      else {
        row.isin = isin;
        one += 1;
      }
    } else if (found.size === 0) none += 1;
    else {
      several += 1;
      stampIsinMatches(row, groups, row.ticker);
    }
  }
  return { one, none, several };
}

const page = new TextDecoder().decode(await getBytes(PAGE));
const files = [...page.matchAll(/https:\/\/www\.rakutentrade\.my\/storage\/uploads\/files\/[^"'\s]+\.pdf/gi)].map((match) =>
  match[0].replace(/&amp;/g, "&")
);
if (!files.length) throw new Error(`${PAGE} names no list`);

const rows = [];
const seen = new Set();
const kept = new Map();
for (const url of files) {
  const kind = kindOf(url);
  if (!kind) continue;
  const parsed = rowsOf(await getBytes(url));
  if (parsed.length < 5) throw new Error(`${url} has ${parsed.length} rows`);
  let added = 0;
  for (const item of parsed) {
    const ticker = kind.exchange === "Hong Kong" ? item.symbol.replace(/^0+/, "") || "0" : item.symbol;
    if (!ticker || ticker.length > 12) continue;
    const key = `${kind.exchange}|${ticker}|${kind.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    added += 1;
    rows.push({
      query: ticker,
      ticker,
      name: item.name,
      exchange: kind.exchange,
      currency: kind.currency,
      type: listingType(item.name, kind.type),
      isin: "",
      raw: [ticker, item.name, kind.exchange, kind.currency, kind.type].join(" "),
    });
  }
  const label = `${kind.exchange} ${kind.type}`;
  kept.set(label, (kept.get(label) || 0) + added);
  console.error(`${decodeURIComponent(url.split("/").pop())} : ${parsed.length} lignes, ${added} nouvelles`);
}

const bursa = bursaRows(new TextDecoder().decode(await getBytes(BURSA)));
if (bursa.length < 1000) throw new Error(`${BURSA} has ${bursa.length} rows`);
let bursaAdded = 0;
for (const item of bursa) {
  const ticker = item.symbol;
  if (!ticker || ticker.length > 16) continue;
  const key = `Bursa|${ticker}|${item.type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  bursaAdded += 1;
  rows.push({
    query: ticker,
    ticker,
    name: item.name,
    exchange: "Bursa",
    currency: "MYR",
    type: listingType(item.name, item.type),
    isin: "",
    raw: [ticker, item.name, "Bursa", "MYR", item.type, item.stockCode].join(" "),
  });
}
console.error(`Bursa : ${bursa.length} lignes, ${bursaAdded} nouvelles`);

const tally = attachIsins(rows, loadIsinIndex());
rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker, undefined, { numeric: true }));
fs.writeFileSync(new URL("rakutenma-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const byType = new Map();
for (const row of rows) byType.set(`${row.exchange} ${row.type}`, (byType.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${rows.length} listings (${tally.one} with an ISIN, ${tally.none} unmatched, ${tally.several} ambiguous) ` +
    `(${[...byType].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
