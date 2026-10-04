// What moomoo証券 sells.
//
// Japan is the cash book on Tokyo Prime, Standard and Growth: listed
// stocks, ETFs, REITs and ETNs. The service page also leaves out same-day
// cash-deposit names, foreign stock certificates, foreign investment
// securities (ETC), and the Bank of Japan investment certificate 8301.
// Other exchanges and TOKYO PRO Market are outside those three boards.
// Infrastructure funds are on moomoo's own NISA ETF/REIT/ETN list, so they
// stay. A mutual fund or a foreign-currency MMF is priced at NAV, so it
// stays out.
//
//   https://www.moomoo.com/jp/support/topic7_201
//   https://www.moomoo.com/jp/support/topic7_205
//
// US stocks and US ETFs are the public buyable lists. The page says names
// that can only be sold are not on the list. There is no Japan list for
// Hong Kong or China shares.
//
//   https://www.moomoo.com/ja/quote/us-tradable-stocks
//   https://www.moomoo.com/ja/quote/us-tradable-etf
//
// Tokyo stocks come from the JPX month-end file, plus listings and
// delistings dated after that file. ETFs, ETNs and REITs come from the
// current JPX issue pages. A code is joined to ../../assets/stocks.csv and
// ../../assets/etfs.csv when that place has exactly one ISIN. A REIT page
// that prints an ISIN keeps that ISIN.
//
//   node brokers/moomoo/moomoo_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const LIST = "https://www.moomoo.com/quote-api/quote-v2/get-tradable-stock-list";
const REFERER = "https://www.moomoo.com/ja/quote/us-tradable-stocks";
const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const NEW_LISTINGS = "https://www.jpx.co.jp/listing/stocks/new/index.html";
const DELISTINGS = "https://www.jpx.co.jp/listing/stocks/delisted/index.html";
const MARGIN = "https://www.jpx.co.jp/markets/equities/margin-reg/index.html";
const ETF_PAGE = "https://www.jpx.co.jp/equities/products/etfs/issues/01.html";
const ETF_LEVERED = "https://www.jpx.co.jp/equities/products/etfs/leveraged-inverse/01.html";
const ETN_PAGE = "https://www.jpx.co.jp/equities/products/etns/issues/01.html";
const ETN_LEVERED = "https://www.jpx.co.jp/equities/products/etns/leveraged-inverse/01.html";
const REIT_PAGE = "https://www.jpx.co.jp/equities/products/reits/issues/index.html";
const INFRA_PAGE = "https://www.jpx.co.jp/equities/products/infrastructure/issues/index.html";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE_SIZE = 1000;
const US_MARKET = 2;
const BROKER = 1012;
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const OUTPUT = new URL("moomoo-parsed.json", import.meta.url);

const MARKET = { 10: "NYSE", 11: "NASDAQ", 12: "AMEX" };
const FILE_EXCHANGE = {
  NYSE: ["NYSE"],
  NASDAQ: ["NASDAQ"],
  AMEX: ["AMEX"],
  Tokyo: ["TSE", "NAG", "FSE", "SAPSE", "TYO"],
};
const CCY = { NYSE: "USD", NASDAQ: "USD", AMEX: "USD", Tokyo: "JPY" };
const DOMESTIC = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
]);
const SKIPPED = new Set([
  "プライム（外国株式）",
  "スタンダード（外国株式）",
  "グロース（外国株式）",
  "出資証券",
  "PRO Market",
  "ETF・ETN",
  "REIT・ベンチャーファンド・カントリーファンド・インフラファンド",
]);
const BOARD = {
  プライム: "プライム（内国株式）",
  スタンダード: "スタンダード（内国株式）",
  グロース: "グロース（内国株式）",
};

const XLSX_TO_JSON = `
import json, sys, zipfile, xml.etree.ElementTree as ET
from io import BytesIO

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
book = zipfile.ZipFile(BytesIO(sys.stdin.buffer.read()))
shared = []
if "xl/sharedStrings.xml" in book.namelist():
    root = ET.fromstring(book.read("xl/sharedStrings.xml"))
    for item in root.findall("m:si", NS):
        shared.append("".join(node.text or "" for node in item.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))
root = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))

def col_index(ref):
    n = 0
    for char in ref:
        if not char.isalpha():
            break
        n = n * 26 + ord(char) - 64
    return n - 1

rows = []
for row in root.findall("m:sheetData/m:row", NS):
    values = {}
    for cell in row.findall("m:c", NS):
        node = cell.find("m:v", NS)
        if node is None or node.text is None:
            value = ""
        elif cell.get("t") == "s":
            value = shared[int(node.text)]
        else:
            value = node.text
        values[col_index(cell.get("r") or "A")] = value
    if not values:
        continue
    width = max(values) + 1
    rows.append([values.get(i, "") for i in range(width)])
json.dump(rows, sys.stdout, ensure_ascii=False)
`;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function textOf(html) {
  return normalize(decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " ")));
}

function cellsOf(row) {
  return [...String(row).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textOf(cell[1]));
}

function rowsOf(html) {
  return [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => cellsOf(row[1]));
}

function jpCode(value) {
  const text = normalize(value).replace(/\.0$/, "").toUpperCase();
  const head = text.split(/[（(]/)[0].trim();
  return /^[0-9]{4}[0-9A-Z]?$|^[0-9]{3}[A-Z]$/.test(head) ? head : "";
}

function isoDate(value) {
  const match = normalize(value).match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function todayInTokyo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function rowOf({ ticker, name, exchange, type, note, isin = "" }) {
  const code = normalize(ticker).toUpperCase();
  const currency = CCY[exchange];
  if (!currency) throw new Error(`no currency for ${exchange}`);
  const printed = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "";
  return {
    query: printed || code,
    ticker: code,
    name: normalize(name) || code,
    exchange,
    currency,
    type,
    raw: [code, name, exchange, note, type].filter(Boolean).join(" "),
    isin: printed,
  };
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
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
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
    const book = index.get(row.ticker);
    const groups = new Map();
    for (const place of FILE_EXCHANGE[row.exchange] || []) {
      const ids = book?.get(place);
      if (ids?.size) groups.set(place, ids);
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

function quoteToken(params) {
  const body = JSON.stringify(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])));
  const hex = createHmac("sha512", "quote_web").update(body).digest("hex");
  return createHash("sha256").update(hex.slice(0, 10)).digest("hex").slice(0, 10);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function workbookRows(bytes) {
  const run = spawnSync("python3", ["-c", XLSX_TO_JSON], { input: bytes, maxBuffer: 32_000_000 });
  if (run.status !== 0) throw new Error(run.stderr.toString() || "the JPX workbook could not be read");
  return JSON.parse(run.stdout.toString());
}

async function usRows(instrumentType, type) {
  const results = [];
  const seen = new Set();
  let page = 0;
  let announced = 0;
  while (page < 20) {
    const params = {
      page,
      pageSize: PAGE_SIZE,
      marketType: US_MARKET,
      instrumentType,
      is_24h: 0,
      mainBroker: BROKER,
    };
    const url = new URL(LIST);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: REFERER,
        "quote-token": quoteToken(params),
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`moomoo ${type} list answered ${response.status}`);
    const payload = await response.json();
    if (payload.code !== 0) throw new Error(`moomoo ${type} list answered ${payload.code} ${payload.message || ""}`);
    const batch = payload.data?.list || [];
    const pagination = payload.data?.pagination || {};
    announced = Number(pagination.total);
    if (!Number.isInteger(announced) || announced < 1) throw new Error(`moomoo ${type} list has no total`);
    for (const item of batch) {
      const ticker = normalize(item.stockCode).toUpperCase();
      const exchange = MARKET[item.marketCode];
      if (!ticker || !exchange) throw new Error(`moomoo ${type} row has an unread market: ${item.stockCode} ${item.marketCode}`);
      if (item.marketLabel !== "US") throw new Error(`moomoo ${type} row is not a US name: ${ticker} ${item.marketLabel}`);
      if (item.tradeLimit !== 0) throw new Error(`moomoo ${type} row ${ticker} has tradeLimit ${item.tradeLimit}`);
      const key = `${ticker}:${exchange}`;
      if (seen.has(key)) throw new Error(`moomoo ${type} lists ${ticker} on ${exchange} twice`);
      seen.add(key);
      results.push(rowOf({
        ticker,
        name: item.stockName,
        exchange,
        type,
        note: normalize(item.industryName),
      }));
    }
    const pageCount = Number(pagination.pageCount);
    if (batch.length < PAGE_SIZE || page + 1 >= pageCount) break;
    page += 1;
  }
  // The announced total stays one above the rows every page size returns.
  if (results.length !== announced && results.length + 1 !== announced) {
    throw new Error(`moomoo ${type} list announced ${announced} and returned ${results.length}`);
  }
  return results;
}

function productRows(html, { type, note, nameFrom }) {
  const results = [];
  for (const cells of rowsOf(html)) {
    const codeAt = cells.findIndex((cell) => jpCode(cell));
    if (codeAt < 0) continue;
    const code = jpCode(cells[codeAt]);
    const isin = cells[codeAt].match(/[A-Z]{2}[A-Z0-9]{9}\d/)?.[0] || "";
    const nameCell = cells[nameFrom === "before" ? codeAt - 1 : codeAt + 1] || "";
    const name = normalize(nameCell).replace(/\s+iNAV\b.*$/, "").replace(/\s+投資証券$/, "");
    if (!name) throw new Error(`JPX ${type} ${code} has no name`);
    results.push(rowOf({ ticker: code, name, exchange: "Tokyo", type, note, isin }));
  }
  if (!results.length) throw new Error(`JPX ${type} page returned no code`);
  return results;
}

function sameDayCash(html) {
  const active = html.split("信用取引に関する規制を解除された銘柄")[0];
  if (!active.includes("規制を行っている銘柄")) throw new Error("JPX regulation page has no active table");
  const codes = new Set();
  for (const cells of rowsOf(active)) {
    if (!cells.join(" ").includes("即日現金")) continue;
    const code = cells.map(jpCode).find(Boolean);
    if (!code) throw new Error(`same-day cash row has no code: ${cells.join(" | ")}`);
    codes.add(code);
  }
  return codes;
}

function delistedByToday(html, today) {
  const codes = new Set();
  let dated = 0;
  for (const cells of rowsOf(html)) {
    const date = isoDate(cells[0]);
    const code = jpCode(cells[2]);
    if (!date || !code) continue;
    dated += 1;
    if (date <= today) codes.add(code);
  }
  if (!dated) throw new Error("JPX delisting page returned no code");
  return codes;
}

function listingsByToday(html, today) {
  const body = html.slice(html.indexOf("<tbody>"));
  const rows = rowsOf(body);
  const results = [];
  for (let i = 0; i < rows.length; i += 2) {
    const top = rows[i];
    const bottom = rows[i + 1];
    const date = isoDate(top?.[0]);
    const code = jpCode(top?.[2]);
    if (!date && !code) continue;
    if (!bottom || !date || !code) throw new Error(`new listing row could not be read: ${(top || []).join(" | ")}`);
    const market = normalize(bottom[0]);
    if (!BOARD[market]) throw new Error(`new listing ${code} is on an unread board: ${market}`);
    const name = normalize(top[1]).replace(/代表者インタビュー/g, "").replace(/\s*[*＊]+\s*$/g, "").trim();
    if (!name) throw new Error(`new listing ${code} has no name`);
    if (date <= today) results.push({ code, name, note: BOARD[market], date });
  }
  if (!results.length) throw new Error("JPX new-listing page returned no code");
  return results;
}

async function tokyoStockRows(today) {
  const page = await fetchText(JPX_PAGE);
  const link = [...page.matchAll(/href="([^"]*data_j\.xlsx[^"]*)"/gi)]
    .map((match) => new URL(decodeEntities(match[1]), JPX_PAGE).href)[0];
  if (!link) throw new Error("JPX statistics page did not link data_j.xlsx");
  const grid = workbookRows(await fetchBytes(link));
  const header = grid[0]?.map(normalize);
  const codeAt = header?.indexOf("コード");
  const nameAt = header?.indexOf("銘柄名");
  const sectionAt = header?.indexOf("市場・商品区分");
  const dateAt = header?.indexOf("日付");
  if (codeAt !== 1 || nameAt !== 2 || sectionAt !== 3) throw new Error(`JPX header is ${(header || []).join(", ")}`);
  const asOf = normalize(grid[1]?.[dateAt]);
  if (!/^\d{8}$/.test(asOf)) throw new Error(`JPX file has no date: ${asOf}`);

  const [delistedHtml, newHtml, marginHtml] = await Promise.all([
    fetchText(DELISTINGS),
    fetchText(NEW_LISTINGS),
    fetchText(MARGIN),
  ]);
  const gone = delistedByToday(delistedHtml, today);
  const cash = sameDayCash(marginHtml);
  const results = [];
  const seen = new Set();
  const skipped = new Map();
  let removed = 0;
  let bank = 0;
  for (const line of grid.slice(1)) {
    const code = jpCode(line[codeAt]);
    const section = normalize(line[sectionAt]);
    if (!code || !section) continue;
    if (SKIPPED.has(section)) {
      skipped.set(section, (skipped.get(section) || 0) + 1);
      continue;
    }
    if (!DOMESTIC.has(section)) throw new Error(`JPX section not classified: ${section}`);
    if (code === "8301") {
      bank += 1;
      continue;
    }
    if (gone.has(code) || cash.has(code)) {
      removed += 1;
      continue;
    }
    seen.add(code);
    results.push(rowOf({
      ticker: code,
      name: line[nameAt],
      exchange: "Tokyo",
      type: "STOCK",
      note: section,
    }));
  }

  let added = 0;
  for (const listing of listingsByToday(newHtml, today)) {
    if (seen.has(listing.code) || gone.has(listing.code) || cash.has(listing.code) || listing.code === "8301") continue;
    seen.add(listing.code);
    added += 1;
    results.push(rowOf({
      ticker: listing.code,
      name: listing.name,
      exchange: "Tokyo",
      type: "STOCK",
      note: listing.note,
    }));
  }
  return { results, asOf, removed, added, bank, cash: cash.size, skipped };
}

function uniqueProducts(groups) {
  const results = [];
  const seen = new Map();
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.ticker)) throw new Error(`${row.ticker} is listed twice, as ${seen.get(row.ticker)} and ${row.type}`);
      seen.set(row.ticker, row.type);
      results.push(row);
    }
  }
  return results;
}

const today = todayInTokyo();
const [usStocks, usEtfs, tokyo, etf, etfLevered, etn, etnLevered, reit, infra] = await Promise.all([
  usRows(1, "STOCK"),
  usRows(2, "ETF"),
  tokyoStockRows(today),
  fetchText(ETF_PAGE).then((html) => productRows(html, { type: "ETF", note: "ETF", nameFrom: "after" })),
  fetchText(ETF_LEVERED).then((html) => productRows(html, { type: "ETF", note: "ETF", nameFrom: "after" })),
  fetchText(ETN_PAGE).then((html) => productRows(html, { type: "ETN", note: "ETN", nameFrom: "after" })),
  fetchText(ETN_LEVERED).then((html) => productRows(html, { type: "ETN", note: "ETN", nameFrom: "after" })),
  fetchText(REIT_PAGE).then((html) => productRows(html, { type: "REIT", note: "REIT", nameFrom: "before" })),
  fetchText(INFRA_PAGE).then((html) => productRows(html, { type: "REIT", note: "infrastructure", nameFrom: "before" })),
]);

const products = uniqueProducts([etf, etfLevered, etn, etnLevered, reit, infra]);
const results = [...usStocks, ...usEtfs, ...tokyo.results, ...products];
const isins = attachIsins(results);
results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(results)), null, 2));

const byBook = new Map();
for (const row of results) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${results.length} listings (${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`,
);
console.error(`ISIN ${isins.one} from the files, ${isins.printed} printed on the page. ${isins.several} codes match several. ${isins.none} match none.`);
console.error(`Tokyo file ${tokyo.asOf}. Delisted or same-day cash left out: ${tokyo.removed}. Listings after the file: ${tokyo.added}. Same-day cash names on the JPX page: ${tokyo.cash}.`);
console.error(`Bank of Japan certificate left out: ${tokyo.bank}.`);
