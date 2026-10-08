// What Marketech Focus sells, with no login. There is no Focus list.
// A Focus account buys and sells every share and every ETF listed on
// the ASX, on TMX Australia and on the NSX. TMX Australia was Cboe
// Australia until 1 August 2026, and Chi-X before that. A security
// quoted on both the ASX and TMX is the ASX listing, once. Warrants,
// options, rights and notes stay out.
//
// The TMX tradable-securities file is the ASX and TMX book. It is
// dated, and it prints the ISIN. The listing MIC says which exchange
// the line belongs to. The ASX company file supplies the share names.
// A quoted metal product that the file does not carry is taken from
// the latest ASX investment-products workbook when the ASX still
// quotes it. The NSX official-list feed is the NSX book.
//
//   https://marketech.com.au/faqs/
//   https://www.tmxaustralia.com/equities/support/reference-data
//   https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report
//   https://www.nsx.com.au/ftp/rss/nsx_rss_officiallist.xml
//
//   node brokers/marketech/marketech_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);

const REFERENCE = "https://www.tmxaustralia.com/equities/support/reference-data";
const COMPANIES = "https://asx.api.cmfyapp.com/asx-research/1.0/companies/directory/file";
const PRODUCTS = "https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report.html";
const NSX = "https://www.nsx.com.au/ftp/rss/nsx_rss_officiallist.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

// The tradable file's TYPE and INSTRUMENTSUBTYPE. An ordinary share is
// 1/1, a stapled security or a listed trust unit is 1/6, and a
// cumulative preference share is 1/17. An ETF is 3/7. An active ETF
// quoted in units is 3/36. SPY, the S&P 500 CDI, is 3/33. The quoted
// gold product is filed as 1/16 rather than as an ETF. A right is 1/10.
// Warrants are 4, options are 5, and notes are 6.
const STOCK = new Set(["1/1", "1/6", "1/17"]);
const ETF = new Set(["3/7", "3/36", "3/33", "1/16"]);
const ASIDE = new Set(["1/10", "4/", "5/", "6/"]);

const EXCHANGE = { XASX: "ASX", CHIA: "Cboe Australia" };

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*" },
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return await response.text();
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
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

function companyNames(csv) {
  const table = parseCsv(csv);
  const header = table[0]?.map((cell) => cell.trim().toLowerCase());
  if (header?.[0] !== "asx code" || header?.[1] !== "company name") {
    throw new Error(`ASX company file header is ${(header || []).join(",")}`);
  }
  const names = new Map();
  for (const line of table.slice(1)) {
    const ticker = String(line[0] || "").trim().toUpperCase();
    const name = String(line[1] || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) throw new Error(`unreadable ASX company ${JSON.stringify(line[0])}`);
    if (names.has(ticker)) throw new Error(`repeated ASX company ${ticker}`);
    names.set(ticker, name);
  }
  if (names.size < 1500) throw new Error(`ASX company file printed ${names.size} names`);
  return names;
}

function tradableUrl(html) {
  const found = new Set();
  for (const match of html.matchAll(/https:\/\/cdn\.cboe\.com\/data\/au\/equities\/cxatsl\/cxa\/PROD_CXATSL_[0-9_]+\.txt/g)) {
    found.add(match[0]);
  }
  if (found.size !== 1) throw new Error(`TMX reference page linked ${found.size} tradable files`);
  return [...found][0];
}

function tradableRows(text) {
  const lines = text.split(/\r?\n/).filter((line) => line && !line.startsWith("T|"));
  const header = lines[0]?.replace(/^H\|/, "").split("|");
  const column = Object.fromEntries((header || []).map((name, index) => [name, index]));
  for (const name of ["CXACODE", "DESC", "ISIN", "CURR", "MIC", "TYPE", "INSTRUMENTSUBTYPE"]) {
    if (column[name] === undefined) throw new Error(`TMX tradable file has no ${name} column`);
  }
  const rows = [];
  for (const line of lines.slice(1)) {
    const cell = line.replace(/^D\|/, "").split("|");
    if (cell.length < header.length) throw new Error(`short TMX row ${cell[column.CXACODE] || ""}`);
    rows.push({
      ticker: cell[column.CXACODE].trim().toUpperCase(),
      desc: cell[column.DESC].replace(/\s+/g, " ").trim(),
      isin: cell[column.ISIN].trim().toUpperCase(),
      currency: cell[column.CURR].trim().toUpperCase(),
      mic: cell[column.MIC].trim().toUpperCase(),
      kind: `${cell[column.TYPE].trim()}/${cell[column.INSTRUMENTSUBTYPE].trim()}`,
    });
  }
  if (rows.length < 3000) throw new Error(`TMX tradable file printed ${rows.length} rows`);
  return rows;
}

function listingKind(kind) {
  if (STOCK.has(kind)) return "STOCK";
  if (ETF.has(kind)) return "ETF";
  const type = kind.split("/")[0];
  if (ASIDE.has(kind) || ASIDE.has(`${type}/`)) return "";
  return null;
}

function cleanDesc(desc, ticker) {
  return desc
    .replace(new RegExp(`\\s*\\[${ticker}\\]\\s*$`), "")
    .replace(/\s+FPO\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTH = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function latestWorkbook(html) {
  let best = null;
  const pattern = /\/content\/dam\/asx\/issuers\/asx-investment-products-reports\/(\d{4})\/excel\/asx-investment-products-([a-z]+)-\d{4}-abs\.xlsx/g;
  for (const match of html.matchAll(pattern)) {
    const month = MONTH[match[2]];
    if (!month) continue;
    const rank = Number(match[1]) * 12 + month;
    if (!best || rank > best.rank) best = { rank, url: `https://www.asx.com.au${match[0]}` };
  }
  if (!best) throw new Error("ASX investment-products page linked no workbook");
  return best.url;
}

function sharedStrings(xml) {
  const strings = [];
  for (const item of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const text = [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("");
    strings.push(text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, "\n"));
  }
  return strings;
}

function columnNumber(letters) {
  let number = 0;
  for (const letter of letters) number = number * 26 + letter.charCodeAt(0) - 64;
  return number;
}

function sheetCells(xml, strings) {
  const rows = new Map();
  // A self-closing cell has to be taken on its own. If the slash is left for
  // the following cell, that cell is swallowed with it.
  const pattern = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  for (const cell of xml.matchAll(pattern)) {
    const attrs = cell[1] || cell[2];
    const ref = / r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref || !cell[3]) continue;
    const kind = / t="([^"]+)"/.exec(attrs);
    const value = /<v>([\s\S]*?)<\/v>/.exec(cell[3]);
    if (!value) continue;
    const raw = kind?.[1] === "s" ? strings[Number(value[1])] ?? "" : value[1];
    const row = Number(ref[2]);
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row).set(columnNumber(ref[1]), raw);
  }
  return rows;
}

async function workbookEntries(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const file = path.join(os.tmpdir(), `marketech-etp-${process.pid}.xlsx`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  const read = async (name) => {
    const { stdout } = await exec("unzip", ["-p", file, name], { maxBuffer: 40_000_000, encoding: "utf8" });
    return stdout;
  };
  try {
    const strings = sharedStrings(await read("xl/sharedStrings.xml"));
    const workbook = await read("xl/workbook.xml");
    const rels = await read("xl/_rels/workbook.xml.rels");
    const sheet = /<sheet\b[^>]*name="Spotlight ETP List"[^>]*>/.exec(workbook);
    const id = sheet && /r:id="([^"]+)"/.exec(sheet[0]);
    const target = id && new RegExp(`Id="${id[1]}"[^>]*Target="([^"]+)"`).exec(rels);
    if (!target) throw new Error("ASX workbook has no Spotlight ETP List");
    const sheetPath = target[1].replace(/^\//, "").replace(/^xl\//, "xl/");
    const cells = sheetCells(await read(sheetPath.startsWith("xl/") ? sheetPath : `xl/${sheetPath}`), strings);
    const entries = [];
    for (const row of cells.values()) {
      const ticker = String(row.get(2) || "").trim().toUpperCase();
      const name = String(row.get(5) || "").replace(/\s+/g, " ").trim();
      if (!/^[A-Z0-9]{3,8}$/.test(ticker) || !name || name.startsWith("*") || name.startsWith("#")) continue;
      entries.push({ ticker, name });
    }
    if (entries.length < 400) throw new Error(`ASX workbook printed ${entries.length} ETPs`);
    return entries;
  } finally {
    fs.unlinkSync(file);
  }
}

async function productIsin(ticker) {
  const url = `https://asx.api.cmfyapp.com/asx-research/1.0/companies/${encodeURIComponent(ticker)}/key-statistics`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return "";
    const body = await response.json();
    return String(body?.data?.isin || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

async function displayName(ticker) {
  const url = `https://asx.api.cmfyapp.com/asx-research/1.0/companies/${encodeURIComponent(ticker)}/header`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return "";
    const body = await response.json();
    return String(body?.data?.displayName || "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function nsxRows(xml) {
  const decoded = xml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  const rows = [];
  for (const item of decoded.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = item[1];
    const field = (label) => {
      const match = body.match(new RegExp(`${label}:\\s*([^<]*)`));
      return match ? match[1].replace(/\s+/g, " ").trim() : "";
    };
    const ticker = field("Issue Code").toUpperCase();
    const type = field("Issue Type");
    const isin = field("ISIN").toUpperCase();
    let name = field("Issue Name").replace(/\s+-\s+FPO\s*$/i, "").trim();
    if (!ticker || !type) throw new Error("NSX official list has a row with no code");
    if (/debenture|bond|note|warrant/i.test(type)) continue;
    if (!/ordinary/i.test(type)) throw new Error(`${ticker} is ${type} on the NSX, not a share`);
    if (!name) name = ticker;
    rows.push({ ticker, name, isin, exchange: "NSX", currency: "AUD", type: "STOCK" });
  }
  if (rows.length < 20) throw new Error(`NSX official list printed ${rows.length} shares`);
  return rows;
}

function rowOf(entry, name) {
  const isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(entry.isin) ? entry.isin : "";
  if (entry.exchange !== "NSX" && !isin) throw new Error(`no ISIN for ${entry.ticker}`);
  return {
    query: isin || entry.ticker,
    ticker: entry.ticker,
    name,
    exchange: entry.exchange,
    currency: "AUD",
    type: entry.type,
    isin,
    raw: [entry.ticker, name, entry.exchange, isin, entry.type].filter(Boolean).join(" "),
  };
}

const names = companyNames(await getText(COMPANIES));
const book = tradableRows(await getText(tradableUrl(await getText(REFERENCE))));
const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const pending = [];
const seen = new Set();
for (const entry of book) {
  const type = listingKind(entry.kind);
  if (type === null) throw new Error(`${entry.ticker} is ${entry.kind}, not a share or an ETF`);
  if (!type) {
    skip(entry.kind.split("/")[0] === "1" ? "right" : entry.kind.startsWith("4") ? "warrant" : entry.kind.startsWith("5") ? "option" : "note");
    continue;
  }
  const exchange = EXCHANGE[entry.mic];
  if (!exchange) throw new Error(`${entry.ticker} is listed on ${entry.mic || "no venue"}`);
  if (entry.currency !== "AUD") throw new Error(`${entry.ticker} is priced in ${entry.currency || "no currency"}`);
  if (!/^[A-Z0-9]{2,8}$/.test(entry.ticker)) throw new Error(`unreadable ticker ${entry.ticker}`);
  if (seen.has(entry.ticker)) throw new Error(`repeated ${entry.ticker}`);
  seen.add(entry.ticker);
  pending.push({ ...entry, type, exchange, name: names.get(entry.ticker) || "" });
}

const unnamed = pending.filter((entry) => !entry.name && entry.exchange !== "Cboe Australia");
const fetched = await mapPool(unnamed, 12, async (entry) => displayName(entry.ticker));
unnamed.forEach((entry, index) => {
  entry.name = fetched[index] || cleanDesc(entry.desc, entry.ticker);
});
for (const entry of pending) {
  if (!entry.name) entry.name = cleanDesc(entry.desc, entry.ticker);
  if (!entry.name) throw new Error(`no name for ${entry.ticker}`);
}

const listings = pending.map((entry) => rowOf(entry, entry.name));
for (const entry of await workbookEntries(latestWorkbook(await getText(PRODUCTS)))) {
  if (seen.has(entry.ticker)) continue;
  const name = await displayName(entry.ticker);
  if (!name) continue;
  const isin = await productIsin(entry.ticker);
  seen.add(entry.ticker);
  listings.push(rowOf({ ticker: entry.ticker, isin, exchange: "ASX", type: "ETF" }, name));
}
const seenIsin = new Set(listings.map((row) => row.isin).filter(Boolean));
const seenNsx = new Set();
for (const entry of nsxRows(await getText(NSX))) {
  if (entry.isin && seenIsin.has(entry.isin)) continue;
  if (seenNsx.has(entry.ticker)) throw new Error(`repeated NSX ${entry.ticker}`);
  seenNsx.add(entry.ticker);
  listings.push(rowOf(entry, entry.name));
}

const stocks = listings.filter((row) => row.type === "STOCK").length;
const etfs = listings.filter((row) => row.type === "ETF").length;
if (stocks < 1700) throw new Error(`kept ${stocks} shares`);
if (etfs < 400) throw new Error(`kept ${etfs} ETFs`);

listings.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("marketech-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));

const byBook = new Map();
for (const row of listings) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${listings.length} listings (${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
