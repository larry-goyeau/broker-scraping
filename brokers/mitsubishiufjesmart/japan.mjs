// Shared reading for the Japanese brokers in mitsubishiufjesmart,
// mitsubishiufjmorgan, daiwaconnect and cheer. Each scraper decides which
// classes it keeps; this file only reads the public sources the same way
// brokers/matsui/matsui_scraping.mjs does.
//
// Tokyo is the JPX month-end file (data_j.xlsx) linked on the statistics
// page, one line per code with its 市場・商品区分. The ETF list page gives
// each fund's manager. Nagoya Premier, Main and Next are the exchange
// search. Fukuoka and Sapporo are the names their own pages list as sole
// listings; PRO markets stay out. The JASDEC non-handled list is the table
// on the Japan Transnational Group page that Rakuten's scraper also reads.
//
// The US join prints no venue in these brokers' files, so the code is
// looked up in ../../assets/stocks.csv and etfs.csv on NYSE, Nasdaq, AMEX
// and Cboe, as brokers/zad does. AMEX there is NYSE Arca for an ETF and
// NYSE American for a share.
//
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   https://www.jpx.co.jp/equities/products/etfs/issues/01.html
//   https://www.nse.or.jp/api/stock/search.json
//   https://www.fse.or.jp/market-info/single-listings/
//   https://www.sse.or.jp/listing/list
//   https://www.jtg-sec.co.jp/meigara/no_handling.htm

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const JPX_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";
const ETF_PAGE = "https://www.jpx.co.jp/equities/products/etfs/issues/01.html";
const NAGOYA = "https://www.nse.or.jp/api/stock/search.json";
const FUKUOKA = "https://www.fse.or.jp/market-info/single-listings/";
const SAPPORO = "https://www.sse.or.jp/listing/list";
const JASDEC = "https://www.jtg-sec.co.jp/meigara/no_handling.htm";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

export const MIC = { Tokyo: "XTKS", Nagoya: "XNGO", Fukuoka: "XFKA", Sapporo: "XSAP", HKEX: "XHKG" };
const JP_FILE = ["TSE", "NAG", "FSE", "SAPSE", "TYO"];
const JAPAN = new Set(["Tokyo", "Nagoya", "Fukuoka", "Sapporo"]);
const US_FILE = { NYSE: "XNYS", NASDAQ: "XNAS", AMEX: "XASE", CBOE: "BATS" };
const NAGOYA_SECTION = { 1: "Premier", 2: "Main", 3: "Next" };

// Section names of the JPX file. A section the file adds later stops the run.
export const TOKYO_SECTIONS = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
  "プライム（外国株式）",
  "スタンダード（外国株式）",
  "グロース（外国株式）",
  "出資証券",
  "ETF・ETN",
  "PRO Market",
  "REIT・ベンチャーファンド・カントリーファンド・インフラファンド",
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

export function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Full-width letters and digits to ASCII.
export function fold(value) {
  return normalize(value)
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

export function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function textOf(html) {
  return normalize(decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " ")));
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

export async function fetchBytes(url, headers = {}) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, ...headers },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${url} answered ${response.status}`;
      if (response.status === 403 || response.status === 404) break;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(last);
}

export async function fetchText(url, encoding = "utf-8", headers = {}) {
  const bytes = await fetchBytes(url, headers);
  return new TextDecoder(encoding).decode(bytes).replace(/^﻿/, "");
}

function workbookRows(bytes) {
  const run = spawnSync("python3", ["-c", XLSX_TO_JSON], { input: bytes, maxBuffer: 32_000_000 });
  if (run.status !== 0) throw new Error(run.stderr.toString() || "the JPX workbook could not be read");
  return JSON.parse(run.stdout.toString());
}

export function jpCode(value) {
  const text = fold(value).replace(/\.0$/, "").toUpperCase();
  return /^[0-9]{4}[0-9A-Z]?$|^[0-9]{3}[A-Z]$/.test(text) ? text : "";
}

// Every line of the JPX month-end file: { code, name, section }.
export async function tokyoListing() {
  const html = await fetchText(JPX_PAGE);
  const link = [...html.matchAll(/href="([^"]*data_j\.xlsx[^"]*)"/gi)].map((match) =>
    new URL(decodeEntities(match[1]), JPX_PAGE).href
  )[0];
  if (!link) throw new Error("JPX statistics page did not link data_j.xlsx");
  const grid = workbookRows(await fetchBytes(link));
  const header = grid[0]?.map(normalize);
  if (header?.[1] !== "コード" || header?.[2] !== "銘柄名" || header?.[3] !== "市場・商品区分") {
    throw new Error(`JPX header is ${(header || []).join(", ")}`);
  }
  const lines = [];
  const unknown = new Map();
  for (const line of grid.slice(1)) {
    const code = jpCode(line[1]);
    const name = normalize(line[2]);
    const section = normalize(line[3]);
    if (!code || !section) continue;
    if (!TOKYO_SECTIONS.has(section)) unknown.set(section, (unknown.get(section) || 0) + 1);
    lines.push({ code, name, section });
  }
  if (unknown.size) {
    throw new Error(`JPX section not known: ${[...unknown].map(([section, count]) => `${count} ${section}`).join(", ")}`);
  }
  if (lines.length < 4000) throw new Error(`JPX file has only ${lines.length} lines`);
  return lines;
}

// Code -> manager, from the JPX ETF list page.
export async function etfManagers() {
  const html = await fetchText(ETF_PAGE);
  const managers = new Map();
  for (const match of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells = [...match[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textOf(cell[1]));
    const at = cells.findIndex((cell) => /^[0-9]{3}[0-9A-Z]$/.test(cell));
    if (at < 0) continue;
    const manager = cells.slice(at + 1).find((cell) => /\(\d{5}\)$/.test(cell));
    if (manager) managers.set(cells[at], manager.replace(/\s*\(\d{5}\)$/, ""));
  }
  if (managers.size < 300) throw new Error(`JPX ETF page named ${managers.size} managers`);
  return managers;
}

// A manager that is not a Japanese company: the fund is a foreign ETF
// (WisdomTree Jersey, State Street, World Gold Trust).
export function foreignManager(manager) {
  return /ジャージー|カンパニー|リミテッド|エルエルシー|インク|LLC|Limited|Ltd|Inc\b|Company/i.test(manager || "");
}

export async function jasdecRefused() {
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

function nagoyaCode(value) {
  const text = normalize(value).toUpperCase();
  const ordinary = text.match(/^([0-9]{4}|[0-9]{3}[A-Z])0$/);
  return ordinary ? ordinary[1] : jpCode(text);
}

// Nagoya Premier, Main and Next: { code, name, section }.
export async function nagoyaListing() {
  const lines = [];
  let page = 1;
  let total = Infinity;
  while (lines.length < total && page < 30) {
    const url = new URL(NAGOYA);
    for (const division of ["1", "2", "3"]) url.searchParams.append("listedDivision[]", division);
    url.searchParams.set("dispType", "stockCode");
    url.searchParams.set("dispOrder", "ASC");
    url.searchParams.set("dispCount", "100");
    url.searchParams.set("dispPage", String(page));
    const data = JSON.parse((await fetchBytes(url.href)).toString("utf8"));
    total = Number(data.list?.[0]?.listTotal || 0);
    const batch = data.stock || [];
    if (!batch.length) break;
    for (const item of batch) {
      const code = nagoyaCode(item.stockCode);
      const section = NAGOYA_SECTION[item.listedDivision];
      if (!code || !section) throw new Error(`Nagoya line not read: ${item.stockCode} ${item.listedDivision}`);
      lines.push({ code, name: normalize(item.stockName_j), section });
    }
    page += 1;
  }
  if (lines.length !== total) throw new Error(`Nagoya search announced ${total} and returned ${lines.length}`);
  if (lines.length < 150) throw new Error(`Nagoya search returned only ${lines.length}`);
  return lines;
}

// Fukuoka sole listings, main board and Q-Board. PRO stays out.
export async function fukuokaSole() {
  const html = await fetchText(FUKUOKA);
  const lines = [];
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
    lines.push({ code, name, section: market });
  }
  if (lines.length < 5) throw new Error(`Fukuoka sole-listing page returned ${lines.length} codes`);
  return lines;
}

// Sapporo sole listings, main board and Ambitious. PRO stays out.
export async function sapporoSole() {
  const html = await fetchText(SAPPORO);
  const lines = [];
  for (const part of html.split(/<h5>/i).slice(1)) {
    const title = textOf(part.split(/<\/h5>/i)[0]);
    if (!title.startsWith("単独上場会社") || /PRO/i.test(title)) continue;
    const label = title.replace(/^単独上場会社\s*[-－]\s*/, "");
    for (const block of part.matchAll(/<dt>\s*([0-9A-Za-z]+)\s*<\/dt>([\s\S]*?)<\/dl>/gi)) {
      const code = jpCode(block[1]);
      if (!code) continue;
      const alt = block[2].match(/alt="([^"]*)"/i);
      lines.push({ code, name: textOf(alt?.[1] || ""), section: label });
    }
  }
  if (lines.length < 5) throw new Error(`Sapporo sole-listing sections returned ${lines.length} codes`);
  return lines;
}

export function jpRow({ code, name, exchange, type, section }) {
  return {
    query: code,
    ticker: code,
    name: normalize(name) || code,
    exchange,
    mic: MIC[exchange],
    currency: "JPY",
    type,
    isin: "",
    raw: [code, normalize(name), exchange, section, type].filter(Boolean).join(" "),
  };
}

function assetTable() {
  const tables = [];
  for (const [file, type] of [[STOCKS, "STOCK"], [ETFS, "ETF"]]) {
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
      tables.push({ code, exchange, isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "", type });
    }
  }
  return tables;
}

let assets;
function assetIndex() {
  if (assets) return assets;
  assets = new Map();
  for (const line of assetTable()) {
    if (!line.code) continue;
    if (!assets.has(line.code)) assets.set(line.code, []);
    assets.get(line.code).push(line);
  }
  return assets;
}

// Catalogue spellings of a US code: BRK.B, BRK/B and BRK-B are one line.
function usSpellings(symbol) {
  const out = new Set([symbol]);
  for (const sep of [".", "/", "-", " "]) {
    if (symbol.includes(sep)) for (const other of [".", "/", "-"]) out.add(symbol.split(sep).join(other));
  }
  return [...out];
}

// A US code with no venue in the broker's file. The venue, ISIN and (when
// the broker does not say) the type come from the asset lists.
// `type` is the broker's own word when it has one.
export function usRow({ symbol, name, type, note }) {
  const code = normalize(symbol).toUpperCase();
  const index = assetIndex();
  const all = usSpellings(code).flatMap((spelling) => index.get(spelling) || []);
  const listed = all.filter((hit) => US_FILE[hit.exchange]);
  const otc = all.filter((hit) => hit.exchange === "OTC");
  const etfName = /\b(ETF|ETN)\b|exchange[- ]traded/i.test(name || "");
  const kind = type || (listed.some((hit) => hit.type === "ETF") ? "ETF" : !listed.length && etfName ? "ETF" : "STOCK");
  // Prefer the listing that matches the broker's type, then any listing.
  const pick = listed.filter((hit) => (kind === "STOCK") === (hit.type === "STOCK"));
  const hits = pick.length ? pick : listed;
  let exchange = "US";
  let mic;
  if (hits.length) {
    const venues = [...new Set(hits.map((hit) => hit.exchange))];
    const venue = venues[0];
    mic = venue === "AMEX" ? (kind === "STOCK" ? "XASE" : "ARCX") : US_FILE[venue];
    exchange = mic;
  } else if (otc.length) {
    exchange = "OTC";
    mic = "OTCM";
  }
  const same = hits.length ? hits.filter((hit) => hit.exchange === hits[0].exchange) : otc;
  const isins = [...new Set(same.map((hit) => hit.isin).filter(Boolean))];
  const row = {
    query: code,
    ticker: code,
    name: normalize(name) || code,
    exchange,
    ...(mic ? { mic } : {}),
    currency: "USD",
    type: kind,
    isin: "",
    raw: [code, normalize(name), note, kind].filter(Boolean).join(" "),
  };
  if (isins.length === 1) {
    row.isin = isins[0];
    row.query = isins[0];
  } else if (isins.length > 1) {
    stampIsinMatches(row, new Map([[hits[0]?.exchange || "OTC", isins]]), code);
  }
  return row;
}

// Hong Kong code (no leading zeros) joined to the HKEX lines of the lists.
export function hkRow({ code, name, type, note }) {
  const ticker = String(Number(normalize(code)));
  const hits = (assetIndex().get(ticker) || []).filter((hit) => hit.exchange === "HKEX");
  const isins = [...new Set(hits.map((hit) => hit.isin).filter(Boolean))];
  const row = {
    query: ticker,
    ticker,
    name: normalize(name) || ticker,
    exchange: "HKEX",
    mic: "XHKG",
    currency: "HKD",
    type,
    isin: "",
    raw: [ticker, normalize(name), note, type].filter(Boolean).join(" "),
  };
  if (isins.length === 1) {
    row.isin = isins[0];
    row.query = isins[0];
  } else if (isins.length > 1) stampIsinMatches(row, new Map([["HKEX", isins]]), ticker);
  return row;
}

// A Japanese code is the same security on all four exchanges, so the ISIN
// is joined across the Tokyo, Nagoya, Fukuoka and Sapporo columns.
export function attachJapanIsins(rows) {
  const index = assetIndex();
  for (const row of rows) {
    if (!JAPAN.has(row.exchange)) continue;
    const groups = new Map();
    for (const hit of index.get(row.ticker) || []) {
      if (!JP_FILE.includes(hit.exchange) || !hit.isin) continue;
      if (!groups.has(hit.exchange)) groups.set(hit.exchange, new Set());
      groups.get(hit.exchange).add(hit.isin);
    }
    const found = new Set();
    for (const ids of groups.values()) for (const isin of ids) found.add(isin);
    if (found.size === 1) {
      row.isin = [...found][0];
      row.query = row.isin;
    } else if (found.size > 1) stampIsinMatches(row, groups, row.ticker);
  }
}

// Dedupe on (exchange, ticker), sort, write, and print counts. `floors` is
// { "exchange type": minimum } and stops the run on a short read.
export function writeCatalogue(folderUrl, file, rows, floors = {}) {
  const seen = new Set();
  const kept = [];
  for (const row of rows) {
    const key = `${row.exchange}|${row.ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  kept.sort(
    (left, right) =>
      String(left.exchange).localeCompare(right.exchange) || String(left.ticker).localeCompare(right.ticker)
  );
  const counts = {};
  for (const row of kept) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
  for (const [label, floor] of Object.entries(floors)) {
    const have = Object.entries(counts)
      .filter(([key]) => key === label || key.startsWith(`${label} `) || key.endsWith(` ${label}`))
      .reduce((sum, [, count]) => sum + count, 0);
    if (have < floor) throw new Error(`${label}: ${have} rows, expected at least ${floor}`);
  }
  const output = stampRows(withoutObligations(kept));
  fs.writeFileSync(new URL(file, folderUrl), JSON.stringify(output, null, 2));
  const withIsin = output.filter((row) => row.isin).length;
  const several = output.filter((row) => row.matches).length;
  console.error(Object.entries(counts).map(([label, count]) => `${count} ${label}`).join(", "));
  console.error(
    `${output.length} rows written to ${file}. ISIN ${withIsin}, several ${several}, none ${output.length - withIsin - several}.`
  );
  return output;
}
