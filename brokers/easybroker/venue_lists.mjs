// Shared by the Easybroker and AGORA direct scrapers (both introducing
// brokers of Interactive Brokers Ireland, both reading IBKR's public
// product lists). ../ibkrus/ibkr_exchange_lists.mjs already drops the
// dead lines of the US tape, OTC, Hong Kong, Stock Connect, London and the
// ASX. IBKR keeps dead, suspended, interim and never-tradable contracts on
// its other books too (TPAL on SIX, Activision in CHF, Swedish BTU lines,
// TSX when-issued lines, Indian partly-paid lines...). Each rule below
// keeps a row only when the exchange's own list still carries it; every
// list was read and compared with the IBKR books on 2026-10-21. A list
// that cannot be read, or whose columns move, stops the run: no rule is
// skipped silently.
//
// 1. Xetra and Frankfurt: the ISIN must be on Deutsche Börse's list of
//    tradable instruments with Product and Instrument Status "Active"
//    (PendingDeletion goes), in the row's currency.
//      https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra
//      (t7-xetr-allTradableInstruments.csv, and t7-xfra-BF-allTradableInstruments.csv
//      on the /boersefrankfurt page)
//    The same file types each product (ETF, ETC, ETN): a fund row whose
//    ISIN it lists takes that type (Xetra-Gold is an ETC, 21Shares
//    products are ETNs), and the EUWAX Gold bonds (DE000EWG...) are ETCs.
// 2. Stuttgart, gettex, Tradegate (shares only): a share whose ISIN is on
//    a European list read here (the Deutsche Börse files above, Cboe
//    Europe, the LSE price explorer, Euronext, SIX, Nasdaq Nordic) stays.
//    Any other share is asked of its own venue, live (rule 12): IBKR keeps
//    dead contracts there (Mead Johnson, acquired 2017), but also live
//    North American, Hong Kong and Indonesian second lines and Munich-only
//    shares (International School Augsburg) that no European list carries.
//    Funds are not touched there: regional-only ETPs such as EUWAX Gold
//    are real.
// 3. Cboe Europe: the ISIN must be "live" on Cboe's CXE, BXE or DXE
//    symbol file.
//      https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=cxe (bxe, dxe)
// 4. Turquoise and Aquis: an MTF only trades what is listed elsewhere, so
//    the ISIN must be on one of the lists of rule 2 (shares and funds).
// 5. SIX: the ISIN must be in SIX's reference data in the row's currency,
//    in the share, fund, ETP or structured-product segments (EQ, FU, EP,
//    DE: the UBS CMCI ETCs are DE). The old foreign-share lines in CHF
//    (Accor, Activision) and liquidated ETCs (TPAL) are not there.
//      https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency,PortalSegment&pagesize=999999
// 6. Euronext (Paris, Amsterdam, Brussels, Lisbon, Dublin, Milan, Oslo):
//    the ISIN must be on Euronext's share, ETF, ETV or fund download on a
//    market of that place, in the row's currency; Expert Market lines go.
//      https://live.euronext.com/en/pd_es/data/stocks/download (track, etv, funds)
// 7. Nasdaq Stockholm, Helsinki, Copenhagen: the line must be on the
//    Nasdaq Nordic screener of that market (main market, First North,
//    ETFs), or found by ISIN in Nasdaq Nordic's search in the row's
//    currency (the screeners leave out second listings and ETCs). A line
//    Nasdaq files under an interim symbol (unit right "BIOEX UR", BTU,
//    BTA, TR, TO) is no share for sale and goes. Spotlight and NGM shares IBKR files
//    under its Stockholm book are not Nasdaq Stockholm lines.
//      https://api.nasdaq.com/api/nordic/screener/shares?category=MAIN_MARKET&tableonly=false&market=STO
//      https://api.nasdaq.com/api/nordic/screener/etp?category=ETF&tableonly=false&market=STO
//      https://api.nasdaq.com/api/nordic/search?searchText=<ISIN>
// 8. Toronto and TSX Venture: the symbol must be in TMX's company
//    directory of that board. NEX lines (.H) are not in the directory and
//    are kept unchecked. A row on Cboe Canada, Pure or Alpha with the
//    same IBKR contract as a dropped Toronto line goes with it.
//      https://www.tsx.com/json/company-directory/search/tsx/%5E*
//      https://www.tsx.com/json/company-directory/search/tsxv/%5E*
// 9. NSE: the ISIN or symbol must be on the NSE's equity, SME, REIT or
//    InvIT list (long-suspended and partly-paid lines are not).
//      https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
//      https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv
//      https://nsearchives.nseindia.com/content/equities/REITS_L.csv
//      https://nsearchives.nseindia.com/content/equities/INVITS_L.csv
// 10. Tokyo: the code must be on the JPX month-end list (data_j.xlsx, read
//    by ../mitsubishiufjesmart/japan.mjs) or on JPX's new-listing page
//    with a listing date already past (IBKR files IPOs weeks ahead), and
//    not on JPX's delisting page with a delisting date already past. TOKYO PRO Market lines go: that
//    market is for professional ("specified") investors only.
//      https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//      https://www.jpx.co.jp/listing/stocks/new/index.html
//      https://www.jpx.co.jp/listing/stocks/delisted/index.html
// 11. London: a row whose only LSE line has no price is asked for that
//    line; a line on market "OTHERS" is an off-book reporting line with no
//    order book (OXA6 for XAD6 EUR) and goes.
//      https://api.londonstockexchange.com/api/v1/pages?path=live-markets/market-data-dashboard/price-explorer
//      https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>
// 12. A regional share of rule 2 that no European list carries is asked of
//    its own venue. Tradegate: the order-book page says "Die Gattung wird
//    derzeit nicht an der Tradegate BSX gehandelt" for a line it does not
//    trade. gettex: the share page fills its title with a bid and an ask;
//    a bid and an ask that stay at 0,00 for 8 seconds mean no market maker
//    quotes it. Stuttgart: the product
//    page of the ISIN answers 404 when the share is not listed there. A
//    venue that cannot be asked keeps the share only when its home line is
//    live: a US, Toronto, TSX Venture, Hong Kong or ASX row of the same ISIN
//    that the official lists (../ibkrus and rule 8) left in. The CSE and IDX
//    publish no list with ISINs, so their shares rest on the live check.
//      https://www.tradegate.de/orderbuch.php?isin=<ISIN>
//      https://www.gettex.de/aktie/<ISIN>/
//      https://www.boerse-stuttgart.de/de-de/produkte/aktien/stuttgart/<ISIN>/
//
// leftOutLine() names the contracts that are no share or fund for sale
// whatever the place: an ISIN with a wrong check digit (INE548CFAKE2),
// Spanish SIL hedge-fund company shares (IBKR files them as ETFs), test
// symbols, when-issued (W/I, .W) and subscription-receipt (.R) lines,
// partly-paid and buy-back lines, Swedish BTU interim units. Tender lines
// ("-TEND") are not dropped by name: Xetra lists CBK0 and DHE1 as active
// lines today; rule 1 drops the ones it does not list (A1O).

import { tokyoListing } from "../mitsubishiufjesmart/japan.mjs";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DB_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";
const DB_FILES = { XETR: [DB_PAGE, "t7-xetr-allTradableInstruments.csv", 4000], XFRA: [`${DB_PAGE}/boersefrankfurt`, "t7-xfra-BF-allTradableInstruments.csv", 30000] };
const CBOE = "https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=";
const SIX_REF = "https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency,PortalSegment&pagesize=999999";
const SIX_SEGMENTS = new Set(["EQ", "FU", "EP", "DE"]);
const EURONEXT = { stocks: 3000, track: 2500, etv: 500, funds: 1000 };
const EURONEXT_URL = "https://live.euronext.com/en/pd_es/data/";
const EURONEXT_PLACE = {
  XPAR: /Paris/,
  XAMS: /Amsterdam/,
  XBRU: /Brussels/,
  XLIS: /Lisbon/,
  XMSM: /Dublin/,
  XMIL: /Milan|ETF Plus|Global Equity Market|EuroTLX|Trading After Hours/,
  XOSL: /Oslo/,
};
const NORDIC = { XSTO: "STO", XHEL: "HEL", XCSE: "CPH" };
const NORDIC_FLOOR = { STO: 600, HEL: 120, CPH: 120 };
const NASDAQ = "https://api.nasdaq.com/api/nordic/";
// Nasdaq Nordic's symbols for unit rights, paid subscribed units and
// shares, subscription rights and warrants: "BIOEX UR", "ALZ BTU".
const NORDIC_INTERIM = /\s(UR|BTU|BTA|TR|TO\s?\d*)$/i;
const TSX = "https://www.tsx.com/json/company-directory/search/";
const NSE = [
  ["https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", 2000],
  ["https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv", 300],
  ["https://nsearchives.nseindia.com/content/equities/REITS_L.csv", 3],
  ["https://nsearchives.nseindia.com/content/equities/INVITS_L.csv", 3],
];
const JPX_NEW = "https://www.jpx.co.jp/listing/stocks/new/index.html";
const JPX_DELISTED = "https://www.jpx.co.jp/listing/stocks/delisted/index.html";
const LSE_HEADERS = { Accept: "application/json", Origin: "https://www.londonstockexchange.com", Referer: "https://www.londonstockexchange.com/" };
const LSE_EXPLORER = "https://api.londonstockexchange.com/api/v1/pages?path=live-markets/market-data-dashboard/price-explorer&parameters=";
const LSE_LINE = "https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/";

const REGIONAL = new Set(["XSTU", "XMUN", "XGAT"]);
// Venues whose rows the official lists have already checked (../ibkrus for
// the US tape, Hong Kong and the ASX, rule 8 for Toronto and TSX Venture).
const HOME_CHECKED = new Set(["XNYS", "XNAS", "XASE", "ARCX", "BATS", "TXSE", "XHKG", "XASX", "XTSE", "XTSX"]);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TRADEGATE = "https://www.tradegate.de/orderbuch.php?isin=";
const GETTEX = "https://www.gettex.de/aktie/";
const STUTTGART = "https://www.boerse-stuttgart.de";
const STUTTGART_PATH = "/de-de/produkte/aktien/stuttgart/";
const LIVE_CONTROLS = { yes: "US0378331005", no: "US5828391061" }; // Apple, Mead Johnson
const MTF = new Set(["TRQX", "AQXE"]);
const CANADA_COPIES = new Set(["NEOE", "PURE", "XATS"]);
const FUND_TYPES = new Set(["ETF", "ETC", "ETN"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const conidOf = (row) => String(row.raw || "").match(/conid (\d+)/)?.[1] || "";

async function get(url, { headers = {}, as = "text" } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return as === "json" ? response.json() : as === "bytes" ? Buffer.from(await response.arrayBuffer()) : response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// nseindia.com answers Node's fetch with 403 now and then; curl gets it.
function curl(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return execFileSync("curl", ["-s", "-f", "--max-time", "90", "-A", UA, url], { maxBuffer: 64 << 20 }).toString("utf8");
    } catch (error) {
      last = String(error.message || error);
    }
  }
  throw new Error(`${url}: ${last}`);
}

// ---- the contract itself -------------------------------------------------

export function isinCheckDigitOk(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = [...isin].map((char) => (/\d/.test(char) ? char : String(char.charCodeAt(0) - 55))).join("");
  let sum = 0;
  for (let at = digits.length - 1, double = false; at >= 0; at -= 1, double = !double) {
    let value = Number(digits[at]);
    if (double) value *= 2;
    sum += value > 9 ? value - 9 : value;
  }
  return sum % 10 === 0;
}

// Why an IBKR product is no share or fund for sale, or "".
export function leftOutLine(product) {
  const symbol = normalize(product.symbol).toUpperCase();
  const name = normalize(product.description).toUpperCase();
  const isin = normalize(product.isin).toUpperCase();
  const currency = normalize(product.currency).toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) && !isinCheckDigitOk(isin)) return "ISIN with a wrong check digit";
  if (isin.startsWith("ES") && (/\bSIL\b/.test(name) || /^SL\d{3}$/.test(symbol))) return "Spanish SIL (hedge-fund company share)";
  if (product.type !== "STK") return "";
  if (/\bTEST SYMBOL\b/.test(name)) return "test symbol";
  if (/\bW\/I\b/.test(name) || (currency === "CAD" && /^[A-Z0-9]+\.W$/.test(symbol))) return "when-issued line (W/I)";
  if (/\bSUB(SCRIPTION)?[ -]?(RCPTS?|RCT|RECEIPTS?)\b/.test(name) || (currency === "CAD" && /^[A-Z0-9]+\.R$/.test(symbol))) return "subscription receipt";
  if (/\bPARTLY\b|-\s?PP$/.test(name)) return "partly-paid line";
  if (/\bBUY BACK\b/.test(name)) return "buy-back window line";
  if (currency === "SEK" && (/BTU\d*$/.test(symbol) || /\bBTU\b/.test(name))) return "Swedish interim unit (BTU)";
  return "";
}

// ---- the lists -----------------------------------------------------------

function semicolonCells(line) {
  return (line.match(/("[^"]*"|[^;]*)(;|$)/g) || []).map((cell) => cell.replace(/;$/, "").replace(/^"|"$/g, "").trim());
}

// ISIN -> [{ currency, type, status }] of the active lines.
async function deutscheBoerse(mic) {
  const [page, file, least] = DB_FILES[mic];
  const href = (await get(page)).match(new RegExp(`href="([^"]*${file.replace(/\./g, "\\.")})"`))?.[1];
  if (!href) throw new Error(`${page} no longer links ${file}`);
  const lines = (await get(new URL(href, page).href)).split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("Product Status;"));
  const header = (lines[at] || "").split(";");
  const [product, status, isinAt, currencyAt, typeAt] = ["Product Status", "Instrument Status", "ISIN", "Currency", "Instrument Type"].map((column) => header.indexOf(column));
  if ([product, status, isinAt, currencyAt, typeAt].some((index) => index < 0)) throw new Error(`${file}: columns moved`);
  const out = new Map();
  let active = 0;
  for (const line of lines.slice(at + 1)) {
    const cells = line.split(";");
    if (cells[product] !== "Active" || cells[status] !== "Active" || !cells[isinAt]) continue;
    active += 1;
    out.set(cells[isinAt], [...(out.get(cells[isinAt]) || []), { currency: cells[currencyAt], type: cells[typeAt] }]);
  }
  if (active < least) throw new Error(`${file}: only ${active} active lines`);
  return out;
}

async function cboeLive() {
  const live = new Set();
  for (const market of ["cxe", "bxe", "dxe"]) {
    const lines = (await get(CBOE + market)).split(/\r?\n/);
    const header = (lines[1] || "").split(",");
    const [isinAt, liveAt] = ["isin", "live"].map((column) => header.indexOf(column));
    if (!/^environment=PROD/.test(lines[0] || "") || isinAt < 0 || liveAt < 0) throw new Error(`the Cboe ${market} symbol file changed`);
    let count = 0;
    for (const line of lines.slice(2)) {
      // Company names with a comma are quoted.
      const cells = line.match(/("[^"]*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "")) || [];
      if (cells[liveAt] === "t" && cells[isinAt]) {
        live.add(cells[isinAt]);
        count += 1;
      }
    }
    if (count < 3000) throw new Error(`the Cboe ${market} symbol file has ${count} live lines`);
  }
  return live;
}

// ISIN -> currencies of its SIX lines in the segments kept.
async function sixLines() {
  const [head, ...lines] = (await get(SIX_REF)).trim().split(/\r?\n/);
  if (head !== "ISIN;ValorSymbol;TradingBaseCurrency;PortalSegment") throw new Error(`SIX reference header changed: ${head}`);
  const out = new Map();
  for (const line of lines) {
    const [isin, , currency, segment] = line.split(";");
    if (!SIX_SEGMENTS.has(segment)) continue;
    out.set(isin, new Set([...(out.get(isin) || []), currency]));
  }
  if (out.size < 3000) throw new Error(`SIX reference data gave ${out.size} ISINs`);
  return out;
}

// ISIN -> [{ market, currency }] over the share, ETF, ETV and fund files.
async function euronextLines() {
  const out = new Map();
  for (const [file, least] of Object.entries(EURONEXT)) {
    const lines = (await get(`${EURONEXT_URL}${file}/download`)).replace(/^﻿/, "").split(/\r?\n/);
    const header = semicolonCells(lines[0] || "");
    const [isinAt, marketAt, currencyAt] = ["ISIN", "Market", "Currency"].map((column) => header.indexOf(column));
    if (isinAt < 0 || marketAt < 0 || currencyAt < 0) throw new Error(`Euronext ${file} download: columns moved`);
    let count = 0;
    for (const line of lines.slice(4)) {
      const cells = semicolonCells(line);
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(cells[isinAt] || "")) continue;
      count += 1;
      out.set(cells[isinAt], [...(out.get(cells[isinAt]) || []), { market: cells[marketAt], currency: cells[currencyAt] }]);
    }
    if (count < least) throw new Error(`Euronext ${file} download has ${count} lines`);
  }
  return out;
}

// market -> ISIN -> [{ currency, symbol }], from the share and ETF screeners.
async function nordicLines() {
  const out = {};
  for (const market of Object.values(NORDIC)) {
    const lines = new Map();
    for (const path of ["shares?category=MAIN_MARKET", "shares?category=FIRST_NORTH", "etp?category=ETF"]) {
      const body = await get(`${NASDAQ}screener/${path}&tableonly=false&market=${market}`, { headers: { Accept: "application/json" }, as: "json" });
      const rows = body?.data?.instrumentListing?.rows;
      if (!Array.isArray(rows)) throw new Error(`Nasdaq Nordic ${path} ${market}: no instrument list`);
      for (const row of rows) if (row.isin) lines.set(row.isin, [...(lines.get(row.isin) || []), { currency: row.currency, symbol: row.symbol }]);
      await sleep(800);
    }
    if (lines.size < NORDIC_FLOOR[market]) throw new Error(`Nasdaq Nordic ${market}: only ${lines.size} lines`);
    out[market] = lines;
  }
  return out;
}

// The lines ({ currency, symbol }) Nasdaq Nordic's search gives for one ISIN.
async function nordicSearch(isin) {
  const body = await get(`${NASDAQ}search?searchText=${encodeURIComponent(isin)}`, { headers: { Accept: "application/json" }, as: "json" });
  if (body?.status?.rCode !== 200) throw new Error(`Nasdaq Nordic search answered ${JSON.stringify(body?.status)}`);
  if (body.data == null) return [];
  if (!Array.isArray(body.data)) throw new Error("Nasdaq Nordic search: data is not a list");
  return body.data.flatMap((group) => group.instruments || []).filter((item) => item.isin === isin).map((item) => ({ currency: item.currency, symbol: item.symbol }));
}

async function tsxSymbols(board, least) {
  const body = await get(`${TSX}${board}/%5E*`, { as: "json" });
  if (!Array.isArray(body?.results)) throw new Error(`the TMX ${board} directory has no results list`);
  const symbols = new Set(body.results.flatMap((company) => company.instruments || []).map((item) => item.symbol));
  if (symbols.size < least) throw new Error(`the TMX ${board} directory gave ${symbols.size} symbols`);
  return symbols;
}

async function nseLists() {
  const isins = new Set();
  const symbols = new Set();
  for (const [url, least] of NSE) {
    const lines = curl(url).trim().split(/\r?\n/);
    const header = lines[0].split(",").map((cell) => cell.trim().replace(/_/g, " "));
    const [symbolAt, isinAt] = ["SYMBOL", "ISIN NUMBER"].map((column) => header.indexOf(column));
    if (symbolAt < 0 || isinAt < 0) throw new Error(`${url}: columns moved`);
    let count = 0;
    for (const line of lines.slice(1)) {
      const cells = line.split(",").map((cell) => cell.trim());
      if (!/^IN[A-Z0-9]{10}$/.test(cells[isinAt] || "")) continue;
      isins.add(cells[isinAt]);
      symbols.add(cells[symbolAt]);
      count += 1;
    }
    if (count < least) throw new Error(`${url} has ${count} lines`);
  }
  return { isins, symbols };
}

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "/");

// code -> "listed" / "PRO Market" / "delisted" / "not listed yet" from the
// JPX file and pages.
async function tokyoCodes() {
  const codes = new Map();
  for (const line of await tokyoListing()) codes.set(line.code, line.section === "PRO Market" ? "PRO Market" : "listed");
  const now = today();
  const fresh = await get(JPX_NEW);
  let added = 0;
  for (const block of fresh.split(/<tr>/).slice(1)) {
    const date = block.match(/(\d{4}\/\d{2}\/\d{2})<br/)?.[1];
    const code = block.match(/<span id="([0-9A-Z]{4,5})"><\/span>/)?.[1];
    if (!date || !code || codes.has(code)) continue;
    codes.set(code, date <= now ? "listed" : "not listed yet");
    if (date <= now) added += 1;
  }
  if (!/<span id="[0-9A-Z]{4}"><\/span>/.test(fresh)) throw new Error("the JPX new-listing page lists no code");
  const gone = await get(JPX_DELISTED);
  let delisted = 0;
  for (const match of gone.matchAll(/<td class="a-center w-space">(\d{4}\/\d{2}\/\d{2})<\/td>\s*<td[^>]*>[\s\S]*?<\/td>\s*<td class="a-center">([0-9A-Z]{4,5})<\/td>/g)) {
    if (match[1] <= now) {
      codes.set(match[2], "delisted");
      delisted += 1;
    }
  }
  if (!/上場廃止日/.test(gone) || delisted < 10) throw new Error(`the JPX delisting page gave ${delisted} past delistings`);
  return { codes, added, delisted };
}

async function lseExplorer() {
  const lines = [];
  let total = null;
  for (let number = 0; number < 40; number += 1) {
    const page = await get(LSE_EXPLORER + encodeURIComponent(`categories=EQUITY,ETFS&size=1000&page=${number}`), { headers: LSE_HEADERS, as: "json" });
    const block = (page?.components || []).flatMap((component) => component.content || []).find((item) => item.name === "priceexplorersearch")?.value;
    if (!block || !Array.isArray(block.content)) throw new Error("the LSE price explorer answered no list");
    total ??= block.totalElements;
    lines.push(...block.content);
    if (block.content.length < 1000 || lines.length >= total) break;
    await sleep(2000);
  }
  if (lines.length !== total || lines.length < 8000) throw new Error(`the LSE price explorer has ${lines.length} of ${total} lines`);
  return lines;
}

// ---- the pass ------------------------------------------------------------

// Drops, in place, the rows the rules above leave out, retypes fund rows
// from the Deutsche Börse type, and returns what it did.
// Rule 12: ask each venue whether it trades a share. Returns a Map of
// "<mic>|<ISIN>" to true / false, or no entry when the page gave no answer.
// The controls (Apple yes, Mead Johnson no) must answer as expected on each
// venue asked, or the run stops: a page that changed would otherwise drop
// or keep everything.
async function tradegateTrades(isin) {
  const html = await get(TRADEGATE + isin);
  if (/nicht an der Tradegate BSX gehandelt/.test(html)) return false;
  if (html.includes(isin) || /<h2[^>]*>[^<]+<\/h2>/.test(html)) return true;
  return undefined;
}

async function regionalLive(rows) {
  const verdicts = new Map();
  const isins = (mic) => [...new Set(rows.filter((row) => row.mic === mic).map((row) => row.isin))];
  const gate = isins("XGAT");
  if (gate.length) {
    if ((await tradegateTrades(LIVE_CONTROLS.yes)) !== true || (await tradegateTrades(LIVE_CONTROLS.no)) !== false) throw new Error("the Tradegate order-book page no longer tells traded from not traded");
    for (const isin of gate) {
      verdicts.set(`XGAT|${isin}`, await tradegateTrades(isin));
      await sleep(300);
    }
  }
  const gettex = isins("XMUN");
  const stuttgart = isins("XSTU");
  if (!gettex.length && !stuttgart.length) return verdicts;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });
  try {
    if (gettex.length) {
      // A fresh tab per share: the gettex page sometimes swaps its frame
      // while the quote loads, and a tab whose frame went away cannot be
      // read again. A share whose page fails twice gets no answer.
      const ask = async (isin) => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const page = await browser.newPage();
          try {
            await page.setUserAgent(UA);
            return await quote(page, isin);
          } catch {
            await sleep(1000);
          } finally {
            await page.close().catch(() => {});
          }
        }
        return undefined;
      };
      const quote = async (page, isin) => {
        await page.goto(`${GETTEX}${isin}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        try {
          await page.waitForFunction(() => !document.title.startsWith("{BID}"), { timeout: 20_000 });
        } catch {
          return undefined;
        }
        // The first title can be a placeholder 0,00 / -0,00 before the
        // quote arrives (Northern Data, Tick Trading): only a quote that
        // stays at zero for 8 seconds counts as none.
        for (let tick = 0; tick < 16; tick += 1) {
          const [bid, ask] = (await page.title()).split(" | ").map((part) => Number(part.replace(/\./g, "").replace(",", ".")));
          if (!Number.isFinite(bid) || !Number.isFinite(ask)) return undefined;
          if (bid > 0 || ask > 0) return true;
          await sleep(500);
        }
        return false;
      };
      if ((await ask(LIVE_CONTROLS.yes)) !== true) throw new Error("gettex shows no quote for Apple: run during gettex hours (07:30-23:00 CET) or the page changed");
      for (const isin of gettex) verdicts.set(`XMUN|${isin}`, await ask(isin));
    }
    if (stuttgart.length) {
      const page = await browser.newPage();
      await page.setUserAgent(UA);
      await page.goto(`${STUTTGART}${STUTTGART_PATH}${LIVE_CONTROLS.yes}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const status = (isin) => page.evaluate(async (path) => (await fetch(path, { redirect: "follow" })).status, `${STUTTGART_PATH}${isin}/`);
      if ((await status(LIVE_CONTROLS.yes)) !== 200 || (await status(LIVE_CONTROLS.no)) !== 404) throw new Error("the Börse Stuttgart product page no longer tells listed from not listed");
      for (const isin of stuttgart) {
        const code = await status(isin);
        verdicts.set(`XSTU|${isin}`, code === 200 ? true : code === 404 ? false : undefined);
        await sleep(200);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return verdicts;
}

export async function pruneByVenueLists(rows) {
  const dropped = new Map();
  const out = new Map();
  const drop = (row, reason) => {
    if (out.has(row)) return;
    out.set(row, reason);
    const entry = dropped.get(reason) || { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 4) entry.examples.push(row.ticker);
    dropped.set(reason, entry);
  };
  const notes = [];
  const has = (mics) => rows.some((row) => mics.has(row.mic));

  const db = { XETR: await deutscheBoerse("XETR"), XFRA: await deutscheBoerse("XFRA") };
  const cboe = await cboeLive();
  const six = await sixLines();
  const euronext = await euronextLines();
  const nordic = await nordicLines();
  const lse = await lseExplorer();

  // Every ISIN still listed on a list read here (rules 2 and 4).
  const listed = new Set([...db.XETR.keys(), ...db.XFRA.keys(), ...cboe, ...six.keys(), ...lse.map((line) => line.isin)]);
  for (const [isin, lines] of euronext) if (lines.some((line) => !/Expert Market/.test(line.market))) listed.add(isin);
  for (const lines of Object.values(nordic)) for (const isin of lines.keys()) listed.add(isin);

  // Fund types from Deutsche Börse (rule 1).
  const dbType = new Map();
  for (const file of Object.values(db)) for (const [isin, lines] of file) for (const line of lines) if (FUND_TYPES.has(line.type)) dbType.set(isin, [...new Set([...(dbType.get(isin) || []), line.type])]);
  let retyped = 0;
  for (const row of rows) {
    if (!FUND_TYPES.has(row.type)) continue;
    const types = dbType.get(row.isin);
    const type = types?.length === 1 ? types[0] : /^DE000EWG/.test(row.isin) ? "ETC" : "";
    if (type && type !== row.type) {
      row.type = type;
      retyped += 1;
    }
  }

  const regional = [];
  for (const row of rows) {
    const { mic, isin, currency } = row;
    if (mic === "XETR" || mic === "XFRA") {
      const lines = db[mic].get(isin) || [];
      const place = mic === "XETR" ? "Xetra" : "Frankfurt";
      if (!lines.length) drop(row, `${place}: not Active on the Deutsche Börse list`);
      else if (!lines.some((line) => line.currency === currency)) drop(row, `${place}: no ${currency} line`);
    } else if (REGIONAL.has(mic)) {
      if (row.type === "STOCK" && !listed.has(isin)) regional.push(row);
    } else if (mic === "CHIX") {
      if (!cboe.has(isin)) drop(row, "Cboe Europe: not live");
    } else if (MTF.has(mic)) {
      if (!listed.has(isin)) drop(row, `${row.exchange}: listed on no exchange list`);
    } else if (mic === "XSWX") {
      const currencies = six.get(isin);
      if (!currencies) drop(row, "SIX: not in the reference data");
      else if (!currencies.has(currency)) drop(row, `SIX: no ${currency} line`);
    } else if (EURONEXT_PLACE[mic]) {
      const lines = (euronext.get(isin) || []).filter((line) => EURONEXT_PLACE[mic].test(line.market) && !/Expert Market/.test(line.market));
      if (!lines.length) drop(row, `Euronext: not on the ${row.exchange} lists`);
      else if (!lines.some((line) => line.currency === currency || line.currency === "-")) drop(row, `Euronext: no ${currency} line`);
    }
  }

  // Rule 7: Nasdaq Nordic; a line the screeners miss (Ericsson B in EUR on
  // Helsinki, ETCs) is searched by ISIN.
  const searches = [];
  for (const row of rows) {
    const market = NORDIC[row.mic];
    if (!market || out.has(row)) continue;
    const lines = (nordic[market].get(row.isin) || []).filter((line) => line.currency === row.currency);
    if (!lines.length) searches.push(row);
    else if (lines.every((line) => NORDIC_INTERIM.test(line.symbol))) drop(row, "Nasdaq Nordic: unit right or interim line (UR, BTU, BTA, TR, TO)");
  }
  if (searches.length > 600) throw new Error(`${searches.length} Nordic rows to search: the screeners changed`);
  const searched = new Map();
  for (const row of searches) {
    if (!searched.has(row.isin)) {
      searched.set(row.isin, await nordicSearch(row.isin));
      await sleep(400);
    }
    const lines = searched.get(row.isin).filter((line) => line.currency === row.currency);
    if (!lines.length) drop(row, `Nasdaq Nordic: no ${row.currency} line (not a ${row.exchange} line)`);
    else if (lines.every((line) => NORDIC_INTERIM.test(line.symbol))) drop(row, "Nasdaq Nordic: unit right or interim line (UR, BTU, BTA, TR, TO)");
  }

  // Rule 8: Toronto and TSX Venture, then the Canadian copies.
  const deadCanada = new Map();
  if (has(new Set(["XTSE", "XTSX"]))) {
    const boards = { XTSE: await tsxSymbols("tsx", 2000), XTSX: await tsxSymbols("tsxv", 1000) };
    let nex = 0;
    for (const row of rows) {
      if (!boards[row.mic]) continue;
      const symbol = normalize(row.ticker).toUpperCase();
      if (/\.H(\.NE)?$/.test(symbol)) {
        nex += 1;
        continue;
      }
      if (!boards[row.mic].has(symbol)) {
        drop(row, `TMX: not in the ${row.exchange} directory`);
        if (conidOf(row)) deadCanada.set(conidOf(row), row.exchange);
      }
    }
    if (nex) notes.push(`${nex} NEX (.H) rows kept unchecked`);
    for (const row of rows) if (CANADA_COPIES.has(row.mic) && deadCanada.has(conidOf(row))) drop(row, `copy of a line not in the TMX directory`);
  }

  // Rule 9: NSE.
  if (has(new Set(["XNSE"]))) {
    const { isins, symbols } = await nseLists();
    for (const row of rows) if (row.mic === "XNSE" && !isins.has(row.isin) && !symbols.has(normalize(row.ticker).toUpperCase())) drop(row, "NSE: not on the NSE lists");
  }

  // Rule 10: Tokyo.
  if (has(new Set(["XTKS"]))) {
    const { codes, added } = await tokyoCodes();
    for (const row of rows) {
      if (row.mic !== "XTKS") continue;
      const state = codes.get(normalize(row.ticker).toUpperCase());
      if (!state) drop(row, "Tokyo: not on the JPX lists");
      else if (state === "PRO Market") drop(row, "Tokyo PRO Market (professional investors only)");
      else if (state === "delisted") drop(row, "Tokyo: delisted (JPX)");
      else if (state === "not listed yet") drop(row, "Tokyo: not listed yet (JPX new listings)");
    }
    if (added) notes.push(`${added} Tokyo codes listed after the JPX month-end file`);
  }

  // Rule 11: London reporting lines.
  {
    const byTidm = new Map(lse.map((line) => [line.tidm, line]));
    const byIsin = new Map();
    for (const line of lse) byIsin.set(line.isin, [...(byIsin.get(line.isin) || []), line]);
    const asked = new Map();
    for (const row of rows) {
      if (row.mic !== "XLON" || out.has(row)) continue;
      const ticker = normalize(row.ticker).toUpperCase().replace(/\.$/, "");
      const own = byTidm.get(ticker);
      if (own && own.isin === row.isin) continue;
      const lines = (byIsin.get(row.isin) || []).filter((line) => line.currency === row.currency || (line.currency === "GBX" && row.currency === "GBP"));
      if (!lines.length || lines.some((line) => line.midPrice != null)) continue;
      const tidm = lines[0].tidm;
      if (!asked.has(tidm)) {
        const data = await get(LSE_LINE + encodeURIComponent(tidm), { headers: LSE_HEADERS, as: "json" });
        if (data?.tidm !== tidm || !("market" in data)) throw new Error(`the LSE line API changed for ${tidm}`);
        asked.set(tidm, data.market);
        await sleep(400);
      }
      if (asked.get(tidm) === "OTHERS") drop(row, "LSE: reporting line only (market OTHERS)");
    }
    if (asked.size) notes.push(`${asked.size} unpriced London lines asked for their market`);
  }

  // Rule 12: regional shares on no European list, asked of their venue.
  if (regional.length) {
    if (regional.length > 1500) throw new Error(`${regional.length} regional shares to ask: the lists above changed`);
    const home = new Set();
    for (const row of rows) if (HOME_CHECKED.has(row.mic) && !out.has(row)) home.add(row.isin);
    const verdicts = await regionalLive(regional);
    let kept = 0;
    for (const row of regional) {
      const verdict = verdicts.get(`${row.mic}|${row.isin}`);
      if (verdict === true) kept += 1;
      else if (verdict === false) drop(row, `${row.exchange}: not traded there (venue page)`);
      else if (home.has(row.isin)) kept += 1;
      else drop(row, `${row.exchange}: venue could not be asked and no live home line`);
    }
    notes.push(`${kept} of ${regional.length} regional shares on no European list kept after asking their venue`);
  }

  if (out.size) {
    let at = 0;
    for (const row of rows) if (!out.has(row)) rows[at++] = row;
    rows.length = at;
  }
  return { dropped, retyped, notes };
}

// One line: what was dropped and why, what was retyped.
export function reportVenueLists({ dropped, retyped, notes }) {
  const total = [...dropped.values()].reduce((sum, entry) => sum + entry.count, 0);
  const reasons = [...dropped].sort((left, right) => right[1].count - left[1].count).map(([reason, { count, examples }]) => `${count} ${reason} (${examples.join(", ")})`);
  console.error(`exchange lists: dropped ${total} rows: ${reasons.join("; ") || "none"}; ${retyped} fund rows retyped from the Deutsche Börse type${notes.length ? `; ${notes.join("; ")}` : ""}`);
}
