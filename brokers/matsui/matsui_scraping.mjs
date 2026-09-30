// Matsui sells two books, and neither is "every name in the country".
//
// The US book is the symbol CSV linked from the selection page. It is the
// sold list: NYSE, NYSE American, NYSE Arca, Nasdaq and Cboe, as ordinary
// shares, ETFs and ADRs. AMEX in that file is NYSE American, so the row
// stores XASE. Cboe stores BATS. The NISA column is eligibility, not a
// second product. Neither file prints an ISIN. The code is joined to
// ../../assets/stocks.csv and ../../assets/etfs.csv. One match on that place is kept. Several
// matches are left blank. Arca names are filed under AMEX in that table.
// A Japanese code is the same security on Tokyo, Nagoya, Fukuoka and
// Sapporo, so those places share the one ISIN.
//
// The Japanese cash book is the class on the domestic list page. Tokyo
// Prime, Standard and Growth, domestic and foreign, come from the JPX
// month-end file linked on the statistics page. ETF and ETN are the
// ETF・ETN section; a name that says ETN is an ETN. PRO Market stays out.
// The REIT, venture-fund, country-fund and infrastructure-fund section
// stays out. 出資証券 stays, except a code in the 非取扱 table (8301,
// ほふり). Commodity ETFs run by WisdomTree Management Jersey Limited are
// the codes whose manager cell on the JPX ETF list names that company.
//
// Nagoya Premier, Main and Next come from the exchange search. Fukuoka and
// Sapporo contribute only the names their own pages mark as sole listings,
// Q-Board and Ambitious included, PRO left out. Japannext is a venue for
// Tokyo names, not another list.
//
//   https://www.matsui.co.jp/us-stock/domestic/list/symbollist/
//   https://www.matsui.co.jp/stock/domestic/list/
//   https://www.matsui.co.jp/market/stock/regulations/kisei.html
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/matsui/matsui_scraping.mjs
//   node brokers/matsui/matsui_scraping.mjs --us=./symbollist.csv --tokyo=./data_j.xlsx

import { stampRows } from "../../accepted.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const US_CSV = "https://www.matsui.co.jp/us-stock/domestic/list/symbollist/symbollist.csv";
const KISEI = "https://www.matsui.co.jp/market/stock/regulations/kisei.html";
const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const ETF_PAGE = "https://www.jpx.co.jp/equities/products/etfs/issues/01.html";
const NAGOYA = "https://www.nse.or.jp/api/stock/search.json";
const FUKUOKA = "https://www.fse.or.jp/market-info/single-listings/";
const SAPPORO = "https://www.sse.or.jp/listing/list";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const US_MARKET = {
  NASDAQ: "XNAS",
  NYSE: "XNYS",
  NYSE_ARCA: "ARCX",
  AMEX: "XASE",
  CBOE: "BATS",
};

const US_TYPE = {
  普通株式: "STOCK",
  ADR: "STOCK",
  ETF: "ETF",
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

const TOKYO_DROP = new Set([
  "PRO Market",
  "REIT・ベンチャーファンド・カントリーファンド・インフラファンド",
]);

const NAGOYA_SECTION = { 1: "Premier", 2: "Main", 3: "Next" };
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const JP_FILE = ["TSE", "NAG", "FSE", "SAPSE", "TYO"];
const US_FILE = { XNAS: "NASDAQ", XNYS: "NYSE", XASE: "AMEX", ARCX: "AMEX", BATS: "CBOE" };
const JAPAN = new Set(["Tokyo", "Nagoya", "Fukuoka", "Sapporo"]);

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

function fold(value) {
  return normalize(value).replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
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

function rowOf({ ticker, name, exchange, currency, type, note }) {
  const code = normalize(ticker).toUpperCase();
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

function attachIsins(rows) {
  const index = loadIsinIndex();
  const tally = { one: 0, none: 0, several: 0 };
  for (const row of rows) {
    const fileExchange = US_FILE[row.exchange];
    const places = fileExchange ? [fileExchange] : JAPAN.has(row.exchange) ? JP_FILE : [];
    const found = new Set();
    const book = index.get(row.ticker);
    for (const place of places) {
      for (const isin of book?.get(place) || []) found.add(isin);
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

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

async function fetchBytes(source) {
  if (source && !/^https?:/i.test(source)) return fs.readFileSync(source);
  const response = await fetch(source, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`${source} answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes;
}

function workbookRows(bytes) {
  const run = spawnSync("python3", ["-c", XLSX_TO_JSON], { input: bytes, maxBuffer: 32_000_000 });
  if (run.status !== 0) throw new Error(run.stderr.toString() || "the JPX workbook could not be read");
  return JSON.parse(run.stdout.toString());
}

function codeOf(value) {
  const text = normalize(value).replace(/\.0$/, "").toUpperCase();
  return /^[0-9]{4}[0-9A-Z]?$|^[0-9]{3}[A-Z]$/.test(text) ? text : "";
}

function nagoyaCode(value) {
  const text = normalize(value).toUpperCase();
  const ordinary = text.match(/^([0-9]{4}|[0-9]{3}[A-Z])0$/);
  return ordinary ? ordinary[1] : codeOf(text);
}

async function usRows() {
  const local = pathArg("us");
  const bytes = await fetchBytes(local || US_CSV);
  const text = new TextDecoder("shift_jis").decode(bytes);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0]?.split(",");
  if (header?.[0] !== "コード" || header?.[3] !== "市場" || header?.[4] !== "株式種類") {
    throw new Error(`US CSV header is ${lines[0] || "empty"}`);
  }
  const results = [];
  const adr = [];
  const unknown = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    if (cells.length !== 6) {
      unknown.push(line);
      continue;
    }
    const [code, name, , market, kind] = cells;
    const exchange = US_MARKET[market];
    const type = US_TYPE[kind];
    if (!exchange || !type || !normalize(code)) {
      unknown.push(`${code} ${market} ${kind}`);
      continue;
    }
    if (kind === "ADR") adr.push(code);
    results.push(rowOf({ ticker: code, name, exchange, currency: "USD", type, note: kind }));
  }
  if (unknown.length) throw new Error(`US CSV has ${unknown.length} unread rows, first: ${unknown[0]}`);
  return { results, adr: adr.length };
}

function jerseyCodes(html) {
  const codes = new Set();
  for (const match of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const row = match[0];
    if (!row.includes("ウィズダムツリー・マネジメント・ジャージー")) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textOf(cell[1]));
    const code = cells.find((cell) => /^[0-9]{3,4}[A-Z]?$/.test(cell));
    if (code) codes.add(code);
  }
  if (!codes.size) throw new Error("JPX ETF list did not name WisdomTree Management Jersey Limited");
  return codes;
}

function refusedCodes(html) {
  const start = html.indexOf('name="hitoriatukai"');
  if (start < 0) throw new Error("Matsui restrictions page has no 非取扱 table");
  const table = html.slice(start).match(/<table[\s\S]*?<\/table>/i);
  if (!table) throw new Error("Matsui restrictions page has no 非取扱 table");
  const codes = new Set();
  for (const match of table[0].matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells = [...match[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textOf(cell[1]));
    const code = codeOf(cells[0]);
    if (code) codes.add(code);
  }
  if (!codes.size) throw new Error("Matsui 非取扱 table listed no code");
  return codes;
}

async function tokyoRows(refused, jersey) {
  const local = pathArg("tokyo");
  let source = local;
  if (!source) {
    const html = await fetchText(JPX_PAGE);
    const link = [...html.matchAll(/href="([^"]*data_j\.xlsx[^"]*)"/gi)]
      .map((match) => new URL(decodeEntities(match[1]), JPX_PAGE).href)[0];
    if (!link) throw new Error("JPX statistics page did not link data_j.xlsx");
    source = link;
  }
  const grid = workbookRows(await fetchBytes(source));
  const header = grid[0]?.map(normalize);
  const codeAt = header?.indexOf("コード");
  const nameAt = header?.indexOf("銘柄名");
  const sectionAt = header?.indexOf("市場・商品区分");
  if (codeAt !== 1 || nameAt !== 2 || sectionAt !== 3) {
    throw new Error(`JPX header is ${(header || []).join(", ")}`);
  }
  const results = [];
  const dropped = new Map();
  const unseen = new Map();
  let etn = 0;
  for (const line of grid.slice(1)) {
    const code = codeOf(line[codeAt]);
    const name = normalize(line[nameAt]);
    const section = normalize(line[sectionAt]);
    if (!code || !section) continue;
    if (refused.has(code) || TOKYO_DROP.has(section) || jersey.has(code)) {
      const why = refused.has(code) ? "非取扱" : jersey.has(code) ? "WisdomTree Jersey" : section;
      dropped.set(why, (dropped.get(why) || 0) + 1);
      continue;
    }
    let type = "";
    if (TOKYO_STOCK.has(section)) type = "STOCK";
    else if (section === "ETF・ETN") type = fold(name).includes("ETN") ? "ETN" : "ETF";
    else unseen.set(section, (unseen.get(section) || 0) + 1);
    if (!type) continue;
    if (type === "ETN") etn += 1;
    results.push(rowOf({ ticker: code, name, exchange: "Tokyo", currency: "JPY", type, note: section }));
  }
  if (unseen.size) {
    throw new Error(`JPX section not classified: ${[...unseen].map(([section, count]) => `${count} ${section}`).join(", ")}`);
  }
  const still = results.filter((row) => row.type !== "STOCK" && fold(row.name).includes("WisdomTree"));
  if (still.length) throw new Error(`WisdomTree still in the book: ${still.map((row) => row.ticker).join(", ")}`);
  return { results, dropped, etn };
}

async function nagoyaRows(refused) {
  const results = [];
  let page = 1;
  let total = Infinity;
  while (results.length < total && page < 20) {
    const url = new URL(NAGOYA);
    for (const division of ["1", "2", "3"]) url.searchParams.append("listedDivision[]", division);
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
      const section = NAGOYA_SECTION[item.listedDivision];
      if (!code || !section || refused.has(code)) continue;
      results.push(rowOf({
        ticker: code,
        name: item.stockName_j,
        exchange: "Nagoya",
        currency: "JPY",
        type: "STOCK",
        note: section,
      }));
    }
    page += 1;
  }
  if (results.length !== total) throw new Error(`Nagoya search announced ${total} and returned ${results.length}`);
  return results;
}

async function fukuokaRows(refused) {
  const html = await fetchText(FUKUOKA);
  const results = [];
  const sections = new Map();
  for (const table of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const cells = [...table[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => textOf(cell[1]));
    const codeAt = cells.indexOf("コード");
    const marketAt = cells.indexOf("市場区分");
    const nameAt = cells.indexOf("会社名");
    if (codeAt < 0 || marketAt < 0 || nameAt < 0) continue;
    const code = codeOf(cells[codeAt + 1]);
    const market = cells[marketAt + 1];
    const nameCell = table[0].match(/<th>\s*会社名\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    const alt = nameCell?.[1].match(/alt="([^"]*)"/i);
    const name = textOf(alt?.[1] || nameCell?.[1] || "");
    if (!code || !market) continue;
    if (refused.has(code) || /PRO/i.test(market)) continue;
    if (market !== "本則" && market !== "Q-Board") {
      throw new Error(`Fukuoka sole list has an unread section: ${market}`);
    }
    sections.set(market, (sections.get(market) || 0) + 1);
    results.push(rowOf({ ticker: code, name, exchange: "Fukuoka", currency: "JPY", type: "STOCK", note: market }));
  }
  if (!results.length) throw new Error("Fukuoka sole-listing page returned no code");
  return { results, sections };
}

async function sapporoRows(refused) {
  const html = await fetchText(SAPPORO);
  const results = [];
  const sections = new Map();
  for (const part of html.split(/<h5>/i).slice(1)) {
    const title = textOf(part.split(/<\/h5>/i)[0]);
    if (!title.startsWith("単独上場会社")) continue;
    if (/PRO/i.test(title)) continue;
    const label = title.replace(/^単独上場会社\s*[-－]\s*/, "");
    let count = 0;
    for (const block of part.matchAll(/<dt>\s*([0-9A-Za-z]+)\s*<\/dt>([\s\S]*?)<\/dl>/gi)) {
      const code = codeOf(block[1]);
      if (!code || refused.has(code)) continue;
      const alt = block[2].match(/alt="([^"]*)"/i);
      count += 1;
      results.push(rowOf({
        ticker: code,
        name: textOf(alt?.[1] || ""),
        exchange: "Sapporo",
        currency: "JPY",
        type: "STOCK",
        note: label,
      }));
    }
    sections.set(label, count);
  }
  if (!results.length) throw new Error("Sapporo sole-listing sections returned no code");
  return { results, sections };
}

const [us, kiseiHtml, etfHtml] = await Promise.all([usRows(), fetchText(KISEI), fetchText(ETF_PAGE)]);
const refused = refusedCodes(kiseiHtml);
const jersey = jerseyCodes(etfHtml);
const [tokyo, nagoya, fukuoka, sapporo] = await Promise.all([
  tokyoRows(refused, jersey),
  nagoyaRows(refused),
  fukuokaRows(refused),
  sapporoRows(refused),
]);

const seen = new Set();
const results = [];
const overlap = [];
for (const row of [...us.results, ...tokyo.results, ...nagoya, ...fukuoka.results, ...sapporo.results]) {
  const key = `${row.ticker}:${row.exchange}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const other = results.find((held) => held.ticker === row.ticker && held.exchange !== row.exchange);
  if (other && (row.exchange === "Fukuoka" || row.exchange === "Sapporo" || other.exchange === "Fukuoka" || other.exchange === "Sapporo")) {
    overlap.push(`${row.ticker} ${other.exchange}+${row.exchange}`);
  }
  results.push(row);
}
if (overlap.length) console.error(`Sole listing also on another book: ${overlap.join(", ")}`);

const isins = attachIsins(results);
results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

const outputPath = new URL("matsui-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(results), null, 2));

const byBook = new Map();
for (const row of results) {
  const label = `${row.exchange} ${row.type}`;
  byBook.set(label, (byBook.get(label) || 0) + 1);
}
const instruments = new Set(results.map((row) => row.isin || `${row.type}:${row.ticker}`)).size;
console.error(
  `${results.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
console.error(`ISIN ${isins.one}. ${isins.several} codes match several. ${isins.none} match none.`);
console.error(`US ADR kept as shares: ${us.adr}`);
console.error(
  `Tokyo dropped ${[...tokyo.dropped].map(([why, count]) => `${count} ${why}`).join(", ")}. ETN ${tokyo.etn}.`
);
console.error(`非取扱 ${[...refused].join(", ")}. WisdomTree Jersey ${[...jersey].sort().join(", ")}`);
console.error(
  `Fukuoka ${[...fukuoka.sections].map(([label, count]) => `${count} ${label}`).join(", ")}. ` +
    `Sapporo ${[...sapporo.sections].map(([label, count]) => `${count} ${label}`).join(", ")}`
);
