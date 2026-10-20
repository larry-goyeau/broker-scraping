// What Futu Securities (Hong Kong) sells.
//
// The live-trading table names the venues and the exceptions.
// https://openapi.futunn.com/futu-api-doc/en/
//
// Hong Kong stocks, ETFs and REITs are the quote list. Warrants and
// CBBCs are not on it. Currency and ISIN come from the HKEX list of
// securities. The RMB column there is the offshore counter.
//
// US stocks and ETFs are that same list, kept when the Nasdaq symbol
// directory places them on Nasdaq, the NYSE, NYSE American or NYSE Arca.
// OTC, Cboe BZX, IEX and NYSE Texas are not venues the table names.
//
// A-shares are the Hong Kong exchange China Connect list, the names
// eligible for both buy and sell. Beijing and the rest of Shanghai and
// Shenzhen are quote-only. ChiNext and STAR Market stay, with a remark:
// an ordinary account cannot buy them.
// https://www.futuhk.com/hans/support/topic2_111
//
// Singapore and Japan are the quote list: stocks, ETFs and REITs.
// A Singapore warrant, company or structured, ends with W and a
// six-digit expiry. Those stay out. A Hong Kong name ending in -WR
// is the renminbi counter, not a warrant.
//
//   node brokers/futuhk/futuhk_scraping.mjs

import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";

// futunn.com serves a cached 403 for this path. moomoo.com is the same
// quote list: Hong Kong came back with the same names and the same total.
const LIST = "https://www.moomoo.com/quote-api/quote-v2/get-stock-list";
const REFERER = "https://www.moomoo.com/quote";
const NASDAQ = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const HKEX = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx";
const CONNECT = [
  ["https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SSE_Securities.xls", "Shanghai Stock Exchange"],
  ["https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SZSE_Securities.xls", "Shenzhen Stock Exchange"],
];

const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const OUTPUT = new URL("futuhk-parsed.json", import.meta.url);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE_SIZE = 50;
const EQUITY = 3;
const FUND = 4;
const TRUST = 12;

const MARKET = {
  HK: 1,
  US: 2,
  CN: 4,
  SG: 15,
  JP: 25,
};

const US_EXCHANGE = {
  Q: "Nasdaq",
  N: "New York Stock Exchange",
  A: "NYSE American",
  P: "NYSE Arca",
};

const FILE_EXCHANGE = {
  "Hong Kong": ["HKEX"],
  Nasdaq: ["NASDAQ"],
  "New York Stock Exchange": ["NYSE"],
  "NYSE American": ["AMEX"],
  "NYSE Arca": ["AMEX"],
  "Shanghai Stock Exchange": ["SSE"],
  "Shenzhen Stock Exchange": ["SZSE"],
  "Singapore Exchange": ["SGX", "SGX-ST"],
  Tokyo: ["TSE", "TYO"],
};

const HK_KEEP = new Set(["Equity", "Exchange Traded Products", "Real Estate Investment Trusts"]);
const CCY = { RMB: "CNH" };

const XLSX_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function quoteToken(params) {
  const body = JSON.stringify(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])));
  const hex = createHmac("sha512", "quote_web").update(body).digest("hex");
  return createHash("sha256").update(hex.slice(0, 10)).digest("hex").slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastCall = 0;

async function fetchJson(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const wait = Math.max(0, lastCall + 180 - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    const response = await fetch(target, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: REFERER,
        "quote-token": quoteToken(params),
      },
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    last = text.slice(0, 160);
    if (!text.startsWith("{")) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    const payload = JSON.parse(text);
    if (payload.code === 0) return payload;
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`${url} did not answer: ${last}`);
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function stockList(marketType) {
  const first = await fetchJson(LIST, { marketType, plateType: 1, rankType: 3, page: 0, pageSize: PAGE_SIZE });
  const announced = first.data?.pagination?.total;
  const pages = first.data?.pagination?.pageCount;
  if (!Number.isInteger(announced) || announced < 1 || !Number.isInteger(pages) || pages < 1) {
    throw new Error(`market ${marketType} has no total`);
  }
  const rows = [...(first.data.list || [])];
  for (let page = 1; page < pages; page += 1) {
    const payload = await fetchJson(LIST, { marketType, plateType: 1, rankType: 3, page, pageSize: PAGE_SIZE });
    rows.push(...(payload.data?.list || []));
    if (page % 40 === 0) console.error(`market ${marketType} page ${page} of ${pages}`);
  }
  const seen = new Set();
  for (const row of rows) {
    const code = normalize(row.stockCode).toUpperCase();
    if (!code) throw new Error(`market ${marketType} has a row with no code`);
    if (seen.has(code)) throw new Error(`market ${marketType} lists ${code} twice`);
    seen.add(code);
  }
  if (seen.size !== announced) throw new Error(`market ${marketType} announced ${announced} and returned ${seen.size}`);
  return rows;
}

function rowOf({ ticker, name, exchange, currency, type, isin = "", remark = "" }) {
  const code = normalize(ticker).toUpperCase();
  const printed = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "";
  if (!code || !exchange || !currency || !type) throw new Error(`incomplete row ${code} ${exchange} ${currency} ${type}`);
  const row = {
    query: printed || code,
    ticker: code,
    name: normalize(name) || code,
    exchange,
    currency,
    type,
    raw: [code, name, exchange, currency, type].filter(Boolean).join(" "),
    isin: printed,
  };
  if (remark) row.remark = remark;
  return row;
}

// https://www.futuhk.com/hans/support/topic2_111
function connectRemark(exchange, ticker, type) {
  if (type !== "STOCK") return "";
  if (exchange === "Shenzhen Stock Exchange" && /^30[0-2]/.test(ticker)) {
    return "ChiNext is for institutional professional investors only.";
  }
  if (exchange === "Shanghai Stock Exchange" && /^68[89]/.test(ticker)) {
    return "STAR Market is for institutional professional investors only.";
  }
  return "";
}

function kindOf(instrumentType) {
  if (instrumentType === FUND) return "ETF";
  if (instrumentType === TRUST) return "REIT";
  if (instrumentType === EQUITY) return "STOCK";
  return "";
}

function sgCurrency(name) {
  const text = normalize(name).toUpperCase();
  if (/US\$|\bUSD\b/.test(text)) return "USD";
  if (/\bHKD\b|HK\$/.test(text)) return "HKD";
  if (/\bEUR\b/.test(text)) return "EUR";
  if (/\bAUD\b/.test(text)) return "AUD";
  if (/\bCNH\b|\bCNY\b|\bRMB\b/.test(text)) return "CNH";
  if (/\bJPY\b/.test(text)) return "JPY";
  if (/\bGBP\b/.test(text)) return "GBP";
  return "SGD";
}

function columnIndex(ref) {
  let n = 0;
  for (const char of ref) {
    if (!/[A-Z]/i.test(char)) break;
    n = n * 26 + char.toUpperCase().charCodeAt(0) - 64;
  }
  return n - 1;
}

function xlsxRows(bytes) {
  const files = new Map();
  let offset = 0;
  while (offset + 30 < bytes.length) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) break;
    const flags = bytes.readUInt16LE(offset + 6);
    const method = bytes.readUInt16LE(offset + 8);
    const compressed = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    const stored = bytes.subarray(start, start + compressed);
    if (!(flags & 0x8)) {
      files.set(name, method === 0 ? stored : inflateRawSync(stored));
    }
    offset = start + compressed;
  }
  const tag = "(?:[a-z0-9]+:)?";
  const shared = [];
  const sharedXml = files.get("xl/sharedStrings.xml");
  if (sharedXml) {
    const xml = sharedXml.toString("utf8");
    for (const item of xml.matchAll(new RegExp(`<${tag}si\\b[^>]*>([\\s\\S]*?)</${tag}si>`, "g"))) {
      shared.push([...item[1].matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((node) => node[1]).join(""));
    }
  }
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("the HKEX workbook has no sheet");
  const rows = [];
  for (const row of sheet.toString("utf8").matchAll(new RegExp(`<${tag}row\\b[^>]*>([\\s\\S]*?)</${tag}row>`, "g"))) {
    const values = {};
    for (const cell of row[1].matchAll(new RegExp(`<${tag}c\\b([^>]*)>([\\s\\S]*?)</${tag}c>`, "g"))) {
      const ref = cell[1].match(/\br="([A-Z]+)\d+"/i)?.[1] || "A";
      const type = cell[1].match(/\bt="([^"]+)"/)?.[1] || "";
      const inline = [...cell[2].matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((node) => node[1]).join("");
      const raw = cell[2].match(new RegExp(`<${tag}v>([\\s\\S]*?)</${tag}v>`))?.[1] ?? "";
      let value = raw;
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = inline;
      values[columnIndex(ref)] = value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
    }
    if (!Object.keys(values).length) continue;
    const width = Math.max(...Object.keys(values).map(Number)) + 1;
    rows.push(Array.from({ length: width }, (_, index) => values[index] ?? ""));
  }
  return rows;
}

function hkBook(bytes) {
  const table = xlsxRows(bytes);
  const header = table.find((row) => row[0] === "Stock Code");
  if (!header) throw new Error("the HKEX list has no header");
  const currencyAt = header.findIndex((cell) => cell === "Trading Currency");
  const isinAt = header.findIndex((cell) => cell === "ISIN");
  const categoryAt = header.findIndex((cell) => cell === "Category");
  if (currencyAt < 0 || isinAt < 0 || categoryAt < 0) throw new Error("the HKEX list is missing a column");
  const book = new Map();
  for (const row of table) {
    const code = normalize(row[0]);
    if (!/^\d{5}$/.test(code)) continue;
    const category = normalize(row[categoryAt]);
    const isin = normalize(row[isinAt]).toUpperCase();
    const trading = normalize(row[currencyAt]).toUpperCase();
    const currency = CCY[trading] || (/^[A-Z]{3}$/.test(trading) ? trading : "");
    book.set(code, {
      category,
      currency,
      isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
    });
  }
  if (book.size < 1000) throw new Error(`the HKEX list has ${book.size} codes`);
  return book;
}

function connectRows(files) {
  const run = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys, xlrd
def code(value):
    if isinstance(value, float):
        return str(int(value)).zfill(6)
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    return text.zfill(6) if text.isdigit() else ""
out = []
for path, exchange in zip(sys.argv[1::2], sys.argv[2::2]):
    sheet = xlrd.open_workbook(path).sheet_by_index(0)
    for row in range(5, sheet.nrows):
        ticker = code(sheet.cell_value(row, 1))
        kind = str(sheet.cell_value(row, 5)).strip()
        if len(ticker) != 6:
            continue
        if kind == "EQTY":
            type = "STOCK"
        elif kind == "TRST":
            type = "ETF"
        else:
            continue
        out.append({"ticker": ticker, "name": str(sheet.cell_value(row, 3)).strip(), "exchange": exchange, "type": type})
json.dump(out, sys.stdout)
`,
      ...files.flatMap(([path, exchange]) => [path, exchange]),
    ],
    { encoding: "utf8", maxBuffer: 20_000_000 },
  );
  if (run.status !== 0) throw new Error(run.stderr || "the China Connect list could not be read");
  const rows = JSON.parse(run.stdout);
  if (rows.length < 1000) throw new Error(`the China Connect list has ${rows.length} names`);
  return rows;
}

function usBook(nasdaqText, otherText) {
  const book = new Map();
  function add(symbol, exchange, etf) {
    const code = normalize(symbol).toUpperCase();
    if (!code || code.includes(" ")) return;
    if (!book.has(code)) book.set(code, { exchange, etf });
  }
  for (const line of nasdaqText.split(/\r?\n/)) {
    if (!line.includes("|") || line.startsWith("Symbol") || line.startsWith("File")) continue;
    const cells = line.split("|");
    if (cells[3] === "Y") continue;
    add(cells[0], "Nasdaq", cells[6] === "Y");
  }
  for (const line of otherText.split(/\r?\n/)) {
    if (!line.includes("|") || line.startsWith("ACT") || line.startsWith("File")) continue;
    const cells = line.split("|");
    if (cells[6] === "Y") continue;
    const exchange = US_EXCHANGE[cells[2]];
    if (!exchange) continue;
    const etf = cells[4] === "Y";
    add(cells[0], exchange, etf);
    if (cells[7] && cells[7] !== cells[0]) add(cells[7], exchange, etf);
  }
  if (book.size < 5000) throw new Error(`the symbol directory has ${book.size} names`);
  return book;
}

function usPlace(book, ticker) {
  const code = normalize(ticker).toUpperCase();
  return book.get(code) || book.get(code.replaceAll("/", ".")) || book.get(code.replaceAll(".", "-")) || null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function codeKeys(ticker) {
  const code = normalize(ticker).toUpperCase();
  const keys = new Set([code, code.replaceAll("/", ".")]);
  if (/^\d+$/.test(code)) {
    keys.add(code.replace(/^0+/, "") || "0");
    keys.add(code.padStart(5, "0"));
    keys.add(code.padStart(6, "0"));
  }
  return [...keys];
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    if (!fs.existsSync(file)) throw new Error(`missing ${file.pathname}`);
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    const header = table[0]?.map((cell) => cell.trim().toLowerCase());
    if (header?.[0] !== "ticker" || header?.[1] !== "exchange" || header?.[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${(header || []).join(",")}`);
    }
    for (const line of table.slice(1)) {
      const code = normalize(line[0]).toUpperCase().split(":").pop();
      const exchange = normalize(line[1]).toUpperCase();
      const isin = normalize(line[2]).toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      for (const key of codeKeys(code)) {
        if (!index.has(key)) index.set(key, new Map());
        const places = index.get(key);
        if (!places.has(exchange)) places.set(exchange, new Set());
        places.get(exchange).add(isin);
      }
    }
  }
  return index;
}

function attachIsins(rows) {
  const index = loadIsinIndex();
  const tally = { one: 0, none: 0, several: 0, printed: 0 };
  for (const row of rows) {
    if (row.isin) {
      tally.printed += 1;
      continue;
    }
    const groups = new Map();
    for (const key of codeKeys(row.ticker)) {
      const book = index.get(key);
      for (const place of FILE_EXCHANGE[row.exchange] || []) {
        const ids = book?.get(place);
        if (ids?.size) {
          if (!groups.has(place)) groups.set(place, new Set());
          for (const isin of ids) groups.get(place).add(isin);
        }
      }
    }
    const found = new Set();
    for (const ids of groups.values()) for (const isin of ids) found.add(isin);
    if (found.size === 1) {
      const isin = [...found][0];
      row.isin = isin;
      row.query = isin;
      tally.one += 1;
    } else if (found.size === 0) tally.none += 1;
    else {
      tally.several += 1;
      stampIsinMatches(row, groups, row.ticker);
    }
  }
  return tally;
}

function keptCash(rows) {
  const out = [];
  let other = 0;
  for (const row of rows) {
    const type = kindOf(row.instrumentType);
    if (!type) {
      other += 1;
      continue;
    }
    out.push(row);
  }
  return { rows: out, other };
}

const [nasdaqText, otherText, hkBytes] = await Promise.all([
  fetchBytes(NASDAQ).then((bytes) => bytes.toString("utf8")),
  fetchBytes(OTHER).then((bytes) => bytes.toString("utf8")),
  fetchBytes(HKEX),
]);
const hkList = await stockList(MARKET.HK);
const usList = await stockList(MARKET.US);
const cnList = await stockList(MARKET.CN);
const sgList = await stockList(MARKET.SG);
const jpList = await stockList(MARKET.JP);

const connectFiles = [];
for (const [url, exchange] of CONNECT) {
  const dest = `/tmp/futu-connect-${exchange.split(" ")[0]}.xls`;
  fs.writeFileSync(dest, await fetchBytes(url));
  connectFiles.push([dest, exchange]);
}

const hkex = hkBook(hkBytes);
const america = usBook(nasdaqText, otherText);
const results = [];
const dropped = { hkOther: 0, hkCategory: 0, usOther: 0, usVenue: 0, cnOther: 0 };

const hkCash = keptCash(hkList);
dropped.hkOther = hkCash.other;
for (const row of hkCash.rows) {
  const code = normalize(row.stockCode).padStart(5, "0");
  const listed = hkex.get(code);
  if (listed && !HK_KEEP.has(listed.category)) {
    dropped.hkCategory += 1;
    continue;
  }
  const currency = listed?.currency || (/(?:-R|-WR|-SWR)$/i.test(row.name) ? "CNH" : "HKD");
  results.push(rowOf({
    ticker: code,
    name: row.name,
    exchange: "Hong Kong",
    currency,
    type: kindOf(row.instrumentType),
    isin: listed?.isin || "",
  }));
}

const usCash = keptCash(usList);
dropped.usOther = usCash.other;
for (const row of usCash.rows) {
  const place = usPlace(america, row.stockCode);
  if (!place) {
    dropped.usVenue += 1;
    continue;
  }
  const futuType = kindOf(row.instrumentType);
  const type = place.etf || futuType === "ETF" ? "ETF" : futuType;
  results.push(rowOf({
    ticker: row.stockCode,
    name: row.name,
    exchange: place.exchange,
    currency: "USD",
    type,
  }));
}

const cnNames = new Map();
for (const row of cnList) {
  const board = row.marketLabel === "SH" ? "Shanghai Stock Exchange" : row.marketLabel === "SZ" ? "Shenzhen Stock Exchange" : "";
  if (!board) {
    dropped.cnOther += 1;
    continue;
  }
  const code = normalize(row.stockCode).padStart(6, "0");
  cnNames.set(`${board}|${code}`, row.name);
}
let connectOnly = 0;
for (const row of connectRows(connectFiles)) {
  const key = `${row.exchange}|${row.ticker}`;
  if (!cnNames.has(key)) connectOnly += 1;
  results.push(rowOf({
    ticker: row.ticker,
    name: cnNames.get(key) || row.name,
    exchange: row.exchange,
    currency: "CNH",
    type: row.type,
    remark: connectRemark(row.exchange, row.ticker, row.type),
  }));
}

const sgCash = keptCash(sgList);
let sgWarrants = 0;
for (const row of sgCash.rows) {
  if (/W\d{6}$/i.test(row.name)) {
    sgWarrants += 1;
    continue;
  }
  results.push(rowOf({
    ticker: row.stockCode,
    name: row.name,
    exchange: "Singapore Exchange",
    currency: sgCurrency(row.name),
    type: kindOf(row.instrumentType),
  }));
}

const jpCash = keptCash(jpList);
for (const row of jpCash.rows) {
  results.push(rowOf({
    ticker: row.stockCode,
    name: row.name,
    exchange: "Tokyo",
    currency: "JPY",
    type: kindOf(row.instrumentType),
  }));
}

const isins = attachIsins(results);
results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

const written = stampRows(withoutObligations(results));
fs.writeFileSync(OUTPUT, JSON.stringify(written, null, 2));

function has(ticker, exchange) {
  return written.some((row) => row.ticker === ticker && row.exchange === exchange);
}

if (!has("00700", "Hong Kong") || !has("AAPL", "Nasdaq") || !has("SPY", "NYSE Arca")) {
  throw new Error("a known listing is missing");
}
if (!written.some((row) => row.ticker === "80700" && row.currency === "CNH")) throw new Error("the Tencent RMB counter is missing");
if (!written.some((row) => row.ticker === "09840" && row.currency === "USD")) throw new Error("the gold USD counter is missing");
if (has("TCEHY", "Nasdaq") || written.some((row) => row.ticker === "899050")) throw new Error("a quote-only name was kept");
if (dropped.usVenue < 500) throw new Error(`only ${dropped.usVenue} US names were outside the named venues`);

const byBook = new Map();
for (const row of written) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(`${written.length} listings (${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`);
console.error(`ISIN ${isins.one} from the files, ${isins.printed} printed on the exchange list. ${isins.several} codes match several. ${isins.none} match none.`);
console.error(`Left out: ${dropped.hkCategory} Hong Kong names outside stocks, ETFs and REITs; ${dropped.usVenue} US names outside Nasdaq, NYSE, NYSE American and NYSE Arca; ${dropped.cnOther} Beijing or index lines.`);
console.error(`China Connect names that are not on the Futu quote list: ${connectOnly}.`);
console.error(`Singapore warrants left out: ${sgWarrants}.`);
