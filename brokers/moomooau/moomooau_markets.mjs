// Shared reader for the moomoo group's market lists, used by
// moomooau_scraping.mjs and ../moomoomy/moomoomy_scraping.mjs.
//
// The moomoo quote site (moomoo.com/au/quote and moomoo.com/my/quote both
// land on it) shows one "all stocks" list per market. It is the group's
// list of what is quoted on the exchange, the same one brokers/futuhk reads,
// backed by a public JSON endpoint signed with a quote-token header:
//
//   https://www.moomoo.com/quote/au/stock-list/all-au-stocks
//   https://www.moomoo.com/quote-api/quote-v2/get-stock-list?marketType=22&plateType=1&rankType=3&page=0&pageSize=50
//
// Each market keeps stocks, ETFs and REITs (instrumentType 3, 4, 12; a
// REIT, a unit trust, is written FUND).
// Warrants, CBBCs, options, debt and indices are other types and stay out.
// The group lists also carry lines the exchange no longer quotes (delisted
// names, expired rights, matured bonds) and, on the ASX and the SGX, debt,
// options and other non-share lines typed as stocks. Each market is
// therefore checked against the exchange's own list of what it quotes:
//   ASX: AUD. Kept when the code is on the ASX list of listed companies
//     (one code per entity: its ordinary share or unit) or on the ETP list
//     of the ASX investment-products report (ETF, Active, Complex and SP,
//     the structured metal products; not the Index lines). Company
//     options, warrants and instalments, deferred-settlement lines,
//     hybrids, rights and delisted codes are on neither and stay out.
//     The report is monthly, so a line moomoo types as an ETF that it does
//     not have yet is kept when the ASX company page files it as a quoted
//     ETP (securityType 7, 16, 33 or 36) with a listing date. The company
//     list names an entity once, so a second ordinary class (NWSLV, News
//     Corp class A; SGLLV, Ricegrowers B class) is kept when the ASX
//     company page files that very code as an ordinary share
//     (securityType 1).
//       https://www.asx.com.au/asx/research/ASXListedCompanies.csv
//         ("ASX listed companies as at <date>", rebuilt daily)
//       https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report
//         (sheet "Spotlight ETP List": "Exchange Traded Product Summary")
//       https://asx.api.cmfyapp.com/asx-research/1.0/companies/VAS/header
//   Hong Kong: currency, category and ISIN from the HKEX list of
//     securities. A line HKEX files outside equity, ETPs and REITs, or that
//     HKEX does not list at all (a closed ETF such as 03011 or 03021, a
//     delisted share), stays out.
//       https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   US: kept when the Nasdaq Trader symbol directory places the symbol on
//     Nasdaq, the NYSE, NYSE American, NYSE Arca, Cboe BZX or NYSE Texas
//     (one NBBO market), on the exchange the directory names. In --live mode a symbol the directory does not have is kept
//     as an OTC Markets line: both entities' help pages list OTC Markets
//     among the US markets. The lines copied from futuhk are futuhk's
//     exchange lines, so there a symbol the directory does not have
//     (delisted since futuhk ran) stays out.
//       https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//       https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//   Bursa Malaysia: MYR. LEAP Market lines (codes 03xxx, and their
//     03xxxP / 03xxxNN classes) stay out: the LEAP Market is closed to
//     retail clients. The SC's release of 18 May 2026 proposing LEAP
//     Market 2.0 describes it as a market "which currently caters
//     exclusively to sophisticated investors"; retail access is only a
//     proposal (consultation to 15 June 2026) and no effective date is
//     published. Bring LEAP back when retail access takes effect.
//       https://www.sc.com.my/resources/media/media-release/sc-and-bursa-malaysia-propose-leap-market-enhancements
//       https://www.moomoo.com/quote/my/stock-list/leap (the 03xxx codes)
//   Singapore: currency read from the name. Kept when the code is on the
//     SGX securities list (the feed behind sgx.com's securities prices
//     page), filed as a share, ETF, REIT, business trust, depositary
//     receipt, leveraged product, preference share or other equity line.
//     Singapore Government Securities and retail bonds are debt and stay
//     out; matured bonds and notes, expired rights, lapsed structured
//     products and delisted names are not on the list and stay out.
//       https://api.sgx.com/securities/v1.1?params=nc,n,type
//   China A: the HKEX China Connect lists, names eligible for buy and
//     sell; ChiNext and STAR carry the professional-investor remark.
//
// The endpoint blocks an address for hours after a few dozen calls
// ("403 - Operations too frequent"). So by default only the entity's home
// market (ASX, Bursa) is read live, slowly. The US, Hong Kong and Singapore
// lists are the same group lists brokers/futuhk reads from this endpoint:
// they are taken from ../futuhk/futuhk-parsed.json (run futuhk first), with
// the same filters as above, except that futuhk leaves Cboe BZX listings
// out. --live reads those three markets from the endpoint as well.

import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const LIST = "https://www.moomoo.com/quote-api/quote-v2/get-stock-list";
const REFERER = "https://www.moomoo.com/quote";
const NASDAQ = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const HKEX = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx";
const ASX_COMPANIES = "https://www.asx.com.au/asx/research/ASXListedCompanies.csv";
const ASX_PRODUCTS = "https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report.html";
const ASX_HEADER = "https://asx.api.cmfyapp.com/asx-research/1.0/companies/";
const SGX = "https://api.sgx.com/securities/v1.1?params=nc,n,type";
const CONNECT = [
  ["https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SSE_Securities.xls", "Shanghai Stock Exchange", "XSHG"],
  ["https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SZSE_Securities.xls", "Shenzhen Stock Exchange", "XSHE"],
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// The endpoint serves at most 50 lines a page. Calls are spaced out: a
// burst earns an "Operations too frequent" block that lasts hours, so a
// blocked call waits ten minutes and tries again.
const PAGE_SIZE = 50;
const GAP = 8000;

export const MARKET = { HK: 1, US: 2, SG: 15, AU: 22, MY: 27 };

const US_EXCHANGE = {
  Q: { exchange: "Nasdaq", mic: "XNAS" },
  N: { exchange: "New York Stock Exchange", mic: "XNYS" },
  A: { exchange: "NYSE American", mic: "XASE" },
  P: { exchange: "NYSE Arca", mic: "ARCX" },
  Z: { exchange: "Cboe BZX", mic: "BATS" },
  F: { exchange: "NYSE Texas", mic: "XCHI" },
};
const HK_KEEP = new Set(["Equity", "Exchange Traded Products", "Real Estate Investment Trusts"]);
// ETP list "Type" values kept (the "Index" lines are benchmark rows) and
// the ASX company-page securityType of a quoted ETP: 7 ETF, 16 structured
// product (GOLD), 33 CDI-quoted ETF, 36 active ETF in units.
const ASX_ETP_KEEP = new Set(["ETF", "Active", "Complex", "SP"]);
const ASX_ETP_TYPES = new Set([7, 16, 33, 36]);
// SGX securities-list types kept; sgsbonds and retailbonds are debt, and
// warrants and certificates are not in moomoo's stock lists.
const SG_KEEP = new Set(["stocks", "etfs", "reits", "businesstrusts", "adrs", "liprod", "retailpreferenceshares", "others"]);
const SG_DEBT = new Set(["sgsbonds", "retailbonds"]);
const LEAP = /^03\d{3}/;

export function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quoteToken(params) {
  const body = JSON.stringify(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])));
  const hex = createHmac("sha512", "quote_web").update(body).digest("hex");
  return createHash("sha256").update(hex.slice(0, 10)).digest("hex").slice(0, 10);
}

let lastCall = 0;

async function fetchJson(params) {
  const target = new URL(LIST);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  let last = "";
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const wait = Math.max(0, lastCall + GAP - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    try {
      const response = await fetch(target, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: REFERER, "quote-token": quoteToken(params) },
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      last = text.slice(0, 160);
      if (text.startsWith("{")) {
        const payload = JSON.parse(text);
        if (payload.code === 0) return payload;
      }
    } catch (error) {
      last = String(error.message || error);
    }
    // "403 - Operations too frequent" is an HTML page: back off.
    console.error(`moomoo market ${params.marketType} page ${params.page}: no JSON, waiting`);
    await sleep(600_000);
  }
  throw new Error(`moomoo list did not answer: ${last}`);
}

async function fetchBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// Every line of one market list, checked against the announced total.
export async function stockList(marketType) {
  const query = (page) => ({ marketType, plateType: 1, rankType: 3, page, pageSize: PAGE_SIZE });
  const first = await fetchJson(query(0));
  const announced = first.data?.pagination?.total;
  const pages = first.data?.pagination?.pageCount;
  if (!Number.isInteger(announced) || announced < 1 || !Number.isInteger(pages)) throw new Error(`market ${marketType} has no total`);
  const rows = [...(first.data.list || [])];
  for (let page = 1; page < pages; page += 1) {
    rows.push(...((await fetchJson(query(page))).data?.list || []));
    if ((page + 1) % 25 === 0) console.error(`market ${marketType}: page ${page + 1} of ${pages}`);
  }
  const seen = new Map();
  for (const row of rows) seen.set(normalize(row.stockCode).toUpperCase(), row);
  if (seen.size !== announced) throw new Error(`market ${marketType} announced ${announced} and returned ${seen.size}`);
  return [...seen.values()];
}

export function kindOf(instrumentType) {
  if (instrumentType === 3) return "STOCK";
  if (instrumentType === 4) return "ETF";
  if (instrumentType === 12) return "FUND";
  return "";
}

function columnIndex(ref) {
  let n = 0;
  for (const char of ref) {
    if (!/[A-Z]/i.test(char)) break;
    n = n * 26 + char.toUpperCase().charCodeAt(0) - 64;
  }
  return n - 1;
}

// The files of a zip archive, located through its central directory.
function zipFiles(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip archive");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("broken zip directory");
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const stored = bytes.subarray(start, start + compressed);
    files.set(name, method === 0 ? stored : inflateRawSync(stored));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

// The rows of one worksheet: the first sheet, or the sheet named.
function xlsxRows(bytes, sheetName = "") {
  const files = zipFiles(bytes);
  const tag = "(?:[a-z0-9]+:)?";
  const shared = [];
  const sharedXml = files.get("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const item of sharedXml.toString("utf8").matchAll(new RegExp(`<${tag}si\\b[^>]*>([\\s\\S]*?)</${tag}si>`, "g"))) {
      shared.push([...item[1].matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((node) => node[1]).join(""));
    }
  }
  let sheetPath = "xl/worksheets/sheet1.xml";
  if (sheetName) {
    const workbook = files.get("xl/workbook.xml")?.toString("utf8") || "";
    const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
    const entry = [...workbook.matchAll(new RegExp(`<${tag}sheet\\b[^>]*>`, "g"))].find((node) => unescapeXml(node[0].match(/\bname="([^"]*)"/)?.[1] || "") === sheetName);
    const id = entry?.[0].match(/\br:id="([^"]+)"/)?.[1];
    const rel = id && [...rels.matchAll(/<Relationship\b[^>]*>/g)].find((node) => node[0].includes(`Id="${id}"`));
    const target = rel?.[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (!target) throw new Error(`the workbook has no sheet "${sheetName}"`);
    sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  const sheet = files.get(sheetPath);
  if (!sheet) throw new Error(`the workbook has no ${sheetPath}`);
  const rows = [];
  for (const row of sheet.toString("utf8").matchAll(new RegExp(`<${tag}row\\b[^>]*>([\\s\\S]*?)</${tag}row>`, "g"))) {
    const values = {};
    // A self-closing (empty) cell is taken on its own, or it would swallow
    // the next cell.
    for (const cell of row[1].matchAll(new RegExp(`<${tag}c\\b([^>]*?)/>|<${tag}c\\b([^>]*)>([\\s\\S]*?)</${tag}c>`, "g"))) {
      if (cell[3] === undefined) continue;
      const attrs = cell[2];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/i)?.[1] || "A";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
      const inline = [...cell[3].matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((node) => node[1]).join("");
      const raw = cell[3].match(new RegExp(`<${tag}v>([\\s\\S]*?)</${tag}v>`))?.[1] ?? "";
      let value = raw;
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = inline;
      values[columnIndex(ref)] = unescapeXml(value);
    }
    if (!Object.keys(values).length) continue;
    const width = Math.max(...Object.keys(values).map(Number)) + 1;
    rows.push(Array.from({ length: width }, (_, index) => values[index] ?? ""));
  }
  return rows;
}

async function hkBook() {
  const table = xlsxRows(await fetchBytes(HKEX));
  const header = table.find((row) => row[0] === "Stock Code");
  if (!header) throw new Error("the HKEX list has no header");
  const currencyAt = header.indexOf("Trading Currency");
  const isinAt = header.indexOf("ISIN");
  const categoryAt = header.indexOf("Category");
  if (currencyAt < 0 || isinAt < 0 || categoryAt < 0) throw new Error("the HKEX list is missing a column");
  const book = new Map();
  for (const row of table) {
    const code = normalize(row[0]);
    if (!/^\d{5}$/.test(code)) continue;
    const isin = normalize(row[isinAt]).toUpperCase();
    const trading = normalize(row[currencyAt]).toUpperCase();
    book.set(code, {
      category: normalize(row[categoryAt]),
      currency: trading === "RMB" ? "CNH" : /^[A-Z]{3}$/.test(trading) ? trading : "",
      isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
    });
  }
  if (book.size < 1000) throw new Error(`the HKEX list has ${book.size} codes`);
  return book;
}

// The web copies of the symbol directory sit behind an Incapsula check that
// can answer Node with a challenge page; Nasdaq Trader's FTP server
// publishes the same files and is read with curl (Node has no FTP client).
async function directoryText(url, header) {
  try {
    const text = (await fetchBytes(url)).toString("utf8");
    if (text.startsWith(header)) return text;
  } catch {
    // fall back to FTP
  }
  const ftp = `ftp://ftp.nasdaqtrader.com/symboldirectory/${url.split("/").at(-1)}`;
  const run = spawnSync("curl", ["-s", "--max-time", "120", ftp], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (run.status === 0 && run.stdout.startsWith(header)) return run.stdout;
  throw new Error(`the symbol directory ${url} could not be read`);
}

async function usBook() {
  const nasdaqText = await directoryText(NASDAQ, "Symbol|Security Name|");
  const otherText = await directoryText(OTHER, "ACT Symbol|Security Name|");
  const book = new Map();
  const add = (symbol, place, etf) => {
    const code = normalize(symbol).toUpperCase();
    if (code && !code.includes(" ") && !book.has(code)) book.set(code, { ...place, etf });
  };
  for (const line of nasdaqText.split(/\r?\n/)) {
    if (!line.includes("|") || line.startsWith("Symbol") || line.startsWith("File")) continue;
    const cells = line.split("|");
    if (cells[3] === "Y") continue;
    add(cells[0], US_EXCHANGE.Q, cells[6] === "Y");
  }
  for (const line of otherText.split(/\r?\n/)) {
    if (!line.includes("|") || line.startsWith("ACT") || line.startsWith("File")) continue;
    const cells = line.split("|");
    if (cells[6] === "Y") continue;
    const place = US_EXCHANGE[cells[2]];
    if (!place) continue;
    add(cells[0], place, cells[4] === "Y");
    if (cells[7] && cells[7] !== cells[0]) add(cells[7], place, cells[4] === "Y");
  }
  if (book.size < 5000) throw new Error(`the symbol directory has ${book.size} names`);
  return book;
}

const MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// The ASX codes to keep: the listed companies and the quoted ETPs.
async function asxBook() {
  const companies = new Set();
  const csv = (await fetchBytes(ASX_COMPANIES)).toString("utf8");
  if (!/^ASX listed companies as at/i.test(csv.trim())) throw new Error("the ASX company list has an unexpected heading");
  for (const line of csv.split(/\r?\n/)) {
    const code = line.match(/^"(?:[^"]|"")*","([A-Z0-9]{3,6})"/)?.[1];
    if (code) companies.add(code);
  }
  if (companies.size < 1500) throw new Error(`the ASX company list has ${companies.size} codes`);

  const page = (await fetchBytes(ASX_PRODUCTS)).toString("utf8");
  let best = null;
  const pattern = /\/content\/dam\/asx\/issuers\/asx-investment-products-reports\/(\d{4})\/excel\/asx-investment-products-([a-z]+)-\d{4}-abs\.xlsx/g;
  for (const match of page.matchAll(pattern)) {
    const month = MONTH[match[2].slice(0, 3)];
    if (!month) continue;
    const rank = Number(match[1]) * 12 + month;
    if (!best || rank > best.rank) best = { rank, url: `https://www.asx.com.au${match[0]}` };
  }
  if (!best) throw new Error("the ASX investment-products page links no workbook");
  const table = xlsxRows(await fetchBytes(best.url), "Spotlight ETP List");
  const header = table.findIndex((row) => /^ASX\s*Code$/i.test(normalize(row[1])) && normalize(row[2]) === "Type");
  if (header < 0) throw new Error("the ASX ETP list has no header");
  const products = new Set();
  for (const row of table.slice(header + 1)) {
    const code = normalize(row[1]).toUpperCase();
    if (/^[A-Z0-9]{3,6}$/.test(code) && ASX_ETP_KEEP.has(normalize(row[2]))) products.add(code);
  }
  if (products.size < 400) throw new Error(`the ASX ETP list has ${products.size} codes`);
  return { companies, products, report: best.url };
}

// The ASX company page of one code, or null when the ASX has no such code.
async function asxHeader(code) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sleep(1000);
    try {
      const response = await fetch(`${ASX_HEADER}${encodeURIComponent(code)}/header`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 400 || response.status === 404) return null;
      if (!response.ok) continue;
      const data = (await response.json())?.data;
      return data && data.symbol === code ? data : null;
    } catch {
      // try again
    }
  }
  return null;
}

// A second ordinary class of a listed company, such as NWSLV (News Corp
// class A) or SGLLV (Ricegrowers B class): the company list names the
// entity once, under its first code. Asked only for a listed company's
// code plus a suffix that is not one of the ASX's option, deferred-
// settlement, preference, rights, warrant/instalment or partly-paid
// markers (4th character O, D, P, R, W, K, J, S, X, Y, Z, I, H, C).
function shareClass(asx, code) {
  return code.length === 5 && asx.companies.has(code.slice(0, 3)) && !/[ODPRWKJSXYZIHC]/.test(code[3]);
}

// Kept when the ASX company page files that very code as an ordinary
// share (securityType 1).
async function asxOrdinaryClass(code) {
  return (await asxHeader(code))?.securityType === 1;
}

// A line moomoo types as an ETF that the monthly report does not carry yet:
// kept when the ASX company page files it as a quoted ETP.
async function asxQuotedEtp(code) {
  const data = await asxHeader(code);
  return Boolean(data && ASX_ETP_TYPES.has(data.securityType) && data.dateListed);
}

// SGX code -> the security types SGX files it under.
async function sgxBook() {
  const payload = JSON.parse((await fetchBytes(SGX)).toString("utf8"));
  const book = new Map();
  for (const item of payload?.data?.prices || []) {
    const code = normalize(item.nc).toUpperCase();
    if (!code) continue;
    if (!book.has(code)) book.set(code, new Set());
    book.get(code).add(normalize(item.type));
  }
  if (book.size < 1000) throw new Error(`the SGX securities list has ${book.size} codes`);
  return book;
}

// Why a Singapore line stays out, or "" when it is kept.
function sgOut(book, code) {
  const types = book.get(code);
  if (!types) return "SG not on the SGX list";
  if ([...types].some((type) => SG_KEEP.has(type))) return "";
  if ([...types].some((type) => SG_DEBT.has(type))) return "SG bond";
  return "SG other SGX type";
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

function rowOf({ ticker, name, exchange, mic, currency, type, isin = "", remark = "", source }) {
  const code = normalize(ticker).toUpperCase();
  if (!code || !exchange || !currency || !type) throw new Error(`incomplete row ${code} ${exchange} ${currency} ${type}`);
  const row = {
    query: isin || code,
    ticker: code,
    name: normalize(name) || code,
    exchange,
    mic,
    currency,
    type,
    isin,
    raw: [code, normalize(name), source, currency, type].filter(Boolean).join(" | "),
  };
  if (remark) row.remark = remark;
  return row;
}

function connectRemark(exchange, ticker, type) {
  if (type !== "STOCK") return "";
  if (exchange === "Shenzhen Stock Exchange" && /^30[0-2]/.test(ticker)) return "ChiNext via Connect is for professional investors only.";
  if (exchange === "Shanghai Stock Exchange" && /^68[89]/.test(ticker)) return "STAR Market via Connect is for professional investors only.";
  return "";
}

async function connectRows() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moomoo-connect-"));
  const files = [];
  for (const [url, exchange, mic] of CONNECT) {
    const dest = path.join(dir, `${mic}.xls`);
    fs.writeFileSync(dest, await fetchBytes(url));
    files.push([dest, exchange]);
  }
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
      ...files.flat(),
    ],
    { encoding: "utf8", maxBuffer: 20_000_000 },
  );
  fs.rmSync(dir, { recursive: true, force: true });
  if (run.status !== 0) throw new Error(run.stderr || "the China Connect list could not be read");
  const rows = JSON.parse(run.stdout);
  if (rows.length < 1000) throw new Error(`the China Connect list has ${rows.length} names`);
  return rows;
}

const FUTU_PLACE = {
  "Hong Kong": ["HK", "XHKG"],
  Nasdaq: ["US", "XNAS"],
  "New York Stock Exchange": ["US", "XNYS"],
  "NYSE American": ["US", "XASE"],
  "NYSE Arca": ["US", "ARCX"],
  "Singapore Exchange": ["SG", "XSES"],
};

// The US, Hong Kong and Singapore lines brokers/futuhk read from the same
// group lists, checked against the same exchange lists as a live read.
async function futuhkRows(markets, books, drop) {
  const file = new URL("../futuhk/futuhk-parsed.json", import.meta.url);
  if (!fs.existsSync(file)) throw new Error("run brokers/futuhk/futuhk_scraping.mjs first, or pass --live");
  const out = [];
  const copied = {};
  for (const row of JSON.parse(fs.readFileSync(file, "utf8"))) {
    const place = FUTU_PLACE[row.exchange];
    if (!place || !markets.includes(place[0])) continue;
    const market = place[0];
    copied[market] = (copied[market] || 0) + 1;
    const code = normalize(row.ticker).toUpperCase();
    let listing = null;
    if (market === "HK") {
      const why = hkOut((await books.hk()).get(code));
      if (why) {
        drop(why, `${code} ${row.name}`);
        continue;
      }
    } else if (market === "US") {
      listing = usPlace(await books.us(), code);
      if (!listing) {
        drop("US not in the symbol directory", `${code} ${row.name}`);
        continue;
      }
    } else if (market === "SG") {
      const why = sgOut(await books.sg(), code);
      if (why) {
        drop(why, `${code} ${row.name}`);
        continue;
      }
    }
    const type = row.type === "REIT" ? "FUND" : row.type;
    out.push(rowOf({
      ticker: row.ticker,
      name: row.name,
      exchange: listing?.exchange || row.exchange,
      mic: listing?.mic || place[1],
      currency: row.currency,
      type,
      isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(row.isin || "") ? row.isin : "",
      source: `${market} (moomoo group list via futuhk)`,
    }));
  }
  for (const market of ["US", "HK", "SG"].filter((m) => markets.includes(m))) {
    if ((copied[market] || 0) < 100) throw new Error(`futuhk-parsed.json has no ${market} lines`);
  }
  return out;
}

// Why a Hong Kong line stays out, or "" when it is kept.
function hkOut(listed) {
  if (!listed) return "HK not on the HKEX list";
  if (!HK_KEEP.has(listed.category)) return "HK outside equity/ETP/REIT";
  return "";
}

function usPlace(america, code) {
  return america.get(code) || america.get(code.replaceAll("/", ".")) || america.get(code.replaceAll(".", "-"));
}

function once(load) {
  let promise = null;
  return () => (promise ||= load());
}

let examples = {};

// One row per listing for the markets asked: "AU", "MY", "US", "HK", "SG", "CN".
export async function moomooRows(markets, { live = process.argv.includes("--live") } = {}) {
  const rows = [];
  const dropped = {};
  examples = {};
  const drop = (reason, example = "") => {
    dropped[reason] = (dropped[reason] || 0) + 1;
    if (example) (examples[reason] ||= []).length < 8 && examples[reason].push(example);
  };
  const books = { hk: once(hkBook), us: once(usBook), sg: once(sgxBook), asx: once(asxBook) };

  if (!live) {
    rows.push(...(await futuhkRows(markets, books, drop)));
    markets = markets.filter((m) => !["US", "HK", "SG"].includes(m));
  }

  if (markets.includes("AU")) {
    const asx = await books.asx();
    for (const item of await stockList(MARKET.AU)) {
      const type = kindOf(item.instrumentType);
      if (!type) {
        drop("AU other type");
        continue;
      }
      const code = normalize(item.stockCode).toUpperCase();
      const example = `${code} ${normalize(item.name)}`;
      if (!asx.companies.has(code) && !asx.products.has(code)) {
        if (shareClass(asx, code)) {
          if (await asxOrdinaryClass(code)) {
            drop("(kept) AU ordinary share class of a listed company", example);
            rows.push(rowOf({ ticker: code, name: item.name, exchange: "ASX", mic: "XASX", currency: "AUD", type, source: `AU ${item.marketLabel}` }));
            continue;
          }
        }
        if (type !== "ETF" || !(await asxQuotedEtp(code))) {
          drop("AU not on the ASX company or ETP list", example);
          continue;
        }
        drop("(kept) AU ETF quoted since the ETP report", example);
      }
      rows.push(rowOf({ ticker: code, name: item.name, exchange: "ASX", mic: "XASX", currency: "AUD", type, source: `AU ${item.marketLabel}` }));
    }
  }

  if (markets.includes("MY")) {
    for (const item of await stockList(MARKET.MY)) {
      const type = kindOf(item.instrumentType);
      if (!type) {
        drop("MY other type");
        continue;
      }
      const code = normalize(item.stockCode).toUpperCase();
      if (LEAP.test(code)) {
        drop("MY LEAP Market (sophisticated investors only)", `${code} ${normalize(item.name)}`);
        continue;
      }
      rows.push(rowOf({ ticker: code, name: item.name, exchange: "Bursa Malaysia", mic: "XKLS", currency: "MYR", type, source: `MY ${item.marketLabel}` }));
    }
  }

  if (markets.includes("HK")) {
    const hkex = await books.hk();
    for (const item of await stockList(MARKET.HK)) {
      const type = kindOf(item.instrumentType);
      if (!type) {
        drop("HK other type");
        continue;
      }
      const code = normalize(item.stockCode).padStart(5, "0");
      const listed = hkex.get(code);
      const why = hkOut(listed);
      if (why) {
        drop(why, `${code} ${normalize(item.name)}`);
        continue;
      }
      rows.push(rowOf({ ticker: code, name: item.name, exchange: "Hong Kong", mic: "XHKG", currency: listed.currency || "HKD", type, isin: listed.isin, source: "HK" }));
    }
  }

  if (markets.includes("US")) {
    const america = await books.us();
    for (const item of await stockList(MARKET.US)) {
      const kind = kindOf(item.instrumentType);
      if (!kind) {
        drop("US other type");
        continue;
      }
      const code = normalize(item.stockCode).toUpperCase();
      const place = usPlace(america, code);
      if (!place) {
        // Not in the exchange directory: an OTC Markets line. Both entities'
        // help pages give OTC Markets hours among the US markets
        // (moomoo.com/au/support/topic3_433, /my/support/topic3_433).
        if (kind !== "STOCK" && kind !== "ETF") {
          drop("US off-exchange, not a stock or ETF");
          continue;
        }
        drop("US kept on OTC Markets");
        rows.push(rowOf({ ticker: code, name: item.name, exchange: "OTC Markets", mic: "OTCM", currency: "USD", type: kind, source: "US" }));
        continue;
      }
      const type = place.etf || kind === "ETF" ? "ETF" : kind;
      rows.push(rowOf({ ticker: code, name: item.name, exchange: place.exchange, mic: place.mic, currency: "USD", type, source: "US" }));
    }
  }

  if (markets.includes("SG")) {
    const sgx = await books.sg();
    for (const item of await stockList(MARKET.SG)) {
      const type = kindOf(item.instrumentType);
      if (!type) {
        drop("SG other type");
        continue;
      }
      if (/W\d{6}$/i.test(item.name)) {
        drop("SG warrant");
        continue;
      }
      const code = normalize(item.stockCode).toUpperCase();
      const why = sgOut(sgx, code);
      if (why) {
        drop(why, `${code} ${normalize(item.name)}`);
        continue;
      }
      rows.push(rowOf({ ticker: code, name: item.name, exchange: "Singapore Exchange", mic: "XSES", currency: sgCurrency(item.name), type, source: "SG" }));
    }
  }

  if (markets.includes("CN")) {
    for (const item of await connectRows()) {
      rows.push(rowOf({
        ticker: item.ticker,
        name: item.name,
        exchange: item.exchange,
        mic: item.exchange.startsWith("Shanghai") ? "XSHG" : "XSHE",
        currency: "CNH",
        type: item.type,
        remark: connectRemark(item.exchange, item.ticker, item.type),
        source: "HKEX China Connect, Northbound buy and sell",
      }));
    }
  }

  const seen = new Set();
  const unique = rows.filter((row) => {
    const key = `${row.ticker}|${row.mic}|${row.currency}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { rows: unique, dropped };
}

export function logCounts(rows, dropped) {
  const counts = {};
  for (const row of rows) counts[`${row.exchange} ${row.currency} ${row.type}`] = (counts[`${row.exchange} ${row.currency} ${row.type}`] || 0) + 1;
  console.log(`${rows.length} rows, ${rows.filter((row) => row.isin).length} with ISIN`);
  console.table(counts);
  console.log("left out", dropped);
  if (Object.keys(examples).length) console.log("examples", examples);
}

export function requireListing(rows, checks) {
  for (const [ticker, exchange] of checks) {
    if (!rows.some((row) => row.ticker === ticker && row.exchange === exchange)) throw new Error(`${ticker} on ${exchange} missing`);
  }
}
