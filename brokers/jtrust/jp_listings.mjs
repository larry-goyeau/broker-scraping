// Shared lists for the Japanese brokers whose shelf is "every name on these
// exchanges" (jtrust, iwaicosmo, webulljp). Nothing here decides what a
// broker sells; each scraper picks the pieces its own pages name.
//
// - Tokyo: JPX's month-end listed-issues file, linked from
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   Prime, Standard and Growth (domestic and foreign) and 出資証券 are STOCK,
//   the ETF・ETN section is ETF (ETN when the name says so). PRO Market and
//   the REIT / venture / country / infrastructure fund section are returned
//   as skipped counts, never as rows.
// - Nagoya: the exchange's own search, Premier, Main and Next
//   (https://www.nse.or.jp/api/stock/search.json).
// - Fukuoka: either every listing (the company search, by industry,
//   https://www.fse.or.jp/market-info/company-search/) or only the names
//   listed on Fukuoka alone (https://www.fse.or.jp/market-info/single-listings/).
// - JASDEC: the codes JASDEC (ほふり) does not hold, from J Trust's
//   non-handled table (https://www.jtg-sec.co.jp/meigara/no_handling.htm).
// - US: a ticker with no place in the broker's file takes the place
//   ../../assets/stocks.csv or etfs.csv files it under (AMEX is NYSE Arca
//   for an ETF and NYSE American for a share, CBOE is Cboe BZX).
// - ISIN: a code is joined to ../../assets/stocks.csv and etfs.csv when the
//   place has exactly one ISIN for it. A Japanese code is the same security on
//   Tokyo, Nagoya, Fukuoka and Sapporo, so those files are read together.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { stampIsinMatches } from "../../isinMatches.mjs";

export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const NAGOYA = "https://www.nse.or.jp/api/stock/search.json";
const FUKUOKA_SEARCH = "https://www.fse.or.jp/market-info/company-search/";
const FUKUOKA_SOLE = "https://www.fse.or.jp/market-info/single-listings/";
const JASDEC = "https://www.jtg-sec.co.jp/meigara/no_handling.htm";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

export const JP_PLACE = {
  Tokyo: { exchange: "Tokyo", mic: "XTKS" },
  Nagoya: { exchange: "Nagoya", mic: "XNGO" },
  Fukuoka: { exchange: "Fukuoka", mic: "XFKA" },
  Sapporo: { exchange: "Sapporo", mic: "XSAP" },
};

export const US_PLACE = {
  XNYS: "NYSE",
  XNAS: "NASDAQ",
  ARCX: "NYSE Arca",
  XASE: "NYSE American",
  BATS: "Cboe BZX",
};

const TOKYO_SECTION = {
  "プライム（内国株式）": "STOCK",
  "スタンダード（内国株式）": "STOCK",
  "グロース（内国株式）": "STOCK",
  "プライム（外国株式）": "STOCK",
  "スタンダード（外国株式）": "STOCK",
  "グロース（外国株式）": "STOCK",
  出資証券: "STOCK",
  "ETF・ETN": "ETF",
  "PRO Market": "",
  "REIT・ベンチャーファンド・カントリーファンド・インフラファンド": "",
};

export const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function textOf(html) {
  return clean(decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " ")));
}

export async function request(url, options = {}, as = "text") {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, ...(options.headers || {}) },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (as === "bytes") return bytes;
      return new TextDecoder(as === "text" ? "utf-8" : as).decode(bytes);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
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

const XLSX_TO_JSON = `
import json, sys, zipfile, xml.etree.ElementTree as ET
from io import BytesIO
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
book = zipfile.ZipFile(BytesIO(sys.stdin.buffer.read()))
shared = []
if "xl/sharedStrings.xml" in book.namelist():
    for item in ET.fromstring(book.read("xl/sharedStrings.xml")).findall(M + "si"):
        shared.append("".join(node.text or "" for node in item.iter(M + "t")))
def col(ref):
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + ord(ch) - 64
    return n - 1
rows = []
for row in ET.fromstring(book.read("xl/worksheets/sheet1.xml")).iter(M + "row"):
    values = {}
    for cell in row.findall(M + "c"):
        node = cell.find(M + "v")
        text = "" if node is None or node.text is None else node.text
        if cell.get("t") == "s" and text:
            text = shared[int(text)]
        elif cell.get("t") == "inlineStr":
            text = "".join(t.text or "" for t in cell.iter(M + "t"))
        values[col(cell.get("r") or "A")] = text
    if values:
        rows.append([values.get(i, "") for i in range(max(values) + 1)])
json.dump(rows, sys.stdout, ensure_ascii=False)
`;

export function xlsxRows(bytes, label) {
  const run = spawnSync("python3", ["-I", "-c", XLSX_TO_JSON], { input: bytes, maxBuffer: 200_000_000 });
  if (run.status !== 0) throw new Error(`${label}: ${run.stderr}`);
  return JSON.parse(run.stdout.toString("utf8"));
}

export function jpCode(value) {
  const text = clean(value).normalize("NFKC").replace(/\.0$/, "").toUpperCase();
  return /^[0-9]{4}[0-9A-Z]?$|^[0-9]{3}[A-Z]$/.test(text) ? text : "";
}

// The Nagoya search writes an ordinary share as its four characters and a 0.
function nagoyaCode(value) {
  const text = clean(value).toUpperCase();
  const ordinary = text.match(/^([0-9]{4}|[0-9]{3}[A-Z])0$/);
  return ordinary ? ordinary[1] : jpCode(text);
}

function jpRow({ code, name, place, type, note }) {
  const { exchange, mic } = JP_PLACE[place];
  const label = clean(String(name ?? "").normalize("NFKC")) || code;
  return {
    query: code,
    ticker: code,
    name: label,
    exchange,
    mic,
    currency: "JPY",
    type,
    raw: [code, label, exchange, note, type].filter(Boolean).join(" "),
    isin: "",
  };
}

// ---- JASDEC ----------------------------------------------------------------

// Codes JASDEC does not hold (8301, Bank of Japan). The table also lists
// codes a broker refuses for its own reasons; those come back separately.
export async function jasdecTable() {
  const html = await request(JASDEC, {}, "shift_jis");
  const notHeld = new Set();
  const other = new Map();
  for (const match of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells = [...match[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => textOf(cell[1]));
    if (cells.length < 3) continue;
    const code = jpCode(cells[0]);
    if (!code) continue;
    if (cells[2].includes("保管振替")) notHeld.add(code);
    else other.set(code, cells[1]);
  }
  if (!notHeld.has("8301")) throw new Error(`JASDEC table did not list 8301 (${[...notHeld].join(", ")})`);
  return { notHeld, other };
}

// ---- Tokyo -----------------------------------------------------------------

export async function tokyoRows() {
  const page = await request(JPX_PAGE);
  const link = page.match(/href="([^"]*data_j\.xlsx?)"/)?.[1];
  if (!link) throw new Error("JPX page did not link data_j.xlsx");
  const grid = xlsxRows(await request(new URL(decodeEntities(link), JPX_PAGE).href, {}, "bytes"), "JPX list");
  if (grid[0]?.[1] !== "コード" || grid[0]?.[2] !== "銘柄名" || grid[0]?.[3] !== "市場・商品区分") {
    throw new Error(`JPX header moved: ${grid[0]}`);
  }
  const asOf = clean(grid[1]?.[0]);
  const rows = [];
  const unknown = new Set();
  const skipped = new Map();
  for (const line of grid.slice(1)) {
    const code = jpCode(line[1]);
    const section = clean(line[3]);
    if (!code || !section) continue;
    if (!(section in TOKYO_SECTION)) { unknown.add(section); continue; }
    let type = TOKYO_SECTION[section];
    if (!type) { skipped.set(`Tokyo ${section}`, (skipped.get(`Tokyo ${section}`) || 0) + 1); continue; }
    const name = clean(String(line[2]).normalize("NFKC"));
    if (type === "ETF" && /ETN/i.test(name)) type = "ETN";
    rows.push(jpRow({ code, name, place: "Tokyo", type, note: section }));
  }
  if (unknown.size) throw new Error(`JPX section not classified: ${[...unknown].join(", ")}`);
  if (rows.length < 3500) throw new Error(`JPX list gave ${rows.length} lines`);
  return { rows, asOf, skipped };
}

// ---- Nagoya ----------------------------------------------------------------

const NAGOYA_SECTION = { 1: "Premier", 2: "Main", 3: "Next" };

export async function nagoyaRows() {
  const rows = [];
  let page = 1;
  let total = Infinity;
  while (rows.length < total && page < 30) {
    const url = new URL(NAGOYA);
    for (const division of Object.keys(NAGOYA_SECTION)) url.searchParams.append("listedDivision[]", division);
    url.searchParams.set("dispType", "stockCode");
    url.searchParams.set("dispOrder", "ASC");
    url.searchParams.set("dispCount", "100");
    url.searchParams.set("dispPage", String(page));
    const data = JSON.parse(await request(url.href));
    total = Number(data.list?.[0]?.listTotal || 0);
    const batch = data.stock || [];
    if (!batch.length) break;
    for (const item of batch) {
      const code = nagoyaCode(item.stockCode);
      const section = NAGOYA_SECTION[item.listedDivision];
      if (!code || !section) throw new Error(`Nagoya line not read: ${JSON.stringify(item).slice(0, 200)}`);
      rows.push(jpRow({ code, name: item.stockName_j, place: "Nagoya", type: "STOCK", note: section }));
    }
    page += 1;
  }
  if (!total || rows.length !== total) throw new Error(`Nagoya search announced ${total} and returned ${rows.length}`);
  return rows;
}

// ---- Fukuoka ---------------------------------------------------------------

// Every Fukuoka listing, main market and Q-Board, read industry by industry.
// A listed fund that turns up in the company search is not a company and is
// left out.
export async function fukuokaAllRows() {
  const rows = [];
  const seen = new Set();
  for (let industry = 1; industry <= 33; industry += 1) {
    const body = new URLSearchParams({ kensaku: "search", cop_code: "", meigara: "", yomigana: "", cop_inbustry: String(industry) });
    const html = await request(FUKUOKA_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: FUKUOKA_SEARCH },
      body,
    });
    for (const table of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
      const cells = [...table[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => textOf(cell[1]));
      const codeAt = cells.indexOf("コード");
      const marketAt = cells.indexOf("市場区分");
      const nameAt = cells.indexOf("銘柄名");
      if (codeAt < 0 || marketAt < 0 || nameAt < 0) continue;
      const code = jpCode(cells[codeAt + 1]);
      const market = cells[marketAt + 1];
      const name = cells[nameAt + 1];
      if (!code || !market || seen.has(code)) continue;
      if (/PRO/i.test(market) || /上場投信|受益証券/.test(name)) continue;
      if (market !== "本則" && market !== "Q-Board") throw new Error(`Fukuoka has an unread section: ${market}`);
      seen.add(code);
      rows.push(jpRow({ code, name, place: "Fukuoka", type: "STOCK", note: market }));
    }
  }
  if (rows.length < 50) throw new Error(`Fukuoka search returned ${rows.length} codes`);
  return rows;
}

// Only the names listed on Fukuoka alone.
export async function fukuokaSoleRows() {
  const html = await request(FUKUOKA_SOLE);
  const rows = [];
  for (const table of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const cells = [...table[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => textOf(cell[1]));
    const codeAt = cells.indexOf("コード");
    const marketAt = cells.indexOf("市場区分");
    if (codeAt < 0 || marketAt < 0 || cells.indexOf("会社名") < 0) continue;
    const code = jpCode(cells[codeAt + 1]);
    const market = cells[marketAt + 1];
    const nameCell = table[0].match(/<th>\s*会社名\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    const alt = nameCell?.[1].match(/alt="([^"]*)"/i);
    const name = textOf(alt?.[1] || nameCell?.[1] || "");
    if (!code || !market || /PRO/i.test(market)) continue;
    if (market !== "本則" && market !== "Q-Board") throw new Error(`Fukuoka sole list has an unread section: ${market}`);
    rows.push(jpRow({ code, name, place: "Fukuoka", type: "STOCK", note: `${market} sole listing` }));
  }
  if (!rows.length) throw new Error("Fukuoka sole-listing page returned no code");
  return rows;
}

// ---- ISIN ------------------------------------------------------------------

const JP_FILE = ["TSE", "NAG", "FSE", "SAPSE", "TYO"];
const US_FILE = ["NASDAQ", "NYSE", "AMEX", "CBOE"];

let cachedIndex;
function isinIndex() {
  if (cachedIndex) return cachedIndex;
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const fund = file === ETFS;
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    if (table[0]?.slice(0, 3).join(",") !== "ticker,exchange,isin") throw new Error(`${file.pathname} header ${table[0]}`);
    for (const [ticker, place, isin, name] of table.slice(1)) {
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin || "")) continue;
      const code = ticker.split(":").pop().toUpperCase();
      if (!index.has(code)) index.set(code, new Map());
      const byPlace = index.get(code);
      if (!byPlace.has(place)) byPlace.set(place, new Map());
      byPlace.get(place).set(isin, { name: clean(name), fund });
    }
  }
  cachedIndex = index;
  return index;
}

// The US place the asset files give a ticker: { mic, fund } or null when
// they give none or more than one.
export function usPlaceOf(ticker) {
  const byPlace = isinIndex().get(String(ticker).toUpperCase().replace(/[/ ]+/g, "."));
  const found = [];
  for (const place of US_FILE) {
    for (const { fund } of byPlace?.get(place)?.values() || []) {
      const mic = { NASDAQ: "XNAS", NYSE: "XNYS", CBOE: "BATS", AMEX: fund ? "ARCX" : "XASE" }[place];
      if (!found.some((item) => item.mic === mic)) found.push({ mic, fund });
    }
  }
  return found.length === 1 ? found[0] : null;
}

// Fills isin (and query) when the code has exactly one ISIN on the places
// the row belongs to; several stay on the row as `matches` (isinMatches.mjs).
// A US row looks only at the asset file of its own place.
const US_FILE_OF = { XNAS: ["NASDAQ"], XNYS: ["NYSE"], ARCX: ["AMEX"], XASE: ["AMEX"], BATS: ["CBOE"] };

export function attachIsins(rows) {
  const index = isinIndex();
  const tally = { one: 0, none: 0, several: 0 };
  for (const row of rows) {
    const places = row.currency === "JPY" ? JP_FILE : US_FILE_OF[row.mic] || US_FILE;
    const byPlace = index.get(String(row.ticker).toUpperCase().replace(/[/ ]+/g, "."));
    const groups = new Map();
    for (const place of places) {
      const ids = byPlace?.get(place);
      if (ids?.size) groups.set(place, [...ids.keys()]);
    }
    const isin = stampIsinMatches(row, groups, row.ticker);
    if (isin) {
      row.isin = isin;
      row.query = isin;
      tally.one += 1;
    } else if (row.matches) tally.several += 1;
    else tally.none += 1;
  }
  return tally;
}

// "exchange mic currency type" -> count, for the closing report.
export function tally(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.exchange} ${row.currency} ${row.type}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort().map(([key, count]) => `  ${key}: ${count}`).join("\n");
}
