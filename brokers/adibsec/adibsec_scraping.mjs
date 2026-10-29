// What ADIB Securities (Abu Dhabi Islamic Bank's brokerage, SCA licence
// 604041) sells in shares and ETFs, with no login. ADIB Securities deals
// only in Shari'a-compliant securities. Its "What you can trade" section
// says "You can Trade Shari'a Compliant Shares in Abu Dhabi Securities
// Exchange (ADX), Dubai Financial Market (DFM) and Nasdaq Dubai", and links
// one list per market as a PDF. The file names carry a date and change, so
// the links are read from the page each run, outside HTML comments.
//
//   ADX, DFM: the Unified Committee of Islamic Banks' list of compliant
//   companies (number, symbol, name). The ADX list also names the Chimera
//   and Lunate ETFs, each with its code and ISIN.
//   KSA, US: ADIB's own universe (name, ISIN, ticker), reached through
//   adibm.com/ksa-universe and adibm.com/us-universe.
//
// Each list is ADIB's universe for its place. Each line is then looked up
// on the exchange's own board: a line no longer traded there (delisted,
// merged, suspended) is left out and printed.
//   ADX: ../alwathbah/uaeBook.mjs adxListings (suspended lines out). Shares
//   by symbol, ETFs by the ISIN the list prints.
//   DFM: ../alwathbah/uaeBook.mjs dfmListings (inactive lines out).
//   RENAMED holds the symbols that differ on the board (ADX keeps ETISALAT
//   for e&; five DFM companies renamed since), each checked by hand on the
//   exchange and pinned to its ISIN.
//   Tadawul: ../investsky/tadawulBook.mjs (Main Market, suspended lines
//   out) and ./nomuBook.mjs (Nomu parallel market, suspended lines out). The
//   list holds Main Market and Nomu companies and REITs; a Nomu line is
//   written on "Nomu", with the remark that Nomu is for qualified investors
//   (a Capital Market Authority rule). A Nomu code found on neither board
//   whose company moved to the Main Market under a new code (Armah, 9590 to
//   6022) is found by its name. The ISIN is the list's.
//   United States: ../wellstrade/usBook.mjs, one row per title on its
//   primary listing (one NBBO market), matched by ISIN, then by ticker when
//   the two ISINs share the issuer code (a reverse split) or the names agree
//   (a new holding company); otherwise another company holds the symbol
//   (the list's "BYD" for BYD Co is Boyd Gaming). A line on no US exchange
//   is written on OTC Markets when OTC Markets' profile of its ticker, or of
//   the asset lists' OTC symbol for its ISIN, carries the same CUSIP or
//   name (./otcProfiles.mjs, cached 14 days in otc-profile-cache.json); any
//   tier is kept, the tier is in raw. The list's tickers end with a country
//   code ("MMM US", "YI KY"), which is dropped. Lines quoted only abroad
//   (Korean, Australian codes) and titles delisted since June are printed.
//
// Nasdaq Dubai is named as tradable, but its only list (31 March 2019) sits
// inside an HTML comment. The owner's rule then takes the whole Nasdaq
// Dubai listing less the named exception: only Shari'a-compliant shares.
// Compliance is taken from the exchange's own screen: DFM's Shari'a
// Classification List, which covers DFM and Nasdaq Dubai each quarter
// (DFM Fatwa & Shari'a Supervisory Board; the latest quarter is read). Its
// Nasdaq Dubai lines are crossed with the active Nasdaq Dubai shares of
// ../alwathbah/uaeBook.mjs nasdaqDubaiListings, each in its own currency.
//
// Bonds, sukuk and non-ETF funds are left out (the Chimera JP Morgan Global
// Sukuk ETF is an ETF and stays). Each line is priced in its market's
// currency: AED on ADX and DFM, SAR on Tadawul and Nomu, USD in the US, AED
// or USD on Nasdaq Dubai. Fees: the pricing page prints ADX and DFM in text
// and KSA and US as images; it prints no Nasdaq Dubai fee.
//
//   https://www.adibsecurities.ae/en/Pages/active_trading.aspx#what-trade
//   https://www.adibsecurities.ae/en/SiteAssets/ADX_As_on_31-12-2025.pdf   (at the time of writing)
//   https://www.adibsecurities.ae/en/SiteAssets/DFM_As_on_31-12-2025.pdf   (at the time of writing)
//   https://adibm.com/ksa-universe   -> /en/SiteAssets/Saudi_Universe_ADIB_June_2026.pdf
//   https://adibm.com/us-universe    -> /en/SiteAssets/US_Universe_ADIB_June_2026.pdf
//   https://www.adibsecurities.ae/en/Pages/pricing_services.aspx
//   https://www.dfm.ae/the-exchange/statistics-reports/sharia-classification-list
//   POST https://api2.dfm.ae/web/widgets/v1/data   Command=shariahlisting / shariahlistingdetails
//
// The PDFs are read with macOS PDFKit (osascript, JavaScript), line by line
// with each line's position, so the table columns are rebuilt by row.
//
//   node brokers/adibsec/adibsec_scraping.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { adxListings, dfmListings, nasdaqDubaiListings } from "../alwathbah/uaeBook.mjs";
import { tadawulBook } from "../investsky/tadawulBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { parseCsv } from "../mitsubishiufjesmart/japan.mjs";
import { nomuBook } from "./nomuBook.mjs";
import { otcProfiles } from "./otcProfiles.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SITE = "https://www.adibsecurities.ae";
const PAGE = `${SITE}/en/Pages/active_trading.aspx`;
const PRICING = `${SITE}/en/Pages/pricing_services.aspx`;
const DFM_API = "https://api2.dfm.ae/web/widgets/v1/data";
const NOMU_REMARK = "Nomu is for qualified investors only.";

// List symbol -> [board symbol, ISIN], checked by hand on the exchange.
const RENAMED = {
  ADX: {
    EAND: ["ETISALAT", "AEE000401019"], // e&: the ADX board keeps the old symbol
  },
  DFM: {
    SALAMBAH: ["SALAM_BAH", "BH000A0J2481"], // Al Salam Bank B.S.C
    OUTFL: ["ORIENTTKAFUL", "AEO000301010"], // Orient UNB Takaful, now Orient Takaful PJSC
    DARTAKAFUL: ["WATANIA", "AET000301019"], // Dar Al Takaful, now Watania International Holding
    ASCANA: ["SUKOONTAKAFL", "AEA001401016"], // Arabian Scandinavian Insurance, now Sukoon Takaful
    GULFNAV: ["ETIHADENERGY", "AEG000601019"], // Gulf Navigation Holding, now Etihad Energy Holding
  },
};
const FLOOR = { ADX: 40, "ADX ETF": 6, DFM: 35, "Nasdaq Dubai": 2, Tadawul: 220, Nomu: 70, US: 1500 };
const LIST_FLOOR = { ADX: 50, DFM: 40, KSA: 300, US: 1600 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isIsin = (value) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value);

async function get(url, { body, headers = {} } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: { "User-Agent": UA, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...headers },
        body,
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return { bytes: Buffer.from(await response.arrayBuffer()), url: response.url };
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}
const getText = async (url, options) => (await get(url, options)).bytes.toString("utf8");
const dfmJson = async (body) => JSON.parse(await getText(DFM_API, { body, headers: { Referer: "https://www.dfm.ae/" } }));

const textOf = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#160;|&nbsp;|​/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|’/g, "'")
    .replace(/\s+/g, " ");

// Every text line of a PDF with its page and position (PDF points, y up).
const JXA = `ObjC.import("PDFKit");
function run(argv) {
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  if (!doc || doc.isNil()) return "null";
  const out = [];
  for (let p = 0; p < doc.pageCount; p++) {
    const page = doc.pageAtIndex(p);
    const n = page.numberOfCharacters;
    if (!n) continue;
    const lines = page.selectionForRange($.NSMakeRange(0, n)).selectionsByLine;
    for (let i = 0; i < lines.count; i++) {
      const line = lines.objectAtIndex(i);
      const b = line.boundsForPage(page);
      out.push({ p, x: Math.round(b.origin.x), y: Math.round(b.origin.y), t: ObjC.unwrap(line.string) || "" });
    }
  }
  return JSON.stringify({ pages: Number(doc.pageCount), lines: out });
}`;

function pdfLines(bytes, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adibsec-"));
  const file = path.join(dir, "list.pdf");
  fs.writeFileSync(file, bytes);
  const result = spawnSync("osascript", ["-l", "JavaScript", "-", file], { input: JXA, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0) throw new Error(`PDFKit could not read the ${label} list: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  if (!parsed?.lines?.length) throw new Error(`the ${label} list has no text`);
  return parsed;
}

// Lines on the same page within 3 points of height are one table row,
// left to right.
function tableRows(lines) {
  const rows = [];
  for (const line of lines) {
    const t = clean(line.t);
    if (!t) continue;
    let row = rows.find((r) => r.p === line.p && Math.abs(r.y - line.y) <= 3);
    if (!row) rows.push((row = { p: line.p, y: line.y, cells: [] }));
    row.cells.push({ x: line.x, t });
  }
  rows.sort((a, b) => a.p - b.p || b.y - a.y);
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x);
  return rows;
}

// The Unified Committee's one-page list: "1 ADIB Abu Dhabi Islamic Bank"
// rows between the "Symbol Company Name Remarks" header and "Please note".
// The remarks column (right of x 420) is not read. An ETF line carries its
// own code and ISIN; the row that heads the ETF block ("40 CHIMERA") has
// no name.
function committeeList(bytes, label) {
  const { pages, lines } = pdfLines(bytes, label);
  if (pages !== 1) throw new Error(`the ${label} list has ${pages} pages, not 1`);
  const all = lines.map((line) => ({ ...line, t: clean(line.t) }));
  const asOf = all.map((line) => line.t.match(/^As on (\d{2}\/\d{2}\/\d{4})$/)?.[1]).find(Boolean);
  const head = all.find((line) => /^Symbol$/.test(line.t));
  const foot = all.find((line) => /^Please note the followings/.test(line.t));
  if (!asOf || !head || !foot) throw new Error(`the ${label} list lost its date, header or notes`);
  const body = all.filter((line) => line.y < head.y - 3 && line.y > foot.y + 3 && line.x < 420);
  const etfs = [];
  const rest = [];
  for (const line of body) {
    const found = line.t.match(/^"?-\s*(.+?)\s*-?\s*\(\s*([A-Z]+)\s*-\s*ISIN\s*:\s*([A-Z0-9]{12})\s*\)$/);
    if (found) etfs.push({ name: found[1], code: found[2], isin: found[3] });
    else rest.push(line);
  }
  const shares = [];
  const numbers = [];
  for (const row of tableRows(rest)) {
    const text = row.cells.map((cell) => cell.t).join(" ");
    const share = text.match(/^(\d+) ([A-Z][A-Z0-9_-]*) (.+)$/);
    const header = text.match(/^(\d+) ([A-Z][A-Z0-9_-]*)$/);
    if (share) {
      numbers.push(+share[1]);
      shares.push({ symbol: share[2], name: share[3] });
    } else if (header && etfs.length) numbers.push(+header[1]);
    else throw new Error(`unreadable ${label} row: ${text}`);
  }
  numbers.sort((a, b) => a - b);
  if (numbers.some((n, i) => n !== i + 1)) throw new Error(`the ${label} list numbers ${numbers.join(",")}`);
  for (const etf of etfs) if (!isIsin(etf.isin)) throw new Error(`${label} ETF ${etf.name} has ISIN ${etf.isin}`);
  return { asOf, shares, etfs, count: numbers.length };
}

// ADIB's universe: three columns, Name, ISIN, Ticker ("2222 SA", "MMM US").
function universeList(bytes, label) {
  const { lines } = pdfLines(bytes, label);
  const out = [];
  for (const row of tableRows(lines)) {
    const cells = row.cells.map((cell) => cell.t);
    if (cells.join(" ") === "Name ISIN Ticker" || cells.join(" ") === "# Internal") continue;
    if (cells.length !== 3 || !isIsin(cells[1]) || !/^\S.* [A-Z]{2}$/.test(cells[2])) throw new Error(`unreadable ${label} row: ${cells.join(" | ")}`);
    out.push({ name: cells[0], isin: cells[1], ticker: cells[2].replace(/ [A-Z]{2}$/, ""), country: cells[2].slice(-2) });
  }
  if (out.length < LIST_FLOOR[label]) throw new Error(`the ${label} list has ${out.length} lines`);
  return out;
}

// ---- The broker's pages.
const html = await getText(PAGE);
const page = textOf(html);
const pricing = textOf(await getText(PRICING));
for (const [text, pattern] of [
  [page, /You can Trade Shari'a Compliant Shares in Abu Dhabi Securities Exchange \(ADX\), Dubai Financial Market \(DFM\) and Nasdaq Dubai/],
  [page, /Increase your investment opportunities with TADAWUL[^.]*sharia compliant listed companies/i],
  [page, /investing in Sharia-compliant equities from various sectors on the world's largest stock market in the U\.S\./],
  [pricing, /DFM - Dubai Financial Market PJSC/],
  [pricing, /ADX - Abu Dhabi Securities Exchange The total commission is a maximum 0\.150%/],
  [pricing, /Broker Commission 0\.125%/],
]) {
  if (!pattern.test(text)) throw new Error(`${text === page ? PAGE : PRICING} no longer says ${pattern}`);
}
const pricingHtml = await getText(PRICING);
for (const image of ["Fees-KSA-EN", "Fees-US-EN"]) if (!pricingHtml.includes(image)) throw new Error(`${PRICING} no longer shows ${image}`);

// Links outside HTML comments only: the Nasdaq Dubai list of 2019 is commented out.
const live = html.replace(/<!--[\s\S]*?-->/g, " ");
const link = (pattern, what) => {
  const href = live.match(pattern)?.[1];
  if (!href) throw new Error(`${PAGE} no longer links the ${what} list`);
  return new URL(href.replace(/&amp;/g, "&"), PAGE).href;
};
const links = {
  ADX: link(/href="([^"]*\/ADX_As_on_[^"]+\.pdf)"/i, "ADX"),
  DFM: link(/href="([^"]*\/DFM_As_on_[^"]+\.pdf)"/i, "DFM"),
  KSA: link(/href="(https:\/\/adibm\.com\/ksa-universe[^"]*)"/i, "KSA"),
  US: link(/href="(https:\/\/adibm\.com\/us-universe[^"]*)"/i, "US"),
};
if (/href="[^"]*NASDAQ%20Dubai[^"]*\.pdf"/i.test(live)) console.error("adibsec: the page now links a Nasdaq Dubai list: read it instead of DFM's screen");

const files = {};
for (const [key, url] of Object.entries(links)) {
  const { bytes, url: landed } = await get(url);
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${url} is not a PDF`);
  files[key] = { bytes, url: landed.replace(/\?.*$/, "") };
}

const rows = [];
const leftOut = [];
const counted = (place) => rows.filter((row) => row.place === place).length;

// ---- ADX.
const adxList = committeeList(files.ADX.bytes, "ADX");
const adx = await adxListings();
{
  const bySymbol = new Map(adx.rows.map((row) => [row.ticker, row]));
  const byIsin = new Map(adx.rows.map((row) => [row.isin, row]));
  for (const line of adxList.shares) {
    const [symbol, isin] = RENAMED.ADX[line.symbol] || [line.symbol];
    const row = bySymbol.get(symbol);
    if (row && isin && row.isin !== isin) throw new Error(`ADX ${symbol} has ISIN ${row.isin}, not ${isin}`);
    if (!row) leftOut.push(`ADX ${line.symbol} ${line.name}: not traded on ADX (suspended or delisted)`);
    else if (row.type !== "STOCK") throw new Error(`ADX ${symbol} is ${row.type}`);
    else rows.push({ ...row, place: "ADX", raw: `${row.raw} | ADIB list ${line.symbol} ${line.name}` });
  }
  for (const etf of adxList.etfs) {
    const row = byIsin.get(etf.isin);
    if (!row) leftOut.push(`ADX ETF ${etf.code} ${etf.name} ${etf.isin}: not traded on ADX`);
    else if (row.type !== "ETF") throw new Error(`ADX ${etf.isin} is ${row.type}`);
    else rows.push({ ...row, place: "ADX", raw: `${row.raw} | ADIB list ${etf.code} ${etf.name}` });
  }
}

// ---- DFM.
const dfmList = committeeList(files.DFM.bytes, "DFM");
if (dfmList.etfs.length) throw new Error("the DFM list now names ETFs: read them");
const dfm = await dfmListings();
{
  const bySymbol = new Map(dfm.rows.map((row) => [row.ticker, row]));
  for (const line of dfmList.shares) {
    const [symbol, isin] = RENAMED.DFM[line.symbol] || [line.symbol];
    const row = bySymbol.get(symbol);
    if (row && isin && row.isin !== isin) throw new Error(`DFM ${symbol} has ISIN ${row.isin}, not ${isin}`);
    if (!row) leftOut.push(`DFM ${line.symbol} ${line.name}: not traded on DFM (inactive or delisted)`);
    else rows.push({ ...row, place: "DFM", raw: `${row.raw} | ADIB list ${line.symbol} ${line.name}` });
  }
}
for (const place of ["ADX", "DFM"]) {
  const list = place === "ADX" ? adxList : dfmList;
  const missing = leftOut.filter((line) => line.startsWith(`${place} `)).length;
  if (missing > (list.shares.length + list.etfs.length) / 4) throw new Error(`${missing} ${place} list lines are not on the board`);
}

// ---- Nasdaq Dubai: DFM's Shari'a Classification List, latest quarter.
const quarters = await dfmJson("Command=shariahlisting&Language=en");
const quarter = (Array.isArray(quarters) ? quarters : [])
  .filter((item) => item.exchanges?.includes("nasdaq"))
  .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
if (!quarter) throw new Error("DFM's Shari'a classification list names no Nasdaq Dubai quarter");
if (Date.now() - Date.parse(quarter.date) > 270 * 86_400_000) throw new Error(`DFM's latest Nasdaq Dubai Shari'a list is of ${quarter.date}`);
const screen = await dfmJson(`Command=shariahlistingdetails&year=${quarter.year}&quarter=${quarter.quarter}&exchange=nasdaq&Language=en`);
if (!Array.isArray(screen) || !screen.length) throw new Error("DFM's Nasdaq Dubai Shari'a list is empty");
const compliant = new Map();
for (const item of screen) {
  if (!item.symbol || !/compli/i.test(item.remarks)) throw new Error(`DFM Shari'a line ${JSON.stringify(item)}`);
  if (!/non[- ]?compli/i.test(item.remarks)) compliant.set(clean(item.symbol).toUpperCase(), clean(item.name));
}
const dubai = await nasdaqDubaiListings();
for (const row of dubai.rows) {
  if (row.type !== "STOCK") continue;
  if (compliant.has(row.ticker)) rows.push({ ...row, place: "Nasdaq Dubai", raw: `${row.raw} | DFM Shari'a list Q${quarter.quarter} ${quarter.year}` });
}
for (const [symbol, name] of compliant) {
  if (!rows.some((row) => row.place === "Nasdaq Dubai" && row.ticker === symbol)) leftOut.push(`Nasdaq Dubai ${symbol} ${name}: Shari'a-compliant but not an active share with an ISIN`);
}

// ---- Tadawul and Nomu.
const ksaList = universeList(files.KSA.bytes, "KSA");
const tadawul = await tadawulBook();
const nomu = await nomuBook();
{
  const main = new Map(tadawul.rows.map((row) => [row.ticker, row]));
  const nameKey = (name) =>
    clean(name)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(" ")
      .filter((word) => word && !/^(co|company|comp|cmpny|compny|the|sjsc|cjsc|scjsc|pjsc|jsc|for|and)$/.test(word))
      .slice(0, 2)
      .join(" ");
  const seen = new Set();
  for (const line of ksaList) {
    if (line.country !== "SA" || !/^\d{4}$/.test(line.ticker)) throw new Error(`KSA line ${line.ticker} ${line.country} ${line.name}`);
    if (seen.has(line.ticker)) continue;
    seen.add(line.ticker);
    const listed = main.get(line.ticker);
    if (listed) {
      if (listed.type !== "STOCK") throw new Error(`Tadawul ${line.ticker} is ${listed.type}`);
      rows.push({ ...listed, isin: line.isin, query: line.isin, place: "Tadawul", raw: `${listed.raw} | ${line.isin}` });
      continue;
    }
    const board = nomu.lines.get(line.ticker);
    if (board && !nomu.suspended.has(line.ticker)) {
      rows.push({
        query: line.isin,
        ticker: line.ticker,
        name: board.name,
        exchange: "Nomu",
        mic: "XSAU",
        currency: "SAR",
        type: "STOCK",
        isin: line.isin,
        remark: NOMU_REMARK,
        place: "Nomu",
        raw: [line.ticker, board.name, board.sector === "REITs" ? "REIT" : board.sector, "Nomu", "SAR", line.isin].join(" | "),
      });
      continue;
    }
    const suspension = nomu.suspended.get(line.ticker) || tadawul.suspended.find((text) => text.startsWith(`${line.ticker} `));
    if (suspension) {
      leftOut.push(`Tadawul ${line.ticker} ${line.name}: ${suspension}`);
      continue;
    }
    // A Nomu company that moved to the Main Market under a new code.
    const key = nameKey(line.name);
    const moved = tadawul.rows.filter((row) => row.type === "STOCK" && nameKey(row.name) === key && !ksaList.some((other) => other.ticker === row.ticker));
    if (moved.length === 1) {
      const [row] = moved;
      rows.push({ ...row, isin: line.isin, query: line.isin, place: "Tadawul", raw: `${row.raw} | ${line.isin} | ADIB list ${line.ticker} ${line.name}` });
      leftOut.push(`Tadawul ${line.ticker} ${line.name}: now ${row.ticker} on the Main Market (kept)`);
      continue;
    }
    leftOut.push(`Tadawul ${line.ticker} ${line.name}: on neither the Main Market nor Nomu`);
  }
}

// ---- United States.
const usList = universeList(files.US.bytes, "US");
const us = await usBook();
{
  const byIsin = new Map();
  for (const row of us) if (row.isin) byIsin.set(row.isin, byIsin.has(row.isin) ? null : row);
  const byTicker = new Map(us.map((row) => [row.ticker, row]));
  // The asset lists' OTC symbol of an ISIN, a second guess when ADIB's ticker
  // is not the OTC one (BYD Co is "BYD" in the list, BYDDY over the counter).
  const otcSymbol = new Map();
  for (const file of ["stocks.csv", "etfs.csv"]) {
    for (const [code, exchange, isin] of parseCsv(fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8")).slice(1)) {
      if (exchange === "OTC" && isIsin(isin)) otcSymbol.set(isin, otcSymbol.has(isin) ? null : String(code).split(":").pop().toUpperCase());
    }
  }
  const letters = (name) => clean(name).toLowerCase().replace(/^the /, "").replace(/[^a-z]/g, "").slice(0, 4);
  const sameName = (a, b) => letters(a).length === 4 && letters(a) === letters(b);
  const sameIssuer = (a, b) => isIsin(a) && isIsin(b) && a.slice(2, 8) === b.slice(2, 8);

  const pending = [];
  const seen = new Set();
  for (const line of usList) {
    const ticker = line.ticker.replace(/ PR ([A-Z])$/, ".PR$1");
    if (seen.has(`${line.isin} ${ticker}`)) continue;
    seen.add(`${line.isin} ${ticker}`);
    let listed = byIsin.get(line.isin);
    const byCode = /\s/.test(ticker) ? null : byTicker.get(ticker);
    // The same ticker is the same title when the ISINs share the issuer
    // (a reverse split) or the names agree (a new holding company); else
    // another company took the symbol (BYD Co's "BYD" is Boyd Gaming).
    if (!listed && byCode && (!byCode.isin || sameIssuer(byCode.isin, line.isin) || sameName(byCode.name, line.name))) listed = byCode;
    if (listed) {
      if (rows.some((row) => row.place === "US" && row.ticker === listed.ticker)) continue;
      const isin = listed.isin || line.isin;
      const { matches, ...rest } = listed;
      rows.push({ ...rest, isin, query: isin, place: "US", raw: `${listed.raw} | ADIB ${line.ticker} ${line.country} | ${line.name} | ${line.isin}` });
      continue;
    }
    pending.push({ ...line, candidates: [/\s/.test(ticker) ? "" : ticker, otcSymbol.get(line.isin) || ""].filter(Boolean) });
  }

  // Lines not on a US exchange: quoted over the counter, by OTC Markets'
  // profile of the list's ticker or of the asset lists' OTC symbol, when the
  // CUSIP or the name agrees.
  const profiles = await otcProfiles(pending.flatMap((line) => line.candidates));
  for (const line of pending) {
    const profile = line.candidates
      .map((symbol) => profiles.get(symbol))
      .find((entry) => entry && (entry.cusip === line.isin.slice(2, 11) || sameName(entry.name, line.name)));
    if (!profile) {
      leftOut.push(`US ${line.ticker} ${line.name} ${line.isin}: not listed on a US exchange nor quoted OTC`);
      continue;
    }
    if (rows.some((row) => row.place === "US" && row.ticker === profile.symbol)) continue;
    rows.push({
      query: line.isin,
      ticker: profile.symbol,
      name: line.name,
      exchange: "OTC Markets",
      mic: "OTCM",
      currency: "USD",
      type: /\bETF\b/i.test(profile.type) ? "ETF" : "STOCK",
      isin: line.isin,
      place: "US",
      raw: [`ADIB ${line.ticker} ${line.country}`, line.name, line.isin, "OTC Markets", profile.tier, profile.type, "USD"].join(" | "),
    });
  }
}

// ---- Checks and write.
for (const row of rows) {
  if (!["AED", "SAR", "USD"].includes(row.currency)) throw new Error(`${row.ticker} in ${row.currency}`);
  if (row.exchange !== "Nasdaq Dubai" && !resolveVenue(row).venue) throw new Error(`${row.ticker} on ${row.exchange} does not resolve`);
}
for (const [place, floor] of Object.entries(FLOOR)) {
  const n = place === "ADX ETF" ? rows.filter((row) => row.place === "ADX" && row.type === "ETF").length : counted(place);
  if (n < floor) throw new Error(`only ${n} ${place} rows`);
}
const kept = stampRows(withoutObligations(rows.map(({ place, ...row }) => row)));
if (kept.length !== rows.length) throw new Error(`withoutObligations dropped ${rows.length - kept.length} rows`);
fs.writeFileSync(new URL("adibsec-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of rows) count[`${row.place} ${row.type}`] = (count[`${row.place} ${row.type}`] || 0) + 1;
console.table(count);
for (const line of leftOut) console.error(`  left out: ${line}`);
console.error(
  `adibsec: ${kept.length} rows (ADX list ${adxList.asOf}, DFM list ${dfmList.asOf}, Nasdaq Dubai DFM Shari'a Q${quarter.quarter} ${quarter.year}, ` +
    `${files.KSA.url.split("/").pop()}, ${files.US.url.split("/").pop()}); ${leftOut.length} list lines left out or moved; ` +
    `Tadawul suspended ${tadawul.suspended.length}, Nomu suspended ${nomu.suspended.size}`
);
