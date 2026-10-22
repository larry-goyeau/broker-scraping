// What Atlass Portfolios (CITITRADER) sells on the Nigerian Exchange, with
// no login. Atlass is an NGX trading licence holder ("Trading Licence
// Holder of the Nigerian Exchange", the heading of its own price list) and
// deals on that exchange only. Its CitiTrader page says the platform lets
// investors "buy and sell shares of quoted companies on the Nigeria Stock
// Exchange", and its services page that it handles "the sales and purchases
// of shares and securities" for its clients: no share of the exchange is
// excluded. No page names REITs or any segment.
//
//   https://atlassportfolios.com/cititrader/
//   https://atlassportfolios.com/our-services/
//
// Its "Daily Price List" page links one PDF per session, "Daily Price List
// & Market Summary Report", whose "Price List" is the NGX board of the day
// under the heading NIGERIAN EXCHANGE: serial number and symbol, then the
// day's prices. The sheet prints a line only when it was quoted that day.
// The page links sheets back to 2023, but the server still serves only the
// recent ones (on 2026-10-21, 1 September 2026 onward; older links answer
// 404): the book reads every sheet still served from the last SINCE_DAYS
// days. Sheets do not change and are cached by file name in
// atlass-cache.json, a 404 included, so a run downloads only the new ones.
//
//   https://atlassportfolios.com/daily-price-list/
//     → /wp-content/uploads/<yyyy>/<mm>/Daily-Pricelist-<ddmmyyyy>.pdf
//
// A share quoted on the exchange that the sheets of the window do not
// show comes from the exchange's own equities list (Main, Growth, Premium
// and Non-Interest boards), the list behind ngxgroup.com's equities price
// list, but only when it can still be bought. The NGX Daily Official List
// (Equities) of the newest sheet's session gives each Main and Premium
// Board share its "Last Business Done" date: a share whose last trade is
// older than the oldest sheet of the window is left out, and so is one
// the equities list flags [DIP], "Delisting in Process". On 2026-10-22
// that left out eight: UNIVINSURE (last trade 19/08/26; NGX RegCo
// NGXREG/IRD/MB87/26/08/20: its shares "have been suspended from trading
// ... effective today, Thursday, 20 August 2026"), ALEX (21/07/26,
// suspended 22 Jul 2026 for not filing its FY2025 accounts), UNITYBNK
// (25/09/25; the Providus merger scheme says the shares will be "fully
// suspended and delisted"), GOLDBREW (05/05/25, suspended 6 May 2025),
// EKOCORP (09/06/22, [DIP]), AFRINSURE (30/06/22), AFROMEDIA and
// PHARMDEKO (10/07/23, suspended Jul 2023 for filing defaults). The Daily
// Official List does not print the Growth Board: its BAPLC and RONCHESS,
// quoted and unflagged though they have barely traded since they were
// listed in 2021 (prices still N6.25 and N81), stay.
//
//   https://ngxgroup.com/exchange/data/equities-price-list/
//   https://doclib.ngxgroup.com/REST/api/statistics/equities/?market=&sector=&orderby=&pageSize=300&pageNo=0
//   https://doclib.ngxgroup.com/DownloadsContent/Daily%20Official%20List%20-%20Equities%20for%20<dd-mm-yyyy>.pdf
//
// The REIT board ("Real Estate Investment Trust & Close End Fund":
// SFSREIT, UHREIT, UPDCREIT) is not written. It is never on Atlass's
// sheet, even on days it trades (on 2026-10-21 all three traded, UPDCREIT
// 2.26 million units, and the sheet of that day has none of them), and
// no Atlass page offers trusts. NREIT, the one REIT quoted on the Main
// Board, is on the sheets and stays.
//
// The sheet prints no name, no ISIN and no segment. Both come from the
// shared lists (stocks.csv and etfs.csv, NSENG); a symbol they do not know
// keeps itself as its name and stays without ISIN. A symbol that etfs.csv
// names an ETF is an ETF. Left out: the sukuk and FGN bonds (FGSUK…,
// TAJSUKS…), and the closed-end funds the lists file as fund "Units" or
// the exchange quotes on the Main Board (Coronation Infrastructure Fund
// CNIF, Chapel Hill Denham Infrastructure Debt Fund NIDF, MOFI Real Estate
// Investment Fund MOFIREIF, AVA Infrastructure Fund AVAIF).
//
// The PDF is read with PyMuPDF (pip install pymupdf), as Sharq's is.
//
//   node brokers/atlass/atlass_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const PAGE = "https://atlassportfolios.com/daily-price-list/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const CACHE = new URL("atlass-cache.json", import.meta.url);
const PLACE = "Nigerian Exchange";
const MIC = "XNGN";
const NGX_LIST = "https://doclib.ngxgroup.com/REST/api/statistics/equities/?market=&sector=&orderby=&pageSize=300&pageNo=0";
const NGX_PAGE = "https://ngxgroup.com/exchange/data/equities-price-list/";
const NGX_DOL = (dd, mm, yyyy) =>
  `https://doclib.ngxgroup.com/DownloadsContent/Daily%20Official%20List%20-%20Equities%20for%20${dd}-${mm}-${yyyy}.pdf`;
// The equities list's status flag for a share being delisted.
const NGX_DELISTING = /\[DIP\]/;
// The exchange's boards of shares; its REIT and closed-end fund board is
// not one (see above).
const NGX_SHARES = /^(Main Board|Growth Board|Premium Board|Non-Interest Finance Board)$/i;
const SINCE_DAYS = 183;
const MIN_SHEETS = 20;
const MAX_AGE_DAYS = 10;
const FLOOR = { sheet: 130, STOCK: 125, ETF: 10 };
const MUST = ["DANGCEM", "MTNN", "GTCO", "ZENITHBANK", "STANBICETF30", "NEWGOLD"];
const DEBT = /^FG[A-Z]*\d{4}|SUK/;
const FUNDS = { CNIF: "closed-end fund", NIDF: "closed-end fund", MOFIREIF: "closed-end fund", AVAIF: "closed-end fund" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A 404 answers null when `gone` is set: a sheet the server no longer keeps.
async function fetchRetry(url, { binary = false, gone = false, referer = PAGE } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Referer: referer },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
      if (gone && response.status === 404) return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function pdfLines(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
json.dump([l.strip() for page in doc for l in page.get_text().split("\\n") if l.strip()], sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.error || python.status !== 0) {
    const detail = python.stderr?.toString() || python.error?.message || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
  }
  return JSON.parse(python.stdout.toString());
}

// The price list runs "S/N, Symbol, PClose, Open, …" a cell a line; a
// serial number followed by a symbol starts a line. The market summary
// after it repeats symbols and is not read.
function sheetSymbols(lines, name) {
  if (!lines.includes("NIGERIAN EXCHANGE")) throw new Error(`${name} has no NIGERIAN EXCHANGE board`);
  const end = lines.indexOf("Market Summary");
  const body = end > 0 ? lines.slice(0, end) : lines;
  const symbols = [];
  let expected = 1;
  for (let i = 0; i + 1 < body.length; i += 1) {
    if (!/^\d{1,3}$/.test(body[i]) || !/^[A-Z][A-Z0-9]{1,15}$/.test(body[i + 1])) continue;
    if (Number(body[i]) !== expected) continue;
    symbols.push(body[i + 1]);
    expected += 1;
  }
  return symbols;
}

function listLines() {
  const found = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    const etf = file.includes("etfs");
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const match = line.match(/^NSENG:([^,]+),NSENG,([A-Z]{2}[A-Z0-9]{9}\d),(.*)$/);
      if (!match) continue;
      const ticker = match[1].trim().toUpperCase();
      if (!found.has(ticker)) found.set(ticker, []);
      found.get(ticker).push({ isin: match[2], name: match[3].replace(/^"|"$/g, "").trim(), etf });
    }
  }
  return found;
}

const page = await fetchRetry(PAGE);
const links = new Map();
for (const [, url, dd, mm, yyyy] of page.matchAll(
  /href="(https:\/\/atlassportfolios\.com\/wp-content\/uploads\/[^"]*Daily-Pricelist-(\d{2})(\d{2})(\d{4})[^"]*\.pdf)"/g
)) {
  const day = `${yyyy}-${mm}-${dd}`;
  if (!links.has(day)) links.set(day, url);
}
const latest = [...links.keys()].sort().at(-1);
const age = (Date.now() - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000;
if (!(age < MAX_AGE_DAYS)) throw new Error(`the newest sheet is dated ${latest}`);
const since = new Date(Date.parse(`${latest}T00:00:00Z`) - SINCE_DAYS * 86_400_000).toISOString().slice(0, 10);
const linked = [...links.keys()].filter((day) => day >= since).sort().reverse();

// The cache holds a sheet's symbols, or false for a link the server answers 404.
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const seen = new Map();
const days = [];
let fetched = 0;
for (const day of linked) {
  const url = links.get(day);
  let symbols = cache[url];
  if (!Array.isArray(symbols) && symbols !== false) {
    const bytes = await fetchRetry(url, { binary: true, gone: true });
    if (bytes === null || bytes.subarray(0, 5).toString() !== "%PDF-") {
      // WordPress answers its "Page not found" page for a removed upload.
      symbols = false;
    } else {
      symbols = sheetSymbols(pdfLines(bytes), url);
      if (symbols.length < FLOOR.sheet) throw new Error(`${url} lists only ${symbols.length} lines`);
      fetched += 1;
    }
    cache[url] = symbols;
    await sleep(500);
  }
  if (!symbols) continue;
  days.push(day);
  for (const symbol of symbols) if (!seen.has(symbol)) seen.set(symbol, day);
}
if (days.length < MIN_SHEETS) throw new Error(`the server serves only ${days.length} daily sheets since ${since}`);
if (days[0] !== latest) throw new Error(`the newest sheet (${latest}) is not served`);
const keep = new Set(linked.map((day) => links.get(day)));
for (const url of Object.keys(cache)) if (!keep.has(url)) delete cache[url];
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
const today = cache[links.get(latest)].length;
const fromSheets = seen.size;

// The exchange's own equities list: a share quoted there that the sheets
// of the window do not show.
const ngx = JSON.parse(await fetchRetry(NGX_LIST, { referer: NGX_PAGE }));
if (!Array.isArray(ngx) || ngx.length < 140) throw new Error(`the NGX equities list has ${ngx?.length} lines`);
const ngxBoard = new Map();
const ngxFlag = new Map();
for (const line of ngx) {
  const symbol = String(line.Symbol || "").trim().toUpperCase();
  if (!symbol) continue;
  ngxBoard.set(symbol, String(line.Market || "").trim());
  ngxFlag.set(symbol, String(line.Company2 || "").replace(symbol, "").trim());
}

// The Daily Official List of the newest sheet's session (or of the
// session before, when the exchange has not posted it yet): each share's
// "Last Business Done" date, the first full dd/mm/yy after its symbol and
// before the next symbol.
let dol = null;
let dolDay = null;
for (let back = 0; back < 7 && !dol; back += 1) {
  const day = new Date(Date.parse(`${latest}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
  const [yyyy, mm, dd] = day.split("-");
  const bytes = await fetchRetry(NGX_DOL(dd, mm, yyyy), { binary: true, gone: true, referer: NGX_PAGE });
  if (bytes && bytes.subarray(0, 5).toString() === "%PDF-") {
    dol = pdfLines(bytes);
    dolDay = day;
  }
  await sleep(500);
}
if (!dol || !dol[0]?.startsWith("Daily Official List (Equities)")) throw new Error(`no NGX Daily Official List since ${latest}`);
function lastTrade(symbol) {
  const at = dol.indexOf(symbol);
  if (at < 0) return undefined;
  for (let i = at + 1; i < Math.min(dol.length, at + 30); i += 1) {
    if (dol[i] === "Symbol" || (dol[i] !== symbol && ngxBoard.has(dol[i]))) break;
    const date = dol[i].match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (date) return `20${date[3]}-${date[2]}-${date[1]}`;
  }
  return null;
}
if (!lastTrade("DANGCEM")) throw new Error("the NGX Daily Official List has no date for DANGCEM");

const fromNgx = [];
const otherBoard = [];
const dormant = [];
for (const [symbol, board] of ngxBoard) {
  if (seen.has(symbol)) continue;
  if (!NGX_SHARES.test(board)) {
    otherBoard.push(symbol);
    continue;
  }
  const last = FUNDS[symbol] || DEBT.test(symbol) ? undefined : lastTrade(symbol);
  if (NGX_DELISTING.test(ngxFlag.get(symbol)) || (last !== undefined && !(last >= days.at(-1)))) {
    dormant.push(`${symbol} ${last || "never"}${ngxFlag.get(symbol) ? ` ${ngxFlag.get(symbol)}` : ""}`);
    continue;
  }
  fromNgx.push(symbol);
  seen.set(symbol, last === undefined ? null : last);
}

const lists = listLines();
const leftOut = new Map();
const tally = (label) => leftOut.set(label, (leftOut.get(label) || 0) + 1);
const rows = [];
for (const [ticker, day] of [...seen].sort(([left], [right]) => left.localeCompare(right))) {
  if (DEBT.test(ticker)) {
    tally("sukuk/bonds");
    continue;
  }
  if (FUNDS[ticker]) {
    tally(FUNDS[ticker]);
    continue;
  }
  const known = lists.get(ticker) || [];
  const hit = new Set(known.map((line) => line.isin)).size === 1 ? known[0] : null;
  if (hit?.etf && !/\bETF\b|exchange traded/i.test(hit.name)) {
    tally(`fund units (${ticker})`);
    continue;
  }
  const type = hit?.etf || (!hit && /ETF/.test(ticker)) ? "ETF" : "STOCK";
  rows.push({
    query: hit?.isin || ticker,
    ticker,
    name: hit?.name || ticker,
    exchange: PLACE,
    mic: MIC,
    currency: "NGN",
    type,
    ...(hit ? { isin: hit.isin } : {}),
    raw: [
      ticker,
      fromNgx.includes(ticker)
        ? `NGX ${ngxBoard.get(ticker)}, not on the sheets since ${days.at(-1)}${day ? `, last NGX trade ${day}` : ""}`
        : `last on the sheet ${day}`,
      PLACE,
    ].join(" | "),
  });
}

const count = { STOCK: 0, ETF: 0 };
for (const row of rows) count[row.type] += 1;
for (const [type, floor] of Object.entries(FLOOR)) {
  if (type !== "sheet" && count[type] < floor) throw new Error(`only ${count[type]} ${type} lines`);
}
for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("atlass-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
const withIsin = stamped.filter((row) => row.isin).length;
const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `${stamped.length} listings: ${PLACE} STOCK ${count.STOCK}, ETF ${count.ETF} (${days.length} sheets ${days.at(-1)}…${latest}, ` +
    `${today} lines on the newest, ${fetched} downloaded; ${fromSheets} symbols on the sheets, ${fromNgx.length} more from the NGX list: ` +
    `${fromNgx.join(" ") || "none"}; no NGX trade since ${days.at(-1)} per the ${dolDay} Daily Official List: ${dormant.join(", ") || "none"}); ` +
    `${withIsin} ISINs. Left out: ${skipped || "none"}; NGX REIT/fund board: ${otherBoard.join(" ") || "none"}.`
);
