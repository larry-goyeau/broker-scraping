// What Rakuten Securities sells. The domestic page names the sections:
// Tokyo Prime, Standard and Growth, Nagoya Premier, Main and Next, Sapporo
// main market and Ambitious, Fukuoka main market and Q-Board, every listing
// of those sections. PRO Market and a JASDEC non-handled name stay out.
// REIT, rights and preferred units are other products, except an 出資証券
// code that is not the JASDEC name. Domestic ETF and ETN are the handled
// search (sect5). Foreign ETFs listed in Japan stay: the caution page sells
// them. There is no ETC list.
//
// Abroad, the handled CSV is the sold list (the search without that filter
// is a larger database). The sell-only pages are a second list and come
// out. China ETFs are the Hong Kong ETF search; a REIT on that page comes
// out. ASEAN ETFs are the Singapore rows of that CSV. A US ETF keeps the
// venue from the ETF file when that file names NYSE Arca, Nasdaq or Cboe:
// the stock CSV writes NYSE for an Arca ETF. The code is then joined to
// ../../assets/stocks.csv and ../../assets/etfs.csv when that place has exactly one ISIN.
//
//   https://www.rakuten-sec.co.jp/web/domestic/stock/lineup/
//   https://www.rakuten-sec.co.jp/web/us/stock/lineup/
//   https://www.rakuten-sec.co.jp/web/foreign/china/lineup/
//   https://www.rakuten-sec.co.jp/web/foreign/asean/
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/rakuten/rakuten_scraping.mjs
//   node brokers/rakuten/rakuten_scraping.mjs --tokyo=./data_j.xlsx

import { stampRows } from "../../accepted.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const JASDEC = "https://www.jtg-sec.co.jp/meigara/no_handling.htm";
const NAGOYA = "https://www.nse.or.jp/api/stock/search.json";
const FUKUOKA = "https://www.fse.or.jp/market-info/company-search/";
const SAPPORO = "https://www.sse.or.jp/listing/list";
const TRKD = "https://www.trkd-asia.com/rakutensec/";
const REFERER = "https://www.rakuten-sec.co.jp/";

const US_CSV = `${TRKD}exportcsvus?all=on&vall=on&forwarding=na&target=0&theme=na&returns=na&head_office=na&name=&code=&sector=na&pageNo=&c=us&p=result&r1=on`;
const US_SELL = "https://www.rakuten-sec.co.jp/web/us/stock/lineup/sell.html";
const ETF_FILE = "https://www.rakuten-sec.co.jp/web/market/search/etf_search/ETFD.csv";
const CN_CSV = `${TRKD}exportcsvcn?catAll=on&all=on&r1=on&c=cn&p=result`;
const CN_ETF = `${TRKD}exportcsvcn?exch2=on&catAll=on&r1=on&c=cn&p=result`;
const CN_SELL = "https://www.rakuten-sec.co.jp/web/foreign/china/lineup/sell.html";
const ASEAN_CSV = `${TRKD}exportcsvasia?all=on&vall=on&forwarding=na&target=na&theme=na&returns=na&name=&freeword=&sector=na&c=asn&p=result`;
const JP_ETF = `${TRKD}result_ja.jsp?name=&code=&sect5=on&sector=na&c=ja&p=result&pageNo=`;

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
  Singapore: ["SGX", "SGX-ST"],
  IDX: ["IDX"],
  SET: ["SET"],
  Malaysia: ["MYX"],
  SSE: ["SSE"],
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
  Singapore: "SGD",
  IDX: "IDR",
  SET: "THB",
  Malaysia: "MYR",
  SSE: "CNY",
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
    name: normalize(decodeEntities(name)) || code,
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
  if ((row.exchange === "Hong Kong" || row.exchange === "SSE") && /^0+\d+$/.test(row.ticker)) {
    codes.push(String(Number(row.ticker)));
  }
  return codes;
}

function attachIsins(rows) {
  const index = loadIsinIndex();
  const tally = { one: 0, none: 0, several: 0 };
  for (const row of rows) {
    const places = FILE_EXCHANGE[row.exchange] || (JAPAN.has(row.exchange) ? JP_FILE : []);
    const found = new Set();
    for (const code of lookupCodes(row)) {
      const book = index.get(code);
      for (const place of places) {
        for (const isin of book?.get(place) || []) found.add(isin);
      }
    }
    if (found.size === 1) {
      const isin = [...found][0];
      row.isin = isin;
      row.query = isin;
      tally.one += 1;
    } else tally[found.size === 0 ? "none" : "several"] += 1;
  }
  return tally;
}

async function fetchBytes(url, headers = {}) {
  const response = await fetch(url, { headers: { "User-Agent": UA, Referer: REFERER, ...headers } });
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

function isEtn(value) {
  return /ETN|ＥＴＮ/i.test(String(value ?? ""));
}

function isReit(value) {
  return /REIT|リート|不動産投資信託/i.test(String(value ?? "")) && !/ETF|ＥＴＦ/i.test(String(value ?? ""));
}

function tableCodes(html, pattern) {
  const table = html.match(/<table[^>]*s1-tbl-data01[\s\S]*?<\/table>/i)?.[0] || "";
  const codes = [];
  for (const match of table.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cell = textOf(match[0].match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i)?.[1] || "");
    const code = cell.toUpperCase().replace(/\s+/g, "");
    if (pattern.test(code)) codes.push(code);
  }
  return codes;
}

function sellOnly(html, pattern) {
  const announced = Number(textOf(html).match(/（(\d+)銘柄）/)?.[1] || 0);
  const codes = tableCodes(html, pattern);
  if (!announced || codes.length !== announced) {
    throw new Error(`sell-only page announced ${announced} and parsed ${codes.length}`);
  }
  return new Set(codes);
}

async function jasdecCodes() {
  const html = await fetchText(JASDEC, "shift_jis");
  const codes = new Set();
  for (const match of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells = [...match[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => textOf(cell[1]));
    if (cells.length < 3 || !cells[2].includes("保管振替")) continue;
    const code = jpCode(cells[0]);
    if (code) codes.add(code);
  }
  if (!codes.has("8301")) throw new Error(`JASDEC table did not list 8301 (${[...codes].join(", ")})`);
  return codes;
}

function usMic(market) {
  const compact = normalize(market).replace(/\s+/g, "").toUpperCase();
  if (compact.includes("ARCA")) return "ARCX";
  if (compact.includes("NASDAQ")) return "XNAS";
  if (compact.includes("CBOE")) return "BATS";
  if (compact === "NYSE") return "XNYS";
  return "";
}

function etfVenue(place) {
  const text = normalize(place).normalize("NFKC").toUpperCase();
  if (!text) return "";
  if (text.includes("ARCA")) return "ARCX";
  if (text.includes("NASDAQ") || text.includes("ナスダック")) return "XNAS";
  if (text.includes("CBOE")) return "BATS";
  if (text.includes("NYSE")) return "XNYS";
  return "";
}

async function usRows(sell) {
  const table = parseCsv(await fetchText(US_CSV));
  if (table[0]?.[0] !== "現地コード" || table[0]?.[3] !== "市場") {
    throw new Error(`US CSV header is ${(table[0] || []).join(",")}`);
  }
  const etf = new Map();
  for (const line of parseCsv(await fetchText(ETF_FILE))) {
    const code = normalize(line[1]).toUpperCase();
    const exchange = etfVenue(line[3]);
    if (!code || !exchange) continue;
    etf.set(code, {
      exchange,
      type: isEtn(`${line[2]} ${line[22] || ""}`) ? "ETN" : "ETF",
      name: normalize(line[22]) || normalize(line[2]),
    });
  }
  const results = [];
  const seen = new Set();
  let dropped = 0;
  const unknown = new Set();
  for (const line of table.slice(1)) {
    const ticker = normalize(line[0]).toUpperCase();
    if (!ticker) continue;
    if (sell.has(ticker)) {
      dropped += 1;
      continue;
    }
    const listed = etf.get(ticker);
    const exchange = listed?.exchange || usMic(line[3]);
    if (!exchange) {
      unknown.add(line[3] || ticker);
      continue;
    }
    seen.add(ticker);
    results.push(rowOf({
      ticker,
      name: line[2] || listed?.name,
      exchange,
      type: listed?.type || (isEtn(line[2]) ? "ETN" : "STOCK"),
      note: line[3],
    }));
  }
  let extra = 0;
  for (const [ticker, listed] of etf) {
    if (seen.has(ticker) || sell.has(ticker)) continue;
    extra += 1;
    results.push(rowOf({
      ticker,
      name: listed.name,
      exchange: listed.exchange,
      type: listed.type,
      note: "etf file",
    }));
  }
  if (unknown.size) throw new Error(`unread US market: ${[...unknown].slice(0, 8).join(", ")}`);
  if (!results.length) throw new Error("US list returned no row");
  return { results, dropped, extra };
}

function cnCode(value) {
  const text = normalize(value).toUpperCase().replace(/\s+/g, "");
  if (/^\d{1,6}$/.test(text)) return text.padStart(text.length > 5 ? 6 : 5, "0");
  return "";
}

function cnExchange(market) {
  if (market === "香港") return "Hong Kong";
  if (market === "上海A") return "SSE";
  return "";
}

async function chinaRows(sell) {
  const handled = parseCsv(await fetchText(CN_CSV));
  const etfTable = parseCsv(await fetchText(CN_ETF));
  if (handled[0]?.[0] !== "現地コード") throw new Error("China CSV has no header");
  const etf = new Set();
  const reit = new Set();
  for (const line of etfTable.slice(1)) {
    const code = cnCode(line[0]);
    if (!code) continue;
    if (isReit(`${line[1]} ${line[2]}`)) reit.add(code);
    else etf.add(code);
  }
  if (!etf.size) throw new Error("China ETF list returned no ETF");
  const results = [];
  const unknown = new Set();
  let dropped = 0;
  let reitDropped = 0;
  for (const line of handled.slice(1)) {
    const ticker = cnCode(line[0]);
    if (!ticker) continue;
    if (sell.has(ticker) || sell.has(String(Number(ticker)))) {
      dropped += 1;
      continue;
    }
    if (reit.has(ticker) || isReit(`${line[1]} ${line[2]}`)) {
      reitDropped += 1;
      continue;
    }
    const exchange = cnExchange(normalize(line[3]));
    if (!exchange) {
      unknown.add(line[3] || ticker);
      continue;
    }
    results.push(rowOf({
      ticker,
      name: line[2] || line[1],
      exchange,
      type: etf.has(ticker) || /ETF|ＥＴＦ/i.test(`${line[1]} ${line[2]}`) ? "ETF" : "STOCK",
      note: line[3],
    }));
  }
  if (unknown.size) throw new Error(`unread China market: ${[...unknown].slice(0, 8).join(", ")}`);
  if (!results.length) throw new Error("China list returned no row");
  return { results, dropped, reitDropped, etf: etf.size };
}

async function aseanRows() {
  const table = parseCsv(await fetchText(ASEAN_CSV));
  if (table[0]?.[0] !== "現地コード") throw new Error("ASEAN CSV has no header");
  const marketOf = {
    インドネシア: "IDX",
    タイ: "SET",
    シンガポール: "Singapore",
    マレーシア: "Malaysia",
  };
  const results = [];
  const unknown = new Set();
  let reitDropped = 0;
  for (const line of table.slice(1)) {
    const ticker = normalize(line[0]).toUpperCase();
    const name = `${line[1] || ""} ${line[2] || ""}`;
    if (!ticker) continue;
    if (isReit(name)) {
      reitDropped += 1;
      continue;
    }
    const exchange = marketOf[normalize(line[3])];
    if (!exchange) {
      unknown.add(line[3] || ticker);
      continue;
    }
    const etf = /ETF|ＥＴＦ/i.test(name);
    if (etf && exchange !== "Singapore") throw new Error(`ASEAN ETF outside Singapore: ${ticker} ${line[3]}`);
    results.push(rowOf({
      ticker,
      name: line[2] || line[1],
      exchange,
      type: etf ? "ETF" : "STOCK",
      note: line[3],
    }));
  }
  if (unknown.size) throw new Error(`unread ASEAN market: ${[...unknown].join(", ")}`);
  if (!results.length) throw new Error("ASEAN list returned no row");
  return { results, reitDropped };
}

async function tokyoStockRows(jasdec) {
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
  let jasdecDropped = 0;
  const unseen = new Map();
  for (const line of grid.slice(1)) {
    const code = jpCode(line[codeAt]);
    const name = normalize(line[nameAt]);
    const section = normalize(line[sectionAt]);
    if (!code || !section) continue;
    if (section === "PRO Market") {
      pro += 1;
      continue;
    }
    if (section.startsWith("ETF") || section.startsWith("REIT")) continue;
    if (!TOKYO_STOCK.has(section)) {
      unseen.set(section, (unseen.get(section) || 0) + 1);
      continue;
    }
    if (jasdec.has(code)) {
      jasdecDropped += 1;
      continue;
    }
    results.push(rowOf({ ticker: code, name, exchange: "Tokyo", type: "STOCK", note: section }));
  }
  if (unseen.size) {
    throw new Error(`JPX section not classified: ${[...unseen].map(([section, count]) => `${count} ${section}`).join(", ")}`);
  }
  if (!jasdecDropped) throw new Error("Tokyo file did not contain a JASDEC code");
  return { results, pro, jasdecDropped };
}

async function domesticEtfRows() {
  const results = [];
  let announced = 0;
  const markets = new Map();
  for (let page = 1; page < 40; page += 1) {
    const html = await fetchText(`${JP_ETF}${page}`);
    if (page === 1) announced = Number(textOf(html).match(/(\d+)件中/)?.[1] || 0);
    const batch = [];
    for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => textOf(cell[1]));
      const code = jpCode(cells[0]);
      if (!code) continue;
      const market = cells[2] || "";
      let exchange = "";
      if (market.includes("東証")) exchange = "Tokyo";
      else if (market.includes("名証")) exchange = "Nagoya";
      else if (market.includes("福証")) exchange = "Fukuoka";
      else if (market.includes("札証")) exchange = "Sapporo";
      if (!exchange) throw new Error(`domestic ETF has an unread market: ${market} ${code}`);
      const type = isEtn(`${market} ${cells[1]}`) ? "ETN" : "ETF";
      markets.set(`${exchange} ${type}`, (markets.get(`${exchange} ${type}`) || 0) + 1);
      batch.push(rowOf({ ticker: code, name: cells[1], exchange, type, note: market }));
    }
    results.push(...batch);
    if (batch.length < 20) break;
  }
  if (!announced || results.length !== announced) {
    throw new Error(`domestic ETF search announced ${announced} and returned ${results.length}`);
  }
  return { results, markets };
}

async function nagoyaRows() {
  const results = [];
  for (const [division, note] of [["1", "Premier"], ["2", "Main"], ["3", "Next"]]) {
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
        results.push(rowOf({ ticker: code, name: item.stockName_j, exchange: "Nagoya", type: "STOCK", note }));
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
      if (/上場投信|受益証券/.test(name)) continue;
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
    if (/PRO|プロ/i.test(title)) continue;
    if (!title.includes("本則") && !title.includes("アンビシャス")) {
      throw new Error(`Sapporo has an unread section: ${title}`);
    }
    let count = 0;
    for (const block of part.matchAll(/<dt>\s*([0-9A-Za-z]+)\s*<\/dt>([\s\S]*?)<\/dl>/gi)) {
      const code = jpCode(block[1]);
      if (!code || code === "0000") continue;
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

const [jasdec, usSellHtml, cnSellHtml] = await Promise.all([
  jasdecCodes(),
  fetchText(US_SELL),
  fetchText(CN_SELL),
]);
const usSell = sellOnly(usSellHtml, /^[A-Z][A-Z0-9.]{0,8}$/);
const cnSell = sellOnly(cnSellHtml, /^\d{4,6}$/);

const [us, china, asean, tokyo, etf, nagoya, fukuoka, sapporo] = await Promise.all([
  usRows(usSell),
  chinaRows(cnSell),
  aseanRows(),
  tokyoStockRows(jasdec),
  domesticEtfRows(),
  nagoyaRows(),
  fukuokaRows(),
  sapporoRows(),
]);

const etfCodes = new Set(etf.results.map((row) => row.ticker));
const seen = new Set();
const results = [];
for (const row of [
  ...us.results,
  ...china.results,
  ...asean.results,
  ...tokyo.results,
  ...etf.results,
  ...nagoya,
  ...fukuoka.results,
  ...sapporo.results,
]) {
  // The regional company search also returns an ETF that the domestic ETF
  // search already lists on Tokyo. That page sells 株式, so the ETF stays out.
  if (row.type === "STOCK" && etfCodes.has(row.ticker) && row.exchange !== "Tokyo") continue;
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

const outputPath = new URL("rakuten-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(results), null, 2));

const byBook = new Map();
for (const row of results) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(results.map((row) => row.isin || `${row.type}:${row.ticker}`)).size;
console.error(
  `${results.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
console.error(`ISIN ${isins.one}. ${isins.several} codes match several. ${isins.none} match none.`);
console.error(`JASDEC left out: ${[...jasdec].join(", ")} (${tokyo.jasdecDropped} in the Tokyo file). PRO Market left out: ${tokyo.pro}.`);
console.error(`US sell-only left out of the handled file: ${us.dropped}. ETF file names not in that file: ${us.extra}.`);
console.error(`China sell-only left out: ${china.dropped}. REIT left out: ${china.reitDropped}. ETF list ${china.etf}.`);
console.error(`Domestic ETF/ETN ${[...etf.markets].map(([label, count]) => `${count} ${label}`).join(", ")}.`);
console.error(`Fukuoka ${[...fukuoka.sections].map(([label, count]) => `${count} ${label}`).join(", ")}.`);
console.error(`Sapporo ${[...sapporo.sections].map(([label, count]) => `${count} ${label}`).join(", ")}.`);
