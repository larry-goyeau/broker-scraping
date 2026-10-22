// What Webull Securities (Canada) Limited and Webull Canada Crypto Limited
// sell to Canadian residents: US-listed stocks and ETFs, a published list
// of 450 OTC names, Canadian-listed stocks and ETFs, and ten coins.
//
// Rules, read on webull.ca on 21 October 2026:
//
// - US-listed and Canadian-listed stocks and ETFs, and the OTC names of a
//   PDF list: "Webull Canada currently offers Canadian-listed and US-listed
//   stocks, ETFs, US-listed Options, and 450 OTC securities. To view
//   available OTC symbols to trade, please click here." (the link is the
//   PDF read below).
//     https://www.webull.ca/help/faq/385-What-securities-are-available-to-me
//     https://www.webull.ca/help/faq/627-Enhanced-Order-Types-and-OTC-Updates
//     https://c1aweb.wbcasecurities.com/content/approval/file/fba44c25f0a045b1936064a50af5fd8f.pdf
//   "Trade U.S. and Canadian equities, plus U.S. options" (home page);
//   "Trade U.S. and Canadian stocks and ETFs with $0 commission".
//     https://www.webull.ca/  https://www.webull.ca/trading-investing/stocks
//     https://www.webull.ca/pricing ("U.S. Stocks and ETFs $0 per trade",
//     "Canadian Stocks and ETFs $0 per trade")
//
// - Canadian venues. No webull.ca page names the exchanges. The entity's own
//   quote page (https://www.webull.ca/quote, data from
//   quotes-gw.webullfintech.com with app "ca") quotes Canadian lines on TSX,
//   TSXV (NEX lines, .H, are filed under TSXV there), CSE and NEO (Cboe
//   Canada), in CAD and in USD (.U lines). Its stock ranking
//   (/api/wlas/ranking/v9/rise|fall?regionId=3, 2,152 movers on 21 October
//   2026) holds lines of those four venues only, and every one of them is
//   in the exchange lists below. The ranking is a check, not the list: it
//   holds shares only and only the day's movers. The list is the
//   exchanges' own public files:
//     https://www.tsx.com/json/company-directory/search/tsx/%5E*
//     https://www.tsx.com/json/company-directory/search/tsxv/%5E*
//     https://www.tsx.com/en/listings/tsx-and-tsxv-issuer-resources/tsx-venture-exchange-issuer-resources/nex/listed-companies
//     https://www.tsx.com/en/resource/571 (TSX & TSXV listed issuers: the
//       "ETP" sector says which TSX/TSXV line is an ETF)
//     https://webapi-backup.thecse.com/trading/listed/market/security_maintenance.json
//     https://www-api.cboe.com/ca/equities/listing-directory-data/
//   Kept: shares, units, preferred shares, CDRs and ETFs. Warrants, rights,
//   debentures, notes and receipts stay out ("stocks and ETFs"); a CSE
//   line marked delisted stays out. A title is written on its listing
//   exchange, in the line's own currency (.U = USD; the CSE and Cboe
//   Canada files give the currency of each line).
//   Not applied, for want of a source: webull.ca says some securities may
//   be restricted ("thinly traded securities, or lack of support from our
//   carrying broker/trading venues", case by case,
//   https://www.webull.ca/help/faq/651-Requesting-Removal-of-a-Trading-Restriction-on-a-Security)
//   but publishes no list. The ranking holds no .UN or preferred line;
//   Webull's public search does not answer for Canadian lines without a
//   login, so whether those lines are quoted could not be checked.
//
// - US-listed: the frozen rows of brokers/webull/webull-base.json on NYSE,
//   NASDAQ, AMEX (NYSE Arca / NYSE American) and CBOE, as they are. No
//   webull.ca page restricts a US-listed share or ETF.
//
// - OTC: only the names in the PDF. A name the base has on OTC keeps its
//   base row; a name the base lacks is written from the shared stock list
//   (assets/stocks.csv, OTC line: name and ISIN). GDLC, on the PDF, is now
//   listed on NYSE Arca and is in the US rows already.
//
// - Crypto: webull.ca shows a crypto offer (Webull Canada Crypto Limited,
//   same site, same app): "Coins Available to Trade on the Webull Mobile &
//   Desktop App: Bitcoin (BTC) Ethereum (ETH) ... Pepe (PEPE)", and
//   "Webull allows users to trade cryptocurrencies in USD."
//     https://www.webull.ca/trading-investing/crypto
//     https://www.webull.ca/help/faq/685-Which-coins-do-you-offer
//     https://www.webull.ca/help/faq/670-Can-I-trade-Crypto-in-CAD-USD-or-both
//   The coins are read from the crypto page and taken from the base's
//   crypto rows (USD). (The older FAQ 385 still says Webull Canada does not
//   support crypto: that is the securities dealer, the coins are sold by
//   its sister crypto dealer.)
//
// - Left out: Hong Kong and China Connect rows of the base. No webull.ca
//   page offers them.
//
// - Deposit currencies CAD and USD: "Webull currently offers conversions
//   from CAD to USD, and USD to CAD"; on deposit, "select the currency you
//   would like to deposit"; for the crypto account "Both CAD and USD can be
//   used for this internal transfer".
//     https://www.webull.ca/help/faq/376-What-currencies-can-I-exchange-on-the-Webull-app
//     https://www.webull.ca/help/faq/373-How-can-I-deposit-funds-into-my-Webull-Canada-account
//     https://www.webull.ca/help/faq/680-How-can-I-fund-my-Crypto-account
//   Every line here is quoted in one currency (a .U line is its own
//   symbol), so no line is duplicated across currencies.
//
//   node brokers/webullca/webullca_scraping.mjs

import { execFileSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";

const BASE = new URL("../webull/webull-base.json", import.meta.url);
const OUTPUT = new URL("webullca-parsed.json", import.meta.url);
const STOCKS_CSV = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS_CSV = new URL("../../assets/etfs.csv", import.meta.url);

const OTC_PDF = "https://c1aweb.wbcasecurities.com/content/approval/file/fba44c25f0a045b1936064a50af5fd8f.pdf";
const CRYPTO_PAGE = "https://www.webull.ca/trading-investing/crypto";
const TSX_DIRECTORY = "https://www.tsx.com/json/company-directory/search/";
const NEX_PAGE = "https://www.tsx.com/en/listings/tsx-and-tsxv-issuer-resources/tsx-venture-exchange-issuer-resources/nex/listed-companies";
const TMX_ISSUERS = "https://www.tsx.com/en/resource/571";
const CSE_LIST = "https://webapi-backup.thecse.com/trading/listed/market/security_maintenance.json";
const CBOE_LIST = "https://www-api.cboe.com/ca/equities/listing-directory-data/";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const US_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);

const PLACE = {
  tsx: { exchange: "Toronto Stock Exchange", mic: "XTSE" },
  tsxv: { exchange: "TSX Venture", mic: "XTSX" },
  nex: { exchange: "NEX", mic: "XTNX" },
  cse: { exchange: "Canadian Securities Exchange", mic: "XCNQ" },
  cboe: { exchange: "Cboe Canada", mic: "NEOE" },
};

// Suffixes of Canadian lines that are not shares, units or ETFs:
// warrants, rights, debentures, notes, subscription and instalment
// receipts.
const NOT_EQUITY = /\.(WT|RT|DB|NT|R|IR|SR)(\.|$)/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

async function fetchBytes(url, accept = "*/*") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// ---- shared lists -----------------------------------------------------------

// place|ticker -> [{ isin, name }] from the shared stock and ETF lists.
function listBook() {
  const book = new Map();
  for (const [file, kind] of [[STOCKS_CSV, "STOCK"], [ETFS_CSV, "ETF"]]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const cells = line.split(",");
      const ticker = normalize(cells[0]).toUpperCase().split(":").pop();
      const place = normalize(cells[1]).toUpperCase();
      const isin = normalize(cells[2]).toUpperCase();
      if (!ticker || !place || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
      const name = cells.slice(3).join(",").replace(/^"|"$/g, "").trim();
      const key = `${place}|${ticker}`;
      if (!book.has(key)) book.set(key, []);
      if (!book.get(key).some((item) => item.isin === isin)) book.get(key).push({ isin, name, kind });
    }
  }
  return book;
}

// ---- OTC PDF ----------------------------------------------------------------

// The PDF is one page of tickers in columns. pypdf reads its text, as the
// old scraper read the Connect lists with xlrd.
async function otcTickers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "webullca-otc-"));
  const file = path.join(dir, "otc.pdf");
  fs.writeFileSync(file, await fetchBytes(OTC_PDF, "application/pdf"));
  let text;
  try {
    text = execFileSync(
      "python3",
      ["-c", "import sys, pypdf\nprint('\\n'.join(page.extract_text() or '' for page in pypdf.PdfReader(sys.argv[1]).pages))", file],
      { encoding: "utf8", maxBuffer: 20_000_000 },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const tickers = new Set(text.match(/\b[A-Z][A-Z.]{1,6}\b/g) || []);
  if (tickers.size < 400) throw new Error(`the Webull Canada OTC PDF gave ${tickers.size} tickers`);
  return tickers;
}

// ---- crypto page ------------------------------------------------------------

async function cryptoCoins() {
  const html = (await fetchBytes(CRYPTO_PAGE, "text/html")).toString("utf8");
  const text = normalize(decodeHtml(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")));
  const section = text.match(/Coins Available to Trade(.*?)More to come/);
  if (!section) throw new Error("the webull.ca crypto page has no coin list");
  const coins = [...section[1].matchAll(/\(([A-Z0-9]{2,10})\)/g)].map((match) => match[1]);
  if (coins.length < 5) throw new Error(`the webull.ca crypto page lists ${coins.length} coins`);
  return new Set(coins);
}

// ---- exchange lists -----------------------------------------------------------

async function tmxDirectory(board) {
  const found = JSON.parse((await fetchBytes(`${TSX_DIRECTORY}${board}/%5E*`, "application/json")).toString("utf8"));
  const symbols = new Map();
  for (const company of found.results || []) {
    for (const item of company.instruments || []) {
      symbols.set(normalize(item.symbol).toUpperCase(), normalize(company.name || item.name));
    }
  }
  if (symbols.size < 1000) throw new Error(`the ${board} directory gave ${symbols.size} symbols`);
  return symbols;
}

async function nexSymbols() {
  const html = (await fetchBytes(NEX_PAGE, "text/html")).toString("utf8");
  const symbols = new Map();
  for (const row of html.matchAll(/<tr\b[^>]*>\s*<td>([\s\S]*?)<\/td>\s*<td[^>]*>\s*([A-Z0-9]{1,6}(?:\.[A-Z]{1,2})?\.H)\s*<\/td>/g)) {
    symbols.set(row[2], normalize(decodeHtml(row[1])));
  }
  if (symbols.size < 100) throw new Error(`the NEX page lists ${symbols.size} symbols`);
  return symbols;
}

function columnIndex(ref) {
  let n = 0;
  for (const char of ref) {
    if (!/[A-Z]/i.test(char)) break;
    n = n * 26 + char.toUpperCase().charCodeAt(0) - 64;
  }
  return n - 1;
}

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

// The rows of every sheet of a workbook, in order.
function sheets(bytes) {
  const files = zipFiles(bytes);
  const tag = "(?:[a-z0-9]+:)?";
  const shared = [];
  const sharedXml = files.get("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const item of sharedXml.toString("utf8").matchAll(new RegExp(`<${tag}si\\b[^>]*>([\\s\\S]*?)</${tag}si>`, "g"))) {
      shared.push([...item[1].matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((node) => node[1]).join(""));
    }
  }
  const out = [];
  for (let number = 1; files.has(`xl/worksheets/sheet${number}.xml`); number += 1) {
    const sheet = files.get(`xl/worksheets/sheet${number}.xml`);
    const rows = [];
    for (const row of sheet.toString("utf8").matchAll(new RegExp(`<${tag}row\\b[^>]*>([\\s\\S]*?)</${tag}row>`, "g"))) {
      const values = {};
      for (const cell of row[1].matchAll(new RegExp(`<${tag}c\\b([^>]*?)/>|<${tag}c\\b([^>]*)>([\\s\\S]*?)</${tag}c>`, "g"))) {
        if (cell[3] === undefined) continue;
        const ref = cell[2].match(/\br="([A-Z]+)\d+"/i)?.[1] || "A";
        const type = cell[2].match(/\bt="([^"]+)"/)?.[1] || "";
        const raw = cell[3].match(new RegExp(`<${tag}v>([\\s\\S]*?)</${tag}v>`))?.[1] ?? "";
        const inline = [...cell[3].matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((node) => node[1]).join("");
        values[columnIndex(ref)] = unescapeXml(type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? inline : raw);
      }
      if (!Object.keys(values).length) continue;
      const width = Math.max(...Object.keys(values).map(Number)) + 1;
      rows.push(Array.from({ length: width }, (_, index) => values[index] ?? ""));
    }
    out.push(rows);
  }
  return out;
}

// Root ticker -> TMX sector ("ETP", "CDR", "Mining", ...), for the TSX
// sheet and the TSXV sheet.
async function tmxSectors() {
  const books = sheets(await fetchBytes(TMX_ISSUERS));
  const result = [];
  for (const rows of books.slice(0, 2)) {
    const header = rows.findIndex((row) => normalize(row[0]) === "Co_ID");
    if (header < 0) throw new Error("a TMX issuers sheet has no header");
    const tickerAt = rows[header].findIndex((cell) => /^Root\s*Ticker$/i.test(normalize(cell)));
    const sectorAt = rows[header].findIndex((cell) => normalize(cell) === "Sector");
    if (tickerAt < 0 || sectorAt < 0) throw new Error("a TMX issuers sheet is missing a column");
    const sectors = new Map();
    for (const row of rows.slice(header + 1)) {
      const ticker = normalize(row[tickerAt]).toUpperCase();
      if (ticker) sectors.set(ticker, normalize(row[sectorAt]));
    }
    result.push(sectors);
  }
  if (result.length < 2) throw new Error("the TMX issuers workbook lacks its TSXV sheet");
  if ([...result[0].values()].filter((sector) => sector === "ETP").length < 800) throw new Error("the TMX TSX sheet has too few ETPs");
  return { tsx: result[0], tsxv: result[1] };
}

async function cseList() {
  const payload = JSON.parse((await fetchBytes(CSE_LIST, "application/json")).toString("utf8"));
  const list = payload?.full_list;
  if (!Array.isArray(list) || list.length < 500) throw new Error(`the CSE list has ${list?.length ?? 0} lines`);
  return list;
}

async function cboeList() {
  const payload = JSON.parse((await fetchBytes(CBOE_LIST, "application/json")).toString("utf8"));
  const list = payload?.data;
  if (!Array.isArray(list) || list.length < 300) throw new Error(`the Cboe Canada directory has ${list?.length ?? 0} lines`);
  return list;
}

// ---- rows -------------------------------------------------------------------

const dropped = {};
function drop(reason) {
  dropped[reason] = (dropped[reason] || 0) + 1;
}

function canadianRow({ ticker, name, place, currency, type, source }) {
  return {
    query: ticker,
    ticker,
    name: normalize(name) || ticker,
    exchange: place.exchange,
    mic: place.mic,
    currency,
    type,
    raw: [ticker, normalize(name), source, currency].filter(Boolean).join(" "),
    isin: "",
  };
}

const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
const book = listBook();

const [otc, coins, tsx, tsxv, nex, sectors, cse, cboe] = await Promise.all([
  otcTickers(),
  cryptoCoins(),
  tmxDirectory("tsx"),
  tmxDirectory("tsxv"),
  nexSymbols(),
  tmxSectors(),
  cseList(),
  cboeList(),
]);

const rows = [];

// US listed and crypto, from the base.
const usListed = new Set();
for (const row of base) {
  if (US_EXCHANGES.has(row.exchange)) {
    rows.push({ ...row });
    usListed.add(row.ticker);
  } else if (row.exchange === "CRYPTO") {
    if (coins.has(row.ticker)) rows.push({ ...row });
    else drop("crypto not on the webull.ca coin list");
  } else if (row.exchange === "OTC") {
    if (!otc.has(row.ticker)) drop("OTC not on the Webull Canada PDF");
  } else {
    drop(`${row.exchange} not offered`);
  }
}
const missingCoins = [...coins].filter((coin) => !rows.some((row) => row.exchange === "CRYPTO" && row.ticker === coin));
if (missingCoins.length) throw new Error(`coins of webull.ca missing from the base: ${missingCoins.join(", ")}`);

// OTC: the PDF's names.
const otcNotes = { base: 0, list: 0, bare: 0, listed: [] };
const baseOtc = new Map(base.filter((row) => row.exchange === "OTC").map((row) => [row.ticker, row]));
for (const ticker of [...otc].sort()) {
  const known = baseOtc.get(ticker);
  if (known) {
    rows.push({ ...known });
    otcNotes.base += 1;
    continue;
  }
  if (usListed.has(ticker)) {
    otcNotes.listed.push(ticker);
    continue;
  }
  const found = book.get(`OTC|${ticker}`) || [];
  const one = found.length === 1 ? found[0] : null;
  const name = one?.name || found[0]?.name || ticker;
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: "OTC",
    currency: "USD",
    type: one?.kind || "STOCK",
    raw: [ticker, name, "OTC", "USD"].join(" "),
    isin: one?.isin || "",
  });
  if (one) otcNotes.list += 1;
  else otcNotes.bare += 1;
}

// Canadian listed.
const caStart = rows.length;
for (const [code, name] of tsx) {
  if (NOT_EQUITY.test(code)) {
    drop("TSX warrant, right, debenture, note or receipt");
    continue;
  }
  const sector = sectors.tsx.get(code.split(".")[0]) || "";
  rows.push(canadianRow({
    ticker: code,
    name,
    place: PLACE.tsx,
    currency: /\.U$/.test(code) ? "USD" : "CAD",
    type: sector === "ETP" ? "ETF" : "STOCK",
    source: `TSX ${sector}`.trim(),
  }));
}
for (const [code, name] of tsxv) {
  if (NOT_EQUITY.test(code)) {
    drop("TSXV warrant, right, debenture, note or receipt");
    continue;
  }
  const sector = sectors.tsxv.get(code.split(".")[0]) || "";
  rows.push(canadianRow({
    ticker: code,
    name,
    place: PLACE.tsxv,
    currency: /\.U$/.test(code) ? "USD" : "CAD",
    type: sector === "ETP" ? "ETF" : "STOCK",
    source: `TSXV ${sector}`.trim(),
  }));
}
for (const [code, name] of nex) {
  if (NOT_EQUITY.test(code)) {
    drop("NEX warrant, right, debenture, note or receipt");
    continue;
  }
  // The shared lists file NEX lines under TSXV.
  const found = book.get(`TSXV|${code}`) || [];
  const row = canadianRow({ ticker: code, name, place: PLACE.nex, currency: /\.U$/.test(code) ? "USD" : "CAD", type: "STOCK", source: "NEX" });
  if (found.length === 1) row.isin = found[0].isin;
  rows.push(row);
}
for (const item of cse) {
  const code = normalize(item.symbol).toUpperCase();
  if (/delisted/i.test(item.status || "")) {
    drop("CSE delisted");
    continue;
  }
  if (!/^(Equity|ETF)$/i.test(item.security_type || "") || NOT_EQUITY.test(code)) {
    drop("CSE debt or other");
    continue;
  }
  rows.push(canadianRow({
    ticker: code,
    name: item.security_name,
    place: PLACE.cse,
    currency: /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "CAD",
    type: /^ETF$/i.test(item.security_type) ? "ETF" : "STOCK",
    source: `CSE ${item.security_type} ${item.status}`,
  }));
}
for (const item of cboe) {
  const code = normalize(item.symbol).toUpperCase();
  if (!["etf", "equity", "dr", "cef"].includes(item.security)) {
    drop("Cboe Canada debt or warrant");
    continue;
  }
  rows.push(canadianRow({
    ticker: code,
    name: item.name,
    place: PLACE.cboe,
    currency: /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "CAD",
    type: item.security === "etf" ? "ETF" : "STOCK",
    source: `Cboe Canada ${item.security}/${item.security_sub_type}`,
  }));
}
const caRows = rows.length - caStart;
if (caRows < 4000) throw new Error(`only ${caRows} Canadian rows`);

// One row a (place, ticker, currency).
const seen = new Set();
const unique = rows.filter((row) => {
  const key = `${row.exchange}|${row.ticker}|${row.currency}|${row.type}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Every line must name a venue the cost estimator knows; the crypto book
// is over the counter and resolves to no exchange, as in the base.
const unresolved = new Set();
for (const row of unique) {
  if (row.exchange === "CRYPTO") continue;
  if (!resolveVenue({ exchange: row.exchange, mic: row.mic, currency: row.currency, isin: row.isin }).venue) {
    unresolved.add(`${row.exchange}|${row.mic || ""}|${row.currency}`);
  }
}
if (unresolved.size) throw new Error(`venues that do not resolve: ${[...unresolved].join(", ")}`);

for (const [ticker, exchange, type] of [
  ["AAPL", "NASDAQ", "STOCK"],
  ["SPY", "AMEX", "ETF"],
  ["RY", "Toronto Stock Exchange", "STOCK"],
  ["XIU", "Toronto Stock Exchange", "ETF"],
  ["BTC", "CRYPTO", "CRYPTO"],
  ["NSRGY", "OTC", "STOCK"],
]) {
  if (!unique.some((row) => row.ticker === ticker && row.exchange === exchange && row.type === type)) {
    throw new Error(`${ticker} ${type} on ${exchange} missing`);
  }
}
for (const place of Object.values(PLACE)) {
  if (!unique.some((row) => row.exchange === place.exchange)) throw new Error(`no ${place.exchange} rows`);
}

unique.sort((left, right) =>
  String(left.type).localeCompare(right.type) ||
  String(left.exchange).localeCompare(String(right.exchange)) ||
  String(left.ticker).localeCompare(String(right.ticker)) ||
  String(left.currency).localeCompare(String(right.currency))
);

const written = stampRows(withoutObligations(unique));
fs.writeFileSync(OUTPUT, JSON.stringify(written, null, 2));

const counts = {};
for (const row of written) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
console.error(
  `OTC PDF ${otc.size} names: ${otcNotes.base} from the base, ${otcNotes.list} from the shared list, ` +
    `${otcNotes.bare} without a list line, listed in the US now: ${otcNotes.listed.join(", ") || "none"}`
);
console.error(`coins on webull.ca: ${[...coins].join(", ")}`);
console.error(`left out: ${JSON.stringify(dropped)}`);
console.error(
  `${written.length} rows, ${written.filter((row) => row.isin).length} with ISIN\n` +
    Object.entries(counts).map(([key, count]) => `  ${count} ${key}`).join("\n")
);
