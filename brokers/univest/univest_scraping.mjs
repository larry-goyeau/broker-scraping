// What Univest (Univest Stock Broking Private Limited, NSE member 90392,
// BSE member 6866) sells in shares and exchange-traded funds, with no
// login. The stock directory is the book: one page, https://univest.in/stocks/all,
// carries every name the app lists (6,312 in October 2026) as data, each
// with its NSE symbol, its BSE symbol, or both. A name with both is two
// rows, one per exchange. The directory prints no ISIN, no series and no
// type, so each symbol is read against the exchanges' own files:
//
//   NSE   the Upstox cash book (NSE_EQ lines: symbol, ISIN, series), and
//         the NSE list of ETFs (eq_etfseclist.csv) for the type.
//   BSE   the BSE's own scrip list (ListofScripData, status Active: scrip
//         id, ISIN, group), then the Upstox BSE_EQ lines (which also carry
//         the ETFs, group E or F, and the REITs and InvITs, group IF).
//
// Univest writes the NSE series behind the symbol when it is not EQ
// (AARADHYA-ST, ABAN-BE); the series is stripped before the look-up. Some
// BSE symbols are an older, shorter form of the BSE scrip id (ABBOTINDI,
// BANKBAROD): such a line is matched through the ISIN of the same name's
// NSE line, or else through a company name that only one active BSE
// scrip carries; an NSE symbol in an older form (VASCON for VASCONEQ)
// through the ISIN of the same name's BSE line. A symbol none of these finds is not written (a name no
// longer traded there, or a delisted company left in the directory).
//
// Kept: shares (NSE series EQ, BE, BZ, SM, ST, E1 partly paid; every BSE
// equity group), REITs and InvITs (NSE IV and RR, BSE IF; STOCK), and
// ETFs (NSE ETF list or a fund ISIN on series EQ; BSE group E, a fund
// ISIN on the NSE ETF list, or a fund ISIN named ETF/BEES). Left out: the
// closed-end mutual fund units (NSE -MF, BSE fund ISINs that are not
// ETFs), specialised investment funds (-SF), government securities, T-bills
// and bonds (NSE N*, GS, GB, SG; BSE G and debt ISINs), which are other
// products. A BSE line whose ISIN is Suspended or Delisted on the BSE's
// status list, and on no Active scrip, is not written (../lemonn/bseStatus.mjs).
//
// Names: the directory keeps a company's name from before a rename
// (ETERNAL as "Zomato Ltd.", JSWDULUX as "Akzo Nobel India Ltd.") and
// prints NSE names cut short ("INTERNATIO GEMM INS (I) L"). A row whose
// ISIN is on the BSE Active list takes that list's Scrip_Name ("Eternal
// Ltd"), on both exchanges; the directory's name is kept for the others.
//
// Remark: a privately placed InvIT (NHIT, ANZEN, VERTIS, IRBIT, ...)
// trades only in its minimum lot, which the Upstox file prints as
// lot_size (25,000 units in October 2026, against 1 for the public
// InvITs and REITs). SEBI cut the secondary-market trading lot of a
// privately placed InvIT from Rs 1 crore "which has been now reduced to
// ₹25 lakh" (26 September 2024; https://www.angelone.in/news/market-updates/sebi-cuts-invit-trading-lot). The
// lot depends on what the client can put in, so the row stays with a
// remark naming the lot: an InvIT or REIT unit (ISIN type 23 or 25)
// whose Upstox lot on that exchange is above 1.
//
// Fees: https://univest.in/pricing (univest_cost.mjs).
//
//   https://univest.in/stocks/all
//   https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz
//   https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Active
//
//   node brokers/univest/univest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bseClosed } from "../lemonn/bseStatus.mjs";
import { debtIsin, isinOf, parseCsv } from "../../indianCash.mjs";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";

const DIRECTORY = "https://univest.in/stocks/all";
const UPSTOX = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
const NSE_ETFS = "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv";
const BSE_ACTIVE = "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MIC = { NSE: "XNSE", BSE: "XBOM" };
const NSE_SHARE = new Set(["EQ", "BE", "BZ", "SM", "ST", "E1"]);
const NSE_TRUST = new Set(["IV", "RR"]);
const BSE_SHARE = new Set(["A", "B", "T", "X", "XT", "Z", "ZP", "M", "MT", "P", "TS", "MS", "R", "IP", "Y"]);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, headers = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return response;
      last = `${url} answered ${response.status}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await pause(2000 * (attempt + 1));
  }
  throw new Error(last);
}

const key = (value) => String(value || "").trim().toUpperCase();
const words = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ltd|limited|the|co|company|corporation|corp|india|inds?|industries)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "");

async function directory() {
  const html = await (await get(DIRECTORY, { Accept: "text/html" })).text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("the Univest directory has no page data");
  const list = JSON.parse(match[1])?.props?.pageProps?.data;
  if (!Array.isArray(list) || list.length < 5500) throw new Error(`the Univest directory lists ${list?.length ?? "no"} names`);
  for (const item of list) {
    if (!("compName" in item) || !("nseSymbol" in item) || !("bseSymbol" in item)) throw new Error(`directory line changed shape: ${JSON.stringify(item).slice(0, 120)}`);
  }
  return list;
}

async function upstox() {
  const response = await get(UPSTOX);
  const rows = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
  const nse = new Map();
  const bse = new Map();
  // "NSE|<isin>" or "BSE|<isin>" -> minimum trading lot (units).
  const lots = new Map();
  for (const row of rows) {
    const book = row.segment === "NSE_EQ" ? nse : row.segment === "BSE_EQ" ? bse : null;
    if (!book) continue;
    const symbol = key(row.trading_symbol);
    if (symbol && !book.has(symbol)) book.set(symbol, { isin: isinOf(row.isin), series: key(row.instrument_type), name: String(row.name || "").trim(), symbol });
    const lot = Number(row.lot_size) || 1;
    const lotKey = `${row.segment.slice(0, 3)}|${isinOf(row.isin)}`;
    if (isinOf(row.isin) && lot > (lots.get(lotKey) || 0)) lots.set(lotKey, lot);
  }
  if (nse.size < 4000 || bse.size < 8000) throw new Error(`Upstox cash book has ${nse.size} NSE and ${bse.size} BSE lines`);
  const nseByIsin = new Map();
  for (const line of nse.values()) if (line.isin && !nseByIsin.has(line.isin)) nseByIsin.set(line.isin, line);
  return { nse, bse, nseByIsin, lots };
}

async function nseEtfs() {
  const text = await (await get(NSE_ETFS, { Accept: "text/csv,*/*" })).text();
  const symbols = new Set();
  const isins = new Set();
  for (const row of parseCsv(text)) {
    if (row.Symbol) symbols.add(key(row.Symbol));
    if (isinOf(row.ISINNumber)) isins.add(isinOf(row.ISINNumber));
  }
  if (symbols.size < 250) throw new Error(`the NSE ETF list has ${symbols.size} lines`);
  return { symbols, isins };
}

async function bseActive() {
  const response = await get(BSE_ACTIVE, {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.bseindia.com/",
    Origin: "https://www.bseindia.com",
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  });
  const list = JSON.parse(await response.text());
  if (!Array.isArray(list) || list.length < 4000) throw new Error(`the BSE Active list has ${list?.length ?? "no"} scrips`);
  const byId = new Map();
  const byIsin = new Map();
  const byName = new Map();
  for (const scrip of list) {
    if (!("scrip_id" in scrip) || !("GROUP" in scrip) || !("ISIN_NUMBER" in scrip)) throw new Error("the BSE Active list changed shape");
    const line = { id: key(scrip.scrip_id), isin: isinOf(scrip.ISIN_NUMBER), group: key(scrip.GROUP), name: String(scrip.Scrip_Name || "").trim() };
    if (line.id) byId.set(line.id, line);
    if (line.isin) byIsin.set(line.isin, line);
    for (const name of new Set([words(scrip.Scrip_Name), words(scrip.Issuer_Name)])) {
      if (!name) continue;
      byName.set(name, byName.has(name) && byName.get(name) !== line ? null : line);
    }
  }
  return { byId, byIsin, byName };
}

// "AARADHYA-ST" is the symbol AARADHYA in the ST series.
function split(symbol) {
  const text = key(symbol);
  const hit = text.match(/^(.+)-([A-Z0-9]{1,2})$/);
  return hit ? { root: hit[1], suffix: hit[2], text } : { root: text, suffix: "", text };
}

const closed = await bseClosed();
const [names, book, etfs, bse] = [await directory(), await upstox(), await nseEtfs(), await bseActive()];

const rows = [];
const seen = new Set();
const leftOut = new Map();
const tally = (label) => leftOut.set(label, (leftOut.get(label) || 0) + 1);
const unmatched = { NSE: [], BSE: [] };

function push(exchange, ticker, directoryName, isin, type, group) {
  const id = `${exchange}|${isin}`;
  const name = bse.byIsin.get(isin)?.name || directoryName;
  if (seen.has(id)) {
    tally(`${exchange} repeats of one ISIN`);
    return;
  }
  seen.add(id);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange,
    mic: MIC[exchange],
    currency: "INR",
    type,
    isin,
    raw: [ticker, name, exchange, group, isin, type].filter(Boolean).join(" "),
  });
}

const nseIsinOf = new Map();
const bseIsinOf = new Map();
const nseMissed = [];

function nseRow(item, line, ticker) {
  const name = String(item.compName || "").replace(/\s+/g, " ").trim();
  if (debtIsin(line.isin)) {
    tally("NSE bonds and government securities");
    return;
  }
  let type = null;
  if (etfs.symbols.has(ticker) || (line.series === "EQ" && line.isin.startsWith("INF"))) type = "ETF";
  else if (NSE_TRUST.has(line.series) || NSE_SHARE.has(line.series)) type = "STOCK";
  if (!type) {
    tally(`NSE series ${line.series} lines`);
    return;
  }
  push("NSE", ticker, name, line.isin, type, "");
}

for (const item of names) {
  if (!item.nseSymbol) continue;
  const { root, suffix, text } = split(item.nseSymbol);
  if (suffix === "MF") {
    tally("NSE closed-end fund units");
    continue;
  }
  if (suffix === "SF") {
    tally("NSE specialised investment funds");
    continue;
  }
  const line = book.nse.get(text) || book.nse.get(root);
  if (!line || !line.isin) {
    nseMissed.push(item);
    continue;
  }
  nseIsinOf.set(item, line.isin);
  nseRow(item, line, book.nse.has(text) ? text : root);
}

for (const item of names) {
  const name = String(item.compName || "").replace(/\s+/g, " ").trim();
  if (!item.bseSymbol) continue;
  const { root, text } = split(item.bseSymbol);
  let scrip = bse.byId.get(text) || bse.byId.get(root);
  if (!scrip && nseIsinOf.has(item)) scrip = bse.byIsin.get(nseIsinOf.get(item));
  const fund = book.bse.get(text) || book.bse.get(root);
  if (!scrip && !fund?.isin) scrip = bse.byName.get(words(name)) || null;
  let isin;
  let group;
  let ticker;
  if (scrip) {
    ({ isin, group, id: ticker } = scrip);
    bseIsinOf.set(item, isin);
  } else if (fund?.isin) {
    ({ isin, series: group } = fund);
    ticker = book.bse.has(text) ? text : root;
    bseIsinOf.set(item, isin);
  } else {
    unmatched.BSE.push(text);
    continue;
  }
  if (debtIsin(isin) || group === "G") {
    tally("BSE bonds and government securities");
    continue;
  }
  if (closed.statusOf(isin, ticker)) {
    tally(`BSE ${closed.statusOf(isin, ticker)} scrips`);
    continue;
  }
  let type = null;
  if (isin.startsWith("INF")) {
    if (group === "E" || etfs.isins.has(isin) || /\bETF\b|ETF$|BEES/i.test(`${name} ${ticker}`)) type = "ETF";
  } else if (BSE_SHARE.has(group) || group === "IF" || group === "IT") type = "STOCK";
  else if (group === "E") type = "ETF";
  if (!type) {
    tally(isin.startsWith("INF") ? "BSE closed-end fund units" : `BSE group ${group} lines`);
    continue;
  }
  push("BSE", ticker, name, isin, type, group);
}

// An NSE symbol Univest prints in an older form (VASCON for VASCONEQ) is
// found through the ISIN of the same name's BSE line.
for (const item of nseMissed) {
  const line = book.nseByIsin.get(bseIsinOf.get(item));
  if (line) nseRow(item, line, line.symbol);
  else unmatched.NSE.push(key(item.nseSymbol));
}

// Each exchange's misses are names the directory keeps after they stopped
// trading there (suspended or delisted), and NSE SME names that Univest
// also prints with a BSE symbol although the BSE does not list them
// (AARADHYA, ACCORD: their NSE line is the ST series). In October 2026
// that was about 20 NSE and 250 BSE symbols. Many more means a look-up
// broke.
if (unmatched.NSE.length > 250) throw new Error(`${unmatched.NSE.length} NSE symbols found nowhere: ${unmatched.NSE.slice(0, 30).join(" ")}`);
if (unmatched.BSE.length > 400) throw new Error(`${unmatched.BSE.length} BSE symbols found nowhere: ${unmatched.BSE.slice(0, 30).join(" ")}`);
for (const [exchange, ticker, type] of [
  ["NSE", "RELIANCE", "STOCK"],
  ["BSE", "RELIANCE", "STOCK"],
  ["NSE", "NIFTYBEES", "ETF"],
  ["NSE", "GOLDBEES", "ETF"],
  ["BSE", "A1L", "STOCK"],
  ["NSE", "EMBASSY", "STOCK"],
]) {
  if (!rows.some((row) => row.exchange === exchange && row.ticker === ticker && row.type === type)) throw new Error(`${ticker} is not an ${exchange} ${type}`);
}
const count = (exchange, type) => rows.filter((row) => row.exchange === exchange && row.type === type).length;
if (count("NSE", "STOCK") < 2500 || count("BSE", "STOCK") < 4000 || count("NSE", "ETF") < 40) throw new Error("the book is short");

// A privately placed InvIT trades only in its lot (header).
let lotted = 0;
for (const row of rows) {
  const lot = book.lots.get(`${row.exchange}|${row.isin}`) || 1;
  if (row.type !== "STOCK" || lot <= 1 || !/^IN[EF].{4}2[35]/.test(row.isin)) continue;
  row.remark = `Privately placed InvIT: minimum trading lot ${lot.toLocaleString("en-US")} units.`;
  lotted += 1;
}
if (lotted > 60) throw new Error(`${lotted} InvIT or REIT rows trade in lots; the lot reading broke`);

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("univest-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(
  `${rows.length} listings from ${names.length} directory names (NSE ${count("NSE", "STOCK")} STOCK ${count("NSE", "ETF")} ETF, BSE ${count("BSE", "STOCK")} STOCK ${count("BSE", "ETF")} ETF). ` +
    `${lotted} privately placed InvIT rows remarked with their lot. Unmatched: NSE ${unmatched.NSE.length}, BSE ${unmatched.BSE.length}. Left out: ${[...leftOut].map(([label, n]) => `${n} ${label}`).join(", ")}.`,
);
