// What Chola Securities (India) sells in shares and ETFs, with no login.
// The FAQ on each stocks page says an account can "place buy or sell
// orders on any listed stock", so the book is the whole NSE and BSE cash
// book (the NSE equity list and the Upstox instrument file, both rebuilt
// each day), in the series and groups that take orders. SME lines (NSE
// SM/ST, BSE M/MT) and BSE X/XT are in it: Chola's own sector lists leave
// those companies out because they have no sector.
//
// The stocks section lists the companies Chola carries, sector by sector,
// on both exchanges; ETF is one sector (00000069). Those lists are read
// as a check and for the names. Each sector page fills its table from one
// page method that returns HTML rows, a name and a company code; the
// company page prints the NSE symbol, the BSE code and the ISIN. The
// server answers 500 to a burst, so calls go out two at a time and each
// answer is kept in chola-cache.jsonl; an answer older than a week is
// asked again. A company still in Chola's lists but not in today's cash
// book is suspended or delisted (Educomp, SKIL) and is not written.
//
// An INF ISIN is an ETF and every other line a STOCK; REITs and InvITs
// are units traded like shares. Debt series, iNAV lines, BSE F-group fund
// units and InvIT (IF) lines are not orders here. Chola quotes INR only.
//
// The cash book also carries lines that are not a share or an ETF sold
// today, and these are left out:
// - a BSE line with an INF ISIN that Chola does not list and that is not
//   in the NSE ETF list (eq_etfseclist.csv): those are Specialised
//   Investment Fund long-short units, segregated-portfolio side pockets
//   and closed-end scheme units in BSE group B, not ETFs;
// - a BSE line the BSE's own scrip status list (../lemonn/bseStatus.mjs)
//   has as Suspended or Delisted and not Active (the Nippon Capital
//   Builder units in October 2026);
// - an NSE rights entitlement (symbol ending -RE), and an NSE line whose
//   date of listing in EQUITY_L.csv is after today (it trades from then).
//
//   https://www.cholasecurities.com/pricing
//   https://www.cholasecurities.com/stocks
//   https://www.cholasecurities.com/stocks/stock-listing/etf/00000069
//   https://www.cholasecurities.com/Stocks/stock-listing.aspx/getstockslist
//   https://www.cholasecurities.com/stock-market/<name>/<company code>
//   https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
//   https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Suspended
//
//   node brokers/chola/chola_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { cashBook, keepSold, parseCsv } from "../../indianCash.mjs";
import { bseClosed } from "../lemonn/bseStatus.mjs";
import fs from "node:fs";

const SITE = "https://www.cholasecurities.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const ETF_SECTOR = "00000069";
// About 85% of the counts on 2026-10-21 (NSE 3466 with 355 ETFs, BSE 4670
// with 258 ETFs).
const FLOOR = { NSE: { all: 2900, etf: 300 }, BSE: { all: 4000, etf: 220 } };
const VENUE = { NSE: { exchange: "NSE", mic: "XNSE" }, BSE: { exchange: "BSE", mic: "XBOM" } };
const CACHE = new URL("chola-cache.jsonl", import.meta.url);
const WEEK = 7 * 24 * 3600 * 1000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NSE_EQUITY = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const NSE_ETFS = "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv";
const MONTH = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

const decode = (text) =>
  String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

async function getText(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, headers: { "User-Agent": UA, ...options.headers }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await pause(1_500 * (attempt + 1));
  }
  throw new Error(last);
}

// The NSE lists, read again for what the cash book does not keep: the
// date of listing of each EQUITY_L line and the ISINs of the NSE ETFs.
async function nseLists() {
  const equity = parseCsv(await getText(NSE_EQUITY));
  const etfs = parseCsv(await getText(NSE_ETFS));
  if (equity.length < 2000 || !("DATE OF LISTING" in equity[0]) || !("ISIN NUMBER" in equity[0])) throw new Error(`NSE EQUITY_L changed: ${equity.length} lines, columns ${Object.keys(equity[0] || {}).join(",")}`);
  if (etfs.length < 250 || !("ISINNumber" in etfs[0])) throw new Error(`NSE ETF list changed: ${etfs.length} lines, columns ${Object.keys(etfs[0] || {}).join(",")}`);
  // Today in India, as yyyymmdd.
  const today = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).replace(/-/g, ""));
  const later = new Set();
  for (const row of equity) {
    const match = String(row["DATE OF LISTING"]).trim().toUpperCase().match(/^(\d{2})-([A-Z]{3})-(\d{4})$/);
    if (!match || !MONTH[match[2]]) throw new Error(`NSE EQUITY_L date ${row["DATE OF LISTING"]} for ${row.SYMBOL}`);
    if (Number(match[3]) * 10000 + MONTH[match[2]] * 100 + Number(match[1]) > today) later.add(String(row["ISIN NUMBER"]).trim().toUpperCase());
  }
  const etfIsins = new Set(etfs.map((row) => String(row.ISINNumber).trim().toUpperCase()).filter(Boolean));
  return { later, etfIsins };
}

async function sectors() {
  const html = await getText(`${SITE}/stocks`);
  const found = new Map();
  for (const [, slug, code] of html.matchAll(/\/stocks\/stock-listing\/([a-z0-9-]+)\/(\d{8})/g)) found.set(code, slug);
  if (found.size < 80) throw new Error(`the stocks page links only ${found.size} sectors`);
  if (found.get(ETF_SECTOR) !== "etf") throw new Error(`sector ${ETF_SECTOR} is ${found.get(ETF_SECTOR) || "missing"}, not etf`);
  return found;
}

async function sectorList(exchange, code) {
  const text = await getText(`${SITE}/Stocks/stock-listing.aspx/getstockslist`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ _category: "sector", exchage: exchange, sectorcode: code, totalrows: "5000" }),
  });
  const html = JSON.parse(text)?.d;
  if (typeof html !== "string") throw new Error(`${exchange} sector ${code}: the answer has no rows`);
  const rows = [...html.matchAll(/<a href='\/corporateinfo-new\/([^']*)\/(\d+)'>([^<]*)<\/a>/g)].map(([, slug, company, name]) => ({ slug, company, name: decode(name) }));
  const lines = (html.match(/<tr>/g) || []).length;
  if (rows.length !== lines && !/No Stocks Found/.test(html)) throw new Error(`${exchange} sector ${code}: ${lines} table rows but ${rows.length} companies read`);
  return rows;
}

// The info strip of a company page: BSE code, NSE symbol, ISIN. Under
// load the server sometimes sends the page with the strip empty; that
// answer, like a page without the strip, is asked again.
function companyFacts(html) {
  if (!/class="info-tags"/.test(html)) return null;
  const field = (label) => decode(html.match(new RegExp(`<span>${label} : ([^<]*)</span>`))?.[1] || "");
  const facts = { bse: field("BSE Code"), nse: field("NSE Symbol").toUpperCase(), isin: field("ISIN Demat").toUpperCase() };
  return filled(facts) ? facts : null;
}

const filled = (facts) => Boolean(facts && (facts.isin || facts.nse || facts.bse));

// The server finds the company by its code. The name part of the link
// does not matter, and some list slugs send to /error, so it is fixed.
async function company(entry) {
  const url = `${SITE}/stock-market/company/${entry.company}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) {
        const facts = companyFacts(await response.text());
        if (facts) return facts;
      }
    } catch {}
    await pause(2_000 * (attempt + 1));
  }
  throw new Error(`${url} kept failing`);
}

async function companies(entries) {
  const out = new Map();
  if (fs.existsSync(CACHE)) {
    for (const line of fs.readFileSync(CACHE, "utf8").split("\n").filter(Boolean)) {
      try {
        const { at, company: code, facts } = JSON.parse(line);
        if (Date.now() - at < WEEK && code && filled(facts)) out.set(code, facts);
      } catch {}
    }
  }
  const todo = entries.filter((entry) => !out.has(entry.company));
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const entry = todo[next++];
      const facts = await company(entry);
      out.set(entry.company, facts);
      fs.appendFileSync(CACHE, `${JSON.stringify({ at: Date.now(), company: entry.company, facts })}\n`);
      await pause(150);
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
  return out;
}

const sectorCodes = await sectors();
const listed = { NSE: [], BSE: [] };
for (const exchange of Object.keys(listed)) {
  for (const [code, slug] of sectorCodes) {
    for (const row of await sectorList(exchange, code)) listed[exchange].push({ ...row, sector: slug, etf: code === ETF_SECTOR });
  }
  const etfs = listed[exchange].filter((row) => row.etf).length;
  if (listed[exchange].length < FLOOR[exchange].all) throw new Error(`${exchange} lists only ${listed[exchange].length} companies`);
  if (etfs < FLOOR[exchange].etf) throw new Error(`${exchange} lists only ${etfs} ETFs`);
}

const unique = new Map();
for (const row of [...listed.NSE, ...listed.BSE]) unique.set(row.company, row);
const facts = await companies([...unique.values()]);

// The book is the exchange's whole cash book: the FAQ on every stocks page
// says an account can "place buy or sell orders on any listed stock", and
// Chola's sector lists leave out SME (NSE SM/ST, BSE M/MT) and BSE X/XT
// companies that have no sector. A line is kept when its series or group is
// one that is ordered (indianCash.mjs) and it is not an iNAV or a debt ISIN,
// or when Chola lists it.
// An INF ISIN is an ETF; REITs and InvITs are units traded like shares.
// A line Chola lists itself is kept in any series, so its REIT and InvIT
// units on the BSE, the Bharat Bond and liquid ETFs and partly paid shares
// (IN9 ISINs) stay in.
const carried = new Set();
for (const exchange of Object.keys(listed)) {
  for (const row of listed[exchange]) carried.add(`${exchange}|${facts.get(row.company).isin}`);
}
const book = await cashBook();
const { later, etfIsins } = await nseLists();
const bse = await bseClosed();
const rows = [];
const seen = new Set();
const left = { fundUnit: 0, suspended: 0, delisted: 0, rights: 0, notYetListed: 0 };
for (const [key, entry] of book) {
  const [exchange, ticker] = key.split("|");
  const isin = entry.isin;
  if (!/^IN[A-Z0-9]{10}$/.test(isin)) continue;
  if (!keepSold(exchange, entry.series, ticker, isin) && !carried.has(`${exchange}|${isin}`)) continue;
  const line = `${exchange}|${isin}`;
  if (seen.has(line)) continue;
  if (exchange === "BSE") {
    const status = bse.statusOf(isin, ticker);
    if (status) { left[status] += 1; continue; }
    if (isin.startsWith("INF") && !carried.has(line) && !etfIsins.has(isin)) { left.fundUnit += 1; continue; }
  } else {
    if (/-RE$/.test(ticker)) { left.rights += 1; continue; }
    if (later.has(isin)) { left.notYetListed += 1; continue; }
  }
  seen.add(line);
  const type = isin.startsWith("INF") ? "ETF" : "STOCK";
  rows.push({ query: ticker, ticker, name: entry.name || ticker, exchange: VENUE[exchange].exchange, currency: "INR", type, isin, mic: VENUE[exchange].mic, raw: "" });
}

// Chola's own lists are the check: every company they carry that the
// exchange still trades must be in the book, under the same type, and the
// book may not run far past them. Their names are kept when they have one.
const byLine = new Map(rows.map((row) => [`${row.exchange}|${row.isin}`, row]));
const control = { listed: 0, absent: 0, typeClash: 0 };
for (const exchange of Object.keys(listed)) {
  for (const row of listed[exchange]) {
    const { isin } = facts.get(row.company);
    if (!/^IN[A-Z0-9]{10}$/.test(isin)) continue;
    const hit = byLine.get(`${exchange}|${isin}`);
    if (!hit) { control.absent += 1; continue; }
    control.listed += 1;
    if ((hit.type === "ETF") !== row.etf) control.typeClash += 1;
    hit.name = row.name;
    hit.sector = row.sector;
  }
}
for (const row of rows) row.raw = [row.ticker, row.name, row.exchange, row.isin, row.type, row.sector].filter(Boolean).join(" ");
for (const row of rows) delete row.sector;
for (const exchange of Object.keys(listed)) {
  const inBook = rows.filter((row) => row.exchange === exchange).length;
  if (inBook < FLOOR[exchange].all || inBook > 1.4 * listed[exchange].length) {
    throw new Error(`${exchange} book has ${inBook} lines against ${listed[exchange].length} in Chola's lists`);
  }
}
// About 75 lines were left out in October 2026; far more means a list
// went wrong.
if (left.fundUnit + left.suspended + left.delisted > 400) throw new Error(`${left.fundUnit} fund units, ${left.suspended} suspended, ${left.delisted} delisted BSE lines left out`);
if (control.typeClash > 5) throw new Error(`${control.typeClash} lines are ETF on one side and not the other`);
rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
const kept = withoutObligations(rows);
fs.writeFileSync(new URL("chola-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));

const count = (field) => Object.entries(kept.reduce((acc, row) => ({ ...acc, [row[field]]: (acc[row[field]] || 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ");
console.error(`${kept.length} listings (${count("type")}); ${count("exchange")}; in Chola's lists ${control.listed}, listed but not traded ${control.absent}, type clashes ${control.typeClash}; left out: ${left.fundUnit} BSE fund units not an ETF, ${left.suspended} BSE suspended, ${left.delisted} BSE delisted, ${left.rights} NSE rights entitlements, ${left.notYetListed} NSE lines listed after today`);
