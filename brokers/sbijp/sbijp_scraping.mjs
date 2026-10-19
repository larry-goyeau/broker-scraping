// What SBI Securities sells. The product page says every listing on Tokyo,
// Nagoya, Fukuoka and Sapporo. The caution page says TOKYO PRO Market is
// not sold, so those codes come out of the JPX month-end file. Domestic
// ETF and ETN are the unfiltered download of the handled-list search.
// REIT, infrastructure funds and the venture-fund bucket are other
// products. There is no ETC list.
//
// Abroad, each country page is the selection, with a market column and no
// ISIN. Ordinary shares, ETFs and depositary receipts stay. A REIT section
// stays out. The code is then joined to ../../assets/stocks.csv and ../../assets/etfs.csv when
// that place has exactly one ISIN.
//
//   https://www.sbisec.co.jp/ETGate/?OutSide=on&burl=search_home&cat1=home&cat2=lineup&dir=lineup%2F&file=home_lineup.html
//   https://search.sbisec.co.jp/v2/popwin/attention/stock/cash_C01.html
//   https://site0.sbisec.co.jp/marble/domestic/etfetn/etfetnsearch.do
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/sbi/sbi_scraping.mjs
//   node brokers/sbi/sbi_scraping.mjs --tokyo=./data_j.xlsx

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const ETF_CSV = "https://site0.sbisec.co.jp/marble/domestic/etfetn/etfetnListCsvDownload.do";
const NAGOYA = "https://www.nse.or.jp/api/stock/search.json";
const FUKUOKA = "https://www.fse.or.jp/market-info/company-search/";
const SAPPORO = "https://www.sse.or.jp/listing/list";
const LIST = "https://search.sbisec.co.jp/v2/popwin/info/stock/";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const JP_FILE = ["TSE", "NAG", "FSE", "SAPSE", "TYO"];
const FILE_EXCHANGE = {
  XNAS: ["NASDAQ"],
  XNYS: ["NYSE"],
  XASE: ["AMEX"],
  ARCX: ["AMEX"],
  BATS: ["CBOE"],
  "Hong Kong": ["HKEX"],
  KRX: ["KRX"],
  Singapore: ["SGX", "SGX-ST"],
  HOSE: ["HOSE"],
  HNX: ["HNX"],
  IDX: ["IDX"],
  SET: ["SET"],
  Malaysia: ["MYX"],
  MOEX: ["RUS"],
};
const JAPAN = new Set(["Tokyo", "Nagoya", "Fukuoka", "Sapporo"]);
const CCY = {
  XNAS: "USD",
  XNYS: "USD",
  ARCX: "USD",
  XASE: "USD",
  BATS: "USD",
  Tokyo: "JPY",
  Nagoya: "JPY",
  Fukuoka: "JPY",
  Sapporo: "JPY",
  "Hong Kong": "HKD",
  KRX: "KRW",
  Singapore: "SGD",
  HOSE: "VND",
  HNX: "VND",
  IDX: "IDR",
  SET: "THB",
  Malaysia: "MYR",
  MOEX: "RUB",
  OTC: "USD",
};

const TOKYO_STOCK = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
  "プライム（外国株式）",
  "スタンダード（外国株式）",
  "グロース（外国株式）",
  "出資証券",
]);

const FOREIGN = [
  ["pop6040_usequity_list.html", "us"],
  ["pop6040_hk_list.html", "hk"],
  ["pop6040_kr_list.html", "kr"],
  ["pop6040_sg_list.html", "sg"],
  ["pop6040_vn_list.html", "vn"],
  ["pop6040_id_list.html", "id"],
  ["pop6040_th_list.html", "th"],
  ["pop6040_my_list.html", "my"],
  ["pop6040_ru_list.html", "ru"],
  ["pop6040_etf.html", "etf"],
];

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

function pathArg(flag) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return "";
}

function rowOf({ ticker, name, exchange, type, note }) {
  const code = normalize(ticker).toUpperCase();
  const currency = CCY[exchange];
  if (!currency) throw new Error(`no currency for ${exchange}`);
  return {
    query: code,
    ticker: code,
    name: normalize(name) || code,
    exchange,
    currency,
    type,
    raw: [code, name, exchange, note, type].filter(Boolean).join(" "),
    isin: "",
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

function lookupCodes(row) {
  const codes = [row.ticker];
  if (row.exchange === "Hong Kong" && /^0+\d+$/.test(row.ticker)) codes.push(String(Number(row.ticker)));
  return codes;
}

function attachIsins(rows) {
  const index = loadIsinIndex();
  const tally = { one: 0, none: 0, several: 0 };
  for (const row of rows) {
    const places = FILE_EXCHANGE[row.exchange] || (JAPAN.has(row.exchange) ? JP_FILE : []);
    const groups = new Map();
    for (const code of lookupCodes(row)) {
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

async function fetchBytes(url, headers = {}) {
  const response = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function decode(bytes, encoding) {
  return new TextDecoder(encoding).decode(bytes);
}

async function fetchText(url, encoding = "utf-8") {
  return decode(await fetchBytes(url), encoding);
}

function workbookRows(bytes) {
  const run = spawnSync("python3", ["-c", XLSX_TO_JSON], { input: bytes, maxBuffer: 32_000_000 });
  if (run.status !== 0) throw new Error(run.stderr.toString() || "the JPX workbook could not be read");
  return JSON.parse(run.stdout.toString());
}

function jpCode(value) {
  const text = normalize(value).replace(/\.0$/, "").toUpperCase();
  return /^[0-9]{4}[0-9A-Z]?$|^[0-9]{3}[A-Z]$/.test(text) ? text : "";
}

function nagoyaCode(value) {
  const text = normalize(value).toUpperCase();
  const ordinary = text.match(/^([0-9]{4}|[0-9]{3}[A-Z])0$/);
  return ordinary ? ordinary[1] : jpCode(text);
}

function usMic(market) {
  const compact = market.replace(/\s+/g, "").toUpperCase();
  if (compact.includes("ARCA")) return "ARCX";
  if (compact.includes("AMERICAN") || compact === "AMEX") return "XASE";
  if (compact.includes("NASDAQ")) return "XNAS";
  if (compact.includes("CBOE")) return "BATS";
  if (compact.includes("OTC")) return "OTC";
  // The list writes NYSE, and also New York, NYCE, NICE and NYSE ADR for the same place.
  if (compact === "NYSE" || compact === "NEWYORK" || compact === "NYCE" || compact === "NICE" || compact === "NYSEADR") return "XNYS";
  return "";
}

function exchangeOf(page, market, title) {
  if (page === "us" || (page === "etf" && title.includes("米国"))) return usMic(market);
  if (page === "hk" || (page === "etf" && title.includes("中国"))) return "Hong Kong";
  if (page === "kr" || (page === "etf" && title.includes("韓国"))) return "KRX";
  if (page === "sg" || (page === "etf" && title.includes("シンガポール"))) return "Singapore";
  if (page === "vn" || (page === "etf" && title.includes("ベトナム"))) {
    if (/HOSE|HSX/i.test(market)) return "HOSE";
    if (/HNX/i.test(market)) return "HNX";
    return "";
  }
  if (page === "id") return "IDX";
  if (page === "th") return "SET";
  if (page === "my") return "Malaysia";
  if (page === "ru") return "MOEX";
  return "";
}

function linesOf(cell) {
  return decodeEntities(cell)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);
}

function nameOf(lines) {
  return lines.find((line) => /[ぁ-んァ-ン一-龯]/.test(line)) || lines[0] || "";
}

function tickerOf(value) {
  const text = normalize(value).toUpperCase().replace(/\s+/g, "");
  if (!text || text === "●" || /ティッカー|コード|銘柄/.test(text)) return "";
  return /^[0-9A-Z][0-9A-Z.&-]{0,14}$/.test(text) ? text : "";
}

function sectionsOf(html) {
  return html.split(/<h3[^>]*>/i).slice(1).map((part) => {
    const title = textOf(part.split(/<\/h3>/i)[0]);
    const body = (part.split(/<\/h3>/i)[1] || "").split(/<h3/i)[0];
    return { title, body };
  });
}

function tableRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells = [...match[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => linesOf(cell[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

async function foreignRows() {
  const results = [];
  const unknown = new Set();
  const counts = new Map();
  for (const [file, page] of FOREIGN) {
    const html = await fetchText(LIST + file, "shift_jis");
    for (const section of sectionsOf(html)) {
      if (/REIT/i.test(section.title)) continue;
      const type = /ETF/i.test(section.title) ? "ETF" : "STOCK";
      let kept = 0;
      for (const cells of tableRows(section.body)) {
        const ticker = tickerOf(cells[0]?.[0]);
        if (!ticker || cells.length < 2) continue;
        const market = cells[3]?.[0] || cells[cells.length - 1]?.[0] || "";
        const exchange = exchangeOf(page, market, section.title);
        if (!exchange) {
          if (market) unknown.add(`${page}:${market}`);
          continue;
        }
        kept += 1;
        results.push(rowOf({
          ticker,
          name: nameOf(cells[1] || []),
          exchange,
          type,
          note: market,
        }));
      }
      if (kept) counts.set(`${file} ${section.title}`, kept);
    }
  }
  if (unknown.size) throw new Error(`unread market: ${[...unknown].slice(0, 12).join(", ")}`);
  if (!results.length) throw new Error("foreign lists returned no row");
  return { results, counts };
}

async function tokyoStockRows() {
  const local = pathArg("tokyo");
  let source = local;
  if (!source) {
    const html = await fetchText(JPX_PAGE);
    const link = [...html.matchAll(/href="([^"]*data_j\.xlsx[^"]*)"/gi)]
      .map((match) => new URL(decodeEntities(match[1]), JPX_PAGE).href)[0];
    if (!link) throw new Error("JPX statistics page did not link data_j.xlsx");
    source = link;
  }
  const bytes = local ? fs.readFileSync(local) : await fetchBytes(source);
  const grid = workbookRows(bytes);
  const header = grid[0]?.map(normalize);
  const codeAt = header?.indexOf("コード");
  const nameAt = header?.indexOf("銘柄名");
  const sectionAt = header?.indexOf("市場・商品区分");
  if (codeAt !== 1 || nameAt !== 2 || sectionAt !== 3) throw new Error(`JPX header is ${(header || []).join(", ")}`);
  const results = [];
  let pro = 0;
  const unseen = new Map();
  for (const line of grid.slice(1)) {
    const code = jpCode(line[codeAt]);
    const name = normalize(line[nameAt]);
    const section = normalize(line[sectionAt]);
    if (!code || !section) continue;
    if (section === "PRO Market" || section.startsWith("ETF") || section.startsWith("REIT")) {
      if (section === "PRO Market") pro += 1;
      continue;
    }
    if (!TOKYO_STOCK.has(section)) {
      unseen.set(section, (unseen.get(section) || 0) + 1);
      continue;
    }
    results.push(rowOf({ ticker: code, name, exchange: "Tokyo", type: "STOCK", note: section }));
  }
  if (unseen.size) {
    throw new Error(`JPX section not classified: ${[...unseen].map(([section, count]) => `${count} ${section}`).join(", ")}`);
  }
  return { results, pro };
}

async function etfRows() {
  const bytes = await fetchBytes(ETF_CSV, { Referer: "https://site0.sbisec.co.jp/marble/domestic/etfetn/etfetnsearch.do" });
  const table = parseCsv(decode(bytes, "shift_jis"));
  const headerAt = table.findIndex((line) => line[0] === "銘柄区分" && line[1] === "銘柄コード");
  if (headerAt < 0) throw new Error("domestic ETF download has no header");
  const results = [];
  for (const line of table.slice(headerAt + 1)) {
    const kind = normalize(line[0]).toUpperCase();
    const code = jpCode(line[1]);
    if (!code || (kind !== "ETF" && kind !== "ETN")) continue;
    results.push(rowOf({ ticker: code, name: line[2], exchange: "Tokyo", type: kind, note: "domestic" }));
  }
  if (!results.length) throw new Error("domestic ETF download returned no row");
  return results;
}

async function nagoyaRows() {
  const results = [];
  for (const [division, type, note] of [["1", "STOCK", "Premier"], ["2", "STOCK", "Main"], ["3", "STOCK", "Next"], ["4", "ETF", "ETF"]]) {
    let page = 1;
    let total = Infinity;
    let got = 0;
    while (got < total && page < 20) {
      const url = new URL(NAGOYA);
      url.searchParams.append("listedDivision[]", division);
      url.searchParams.set("dispType", "stockCode");
      url.searchParams.set("dispOrder", "ASC");
      url.searchParams.set("dispCount", "100");
      url.searchParams.set("dispPage", String(page));
      const response = await fetch(url, { headers: { "User-Agent": UA } });
      if (!response.ok) throw new Error(`Nagoya search answered ${response.status}`);
      const data = await response.json();
      total = Number(data.list?.[0]?.listTotal || 0);
      const batch = data.stock || [];
      if (!batch.length) break;
      for (const item of batch) {
        const code = nagoyaCode(item.stockCode);
        if (!code) continue;
        got += 1;
        results.push(rowOf({ ticker: code, name: item.stockName_j, exchange: "Nagoya", type, note }));
      }
      page += 1;
    }
    if (got !== total) throw new Error(`Nagoya ${note} announced ${total} and returned ${got}`);
  }
  return results;
}

async function fukuokaRows() {
  const results = [];
  const sections = new Map();
  for (let industry = 1; industry <= 33; industry += 1) {
    const body = new URLSearchParams({
      kensaku: "search",
      cop_code: "",
      meigara: "",
      yomigana: "",
      cop_inbustry: String(industry),
    });
    const response = await fetch(FUKUOKA, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Referer: FUKUOKA },
      body,
    });
    if (!response.ok) throw new Error(`Fukuoka search answered ${response.status}`);
    const html = await response.text();
    for (const table of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
      const cells = [...table[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => textOf(cell[1]));
      const codeAt = cells.indexOf("コード");
      const marketAt = cells.indexOf("市場区分");
      const nameAt = cells.indexOf("銘柄名");
      if (codeAt < 0 || marketAt < 0 || nameAt < 0) continue;
      const code = jpCode(cells[codeAt + 1]);
      const market = cells[marketAt + 1];
      const name = cells[nameAt + 1];
      if (!code || !market) continue;
      if (/PRO/i.test(market)) continue;
      if (market !== "本則" && market !== "Q-Board") throw new Error(`Fukuoka has an unread section: ${market}`);
      sections.set(market, (sections.get(market) || 0) + 1);
      results.push(rowOf({ ticker: code, name, exchange: "Fukuoka", type: "STOCK", note: market }));
    }
  }
  if (!results.length) throw new Error("Fukuoka search returned no code");
  return { results, sections };
}

async function sapporoRows() {
  const html = await fetchText(SAPPORO);
  const results = [];
  const sections = new Map();
  for (const part of html.split(/<h5>/i).slice(1)) {
    const title = textOf(part.split(/<\/h5>/i)[0]);
    if (!title.includes("上場") || title.includes("債券")) continue;
    let count = 0;
    for (const block of part.matchAll(/<dt>\s*([0-9A-Za-z]+)\s*<\/dt>([\s\S]*?)<\/dl>/gi)) {
      const code = jpCode(block[1]);
      if (!code) continue;
      const alt = block[2].match(/alt="([^"]*)"/i);
      count += 1;
      results.push(rowOf({
        ticker: code,
        name: textOf(alt?.[1] || ""),
        exchange: "Sapporo",
        type: "STOCK",
        note: title,
      }));
    }
    if (count) sections.set(title, count);
  }
  if (!results.length) throw new Error("Sapporo list returned no code");
  return { results, sections };
}

const [foreign, tokyo, etf, nagoya, fukuoka, sapporo] = await Promise.all([
  foreignRows(),
  tokyoStockRows(),
  etfRows(),
  nagoyaRows(),
  fukuokaRows(),
  sapporoRows(),
]);

const seen = new Set();
const results = [];
for (const row of [...foreign.results, ...tokyo.results, ...etf, ...nagoya, ...fukuoka.results, ...sapporo.results]) {
  const key = `${row.ticker}:${row.exchange}:${row.type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push(row);
}

const isins = attachIsins(results);
results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

const outputPath = new URL("sbi-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(withoutObligations(results)), null, 2));

const byBook = new Map();
for (const row of results) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(results.map((row) => row.isin || `${row.type}:${row.ticker}`)).size;
console.error(
  `${results.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
console.error(`ISIN ${isins.one}. ${isins.several} codes match several. ${isins.none} match none.`);
console.error(`Tokyo PRO Market left out: ${tokyo.pro}. Domestic ETF/ETN ${etf.length}.`);
console.error(`Fukuoka ${[...fukuoka.sections].map(([label, count]) => `${count} ${label}`).join(", ")}.`);
console.error(`Sapporo ${[...sapporo.sections].map(([label, count]) => `${count} ${label}`).join(", ")}.`);
