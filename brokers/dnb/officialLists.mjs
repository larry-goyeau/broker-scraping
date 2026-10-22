// DNB's open instrument API (read by brokers/dnb and brokers/sbanken)
// answers tradeable=true for lines that no longer trade: suspended London
// lines (status S, the Russian GDRs since 2022), delisted or acquired
// companies, when-issued and prelist lines, Euronext technical lines
// (buy-back, treasury shares) and bonds or US notes typed STOCK. Each
// line is checked here against the official list of its exchange, and
// the place label is taken from that list when DNB's MIC is stale.
//
// Checked (a line missing from its list goes):
//   US (NYSE, NYSE American, Nasdaq, Arca): Nasdaq Trader symbol
//     directory, test issues excluded. The listing exchange comes from its
//     Exchange column (N NYSE, A NYSE American, P NYSE Arca, Z Cboe BZX,
//     M NYSE Texas, F Texas Stock Exchange, V IEX; nasdaqlisted is
//     Nasdaq). When-issued lines go, and so do lines whose Security Name
//     is a SPAC or equity unit, a note or debenture, a warrant or a right
//     (common units of partnerships, trust units, preferred and
//     depositary shares stay).
//   Euronext Paris, Amsterdam, Brussels and Oslo: Euronext's equity file
//     and its ETF file (multi-currency books included), by ISIN, currency
//     and city. A line with no trading data (last price "-") goes, and so
//     do the buy-back, treasury-share and TS lines. "Euronext Growth"
//     lines take that label.
//   Nasdaq Stockholm, Helsinki, Copenhagen and First North: Nasdaq Nordic
//     share screeners (main market and First North) and the Stockholm ETF
//     screener, by ISIN and currency. A line with no last price
//     (suspended) goes; a line takes the label of the list it is on.
//   Xetra: Deutsche Börse's tradable-instruments file, Instrument Status
//     Active, by ISIN and currency.
//   London: the LSE price explorer (every equity and ETP line). A line it
//     does not list, or lists with no mid price, is asked of the LSE
//     instrument API; it goes when that API has no line with its ISIN, or
//     files it with trading status S (suspended).
//   SIX: SIX reference data (segments EQ and FU), by ISIN and currency.
//     A second trading line (short name "2. LINIE", where only the issuer
//     buys back) goes.
//   Toronto: TSX company directory (TSX and TSX Venture symbols).
// By DNB's own segment, before any list: Paris "Non Equities" lines typed
//   STOCK (titres participatifs), Helsinki "Prelist", Xetra "EEX REG MKT",
//   and London bond segments (STBS-*, "UK Corporates").
// Madrid has no public list read here; its BME Growth lines (DNB segment
//   "BME GROWTH" or "MERCADO ALTERNATIVO") take that label. Spotlight, NGM
//   and NOTC are not checked.
//
// A list that does not answer, or answers with fewer lines than a sound
// read or other columns, stops the run.
//
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   (the files of https://www.nasdaqtrader.com/dynamic/SymDir/, whose edge
//   turns scripts away)
//   https://live.euronext.com/en/pd_es/data/stocks/download?mics=dm_all_stock
//   https://live.euronext.com/en/pd_es/data/track/download?mics=XPAR,XAMS,XBRU,XOSL,XAMC,XPMC
//   https://api.nasdaq.com/api/nordic/screener/shares?category=MAIN_MARKET&tableonly=false&market=STO
//   https://api.nasdaq.com/api/nordic/screener/etp?category=ETF&tableonly=false&market=STO
//   https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra
//   https://api.londonstockexchange.com/api/v1/pages?path=live-markets/market-data-dashboard/price-explorer&parameters=categories%3DEQUITY%2CETFS%26size%3D1000%26page%3D0
//   https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>
//   https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency,ShortName&where=PortalSegment=EQ&pagesize=50000
//   https://www.tsx.com/json/company-directory/search/tsx/%5E*

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// curl, not fetch: Nasdaq Trader's edge (Incapsula) turns Node's fetch away.
async function get(url, { headers = {}, as = "text", notFound = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const args = ["-sS", "--compressed", "--max-time", "180", "-A", UA, "-H", "Accept: */*"];
      for (const [name, value] of Object.entries(headers)) args.push("-H", `${name}: ${value}`);
      args.push("-w", "\n%{http_code}", url);
      const { stdout } = await exec("curl", args, { maxBuffer: 256_000_000, encoding: "utf8" });
      const cut = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(cut + 1));
      const body = stdout.slice(0, cut);
      if ((status >= 200 && status < 300) || (url.startsWith("ftp:") && body)) return as === "json" ? JSON.parse(body) : body;
      if (notFound && status === 404) return null;
      last = `${status} ${url}`;
    } catch (error) {
      last = `${String(error.stderr || error.message || error).trim()} ${url}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// ---- US -------------------------------------------------------------------

const US_CODES = new Set(["XNYS", "XASE", "XNAS", "XNGS", "XNCM", "XNMS", "ARCX"]);
const US_LISTING = { Q: "XNAS", N: "XNYS", A: "XASE", P: "ARCX", Z: "BATS", M: "XCHI", F: "TXSE", V: "IEXG" };

// ACT symbol -> { name, mic }
async function usDirectory() {
  const out = new Map();
  const files = [
    ["ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt", "Symbol|Security Name|Market Category|Test Issue", (c) => ({ symbol: c[0], name: c[1], test: c[3], code: "Q" })],
    ["ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt", "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue", (c) => ({ symbol: c[0], name: c[1], test: c[6], code: c[2] })],
  ];
  for (const [url, head, read] of files) {
    const lines = (await get(url)).split(/\r?\n/).filter(Boolean);
    if (!lines[0].startsWith(head)) throw new Error(`${url}: header changed (${lines[0]})`);
    if (!/^File Creation Time/.test(lines.at(-1))) throw new Error(`${url}: file cut short`);
    for (const line of lines.slice(1, -1)) {
      const entry = read(line.split("|"));
      if (entry.test === "Y") continue;
      const mic = US_LISTING[entry.code];
      if (!mic) throw new Error(`${url}: unknown exchange code ${entry.code} (${entry.symbol})`);
      out.set(entry.symbol, { name: clean(entry.name), mic });
    }
  }
  if (out.size < 10_000) throw new Error(`Nasdaq Trader directories hold only ${out.size} symbols`);
  return out;
}

// DNB writes "BAC PRB", "BRK B", "AAC U"; the directory "BAC$B", "BRK.B", "AAC.U".
function actSymbol(ticker) {
  const preferred = ticker.match(/^(\S+) PR([A-Z]?)$/);
  if (preferred) return `${preferred[1]}$${preferred[2]}`;
  return ticker.replace(/ /g, ".");
}

const KEEP_UNITS = /Common Units|Units of Beneficial Interest|Trust Units|Preferred Units|Preference Units|Partners|Depositary|limited partner|limited liability/i;
function usNotShare(name) {
  if (/\bUnits?\b/i.test(name) && !KEEP_UNITS.test(name)) return "US unit (SPAC or equity unit)";
  if (/\b(Notes?|Debentures?)\b/i.test(name) && !/Depositary|Preferred|Preference/i.test(name)) return "US note or debenture";
  if (/(^|[\s-])(Warrants?|Rights?)\.?\s*$/i.test(name)) return "US warrant or right";
  return "";
}

// ---- Euronext ---------------------------------------------------------------

const EURONEXT_FILES = [
  ["https://live.euronext.com/en/pd_es/data/stocks/download?mics=dm_all_stock", 3000],
  ["https://live.euronext.com/en/pd_es/data/track/download?mics=XPAR,XAMS,XBRU,XOSL,XAMC,XPMC", 1000],
];
const EURONEXT_CODES = new Set(["XPAR", "XPMC", "XAMS", "XAMC", "XBRU", "XOSL", "XOAM", "XOAS", "MERK"]);

function csvCells(line) {
  return [...line.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map((match) => match[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim()).slice(0, -1);
}

// Euronext "Market" -> the DNB codes of that book.
function euronextCodes(market) {
  if (/Expert|After Hours|EuroTLX|Dublin|Milan|Lisbon|Global Equity/.test(market)) return [];
  if (/Multi-currency/.test(market)) return /Paris/.test(market) ? ["XPMC"] : /Amsterdam/.test(market) ? ["XAMC"] : [];
  const codes = [];
  if (/Paris/.test(market)) codes.push("XPAR");
  if (/Amsterdam/.test(market)) codes.push("XAMS");
  if (/Brussels/.test(market)) codes.push("XBRU");
  if (market === "Oslo Børs") codes.push("XOSL", "XOAM");
  if (market === "Euronext Expand Oslo") codes.push("XOAS");
  if (market === "Euronext Growth Oslo") codes.push("MERK");
  return codes;
}

// "ISIN|CCY|code" -> [{ name, market, last }]
async function euronextLines() {
  const out = new Map();
  for (const [url, least] of EURONEXT_FILES) {
    const lines = (await get(url)).replace(/^﻿/, "").split(/\r?\n/);
    const header = csvCells(lines[0]);
    const at = ["Name", "ISIN", "Symbol", "Market", "Currency", "last Price"].map((column) => header.indexOf(column));
    if (at.some((index) => index < 0)) throw new Error(`${url}: columns moved (${lines[0]})`);
    const [nameAt, isinAt, , marketAt, currencyAt, lastAt] = at;
    let count = 0;
    for (const line of lines.slice(1)) {
      const cells = csvCells(line);
      if (!ISIN.test(cells[isinAt] || "")) continue;
      count += 1;
      for (const code of euronextCodes(cells[marketAt])) {
        const key = `${cells[isinAt]}|${cells[currencyAt]}|${code}`;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push({ name: cells[nameAt], market: cells[marketAt], last: cells[lastAt] });
      }
    }
    if (count < least) throw new Error(`${url}: only ${count} lines`);
    await sleep(800);
  }
  return out;
}

// ---- Nasdaq Nordic ----------------------------------------------------------

const NORDIC = {
  XSTO: ["STO", "XSTO", "SSME"], SSME: ["STO", "XSTO", "SSME"], FNSE: ["STO", "XSTO", "SSME"],
  XHEL: ["HEL", "XHEL", "FSME"], FSME: ["HEL", "XHEL", "FSME"],
  XCSE: ["CPH", "XCSE", "DSME"], DSME: ["CPH", "XCSE", "DSME"],
};
const FIRST_NORTH_CODES = new Set(["SSME", "FNSE", "FSME", "DSME"]);

// "market|ISIN|CCY" -> { list, last }
async function nordicLines() {
  const out = new Map();
  const reads = [];
  for (const [market, least] of [["STO", 300], ["HEL", 100], ["CPH", 80]]) {
    for (const category of ["MAIN_MARKET", "FIRST_NORTH"]) reads.push([market, `shares?category=${category}`, category, category === "MAIN_MARKET" ? least : 10]);
  }
  reads.push(["STO", "etp?category=ETF", "ETF", 10]);
  for (const [market, path, list, least] of reads) {
    const url = `https://api.nasdaq.com/api/nordic/screener/${path}&tableonly=false&market=${market}`;
    const body = await get(url, { as: "json", headers: { Accept: "application/json" } });
    const rows = body?.data?.instrumentListing?.rows;
    if (!Array.isArray(rows)) throw new Error(`${url}: no instrument list`);
    const pages = body?.data?.pagination?.totalPages;
    if (pages !== undefined && pages !== null && Number(pages) > 1) throw new Error(`${url}: the list now has ${pages} pages`);
    if (rows.length < least) throw new Error(`${url}: only ${rows.length} lines`);
    for (const row of rows) {
      if (!ISIN.test(row.isin || "") || !row.currency) throw new Error(`${url}: a line has no ISIN or currency (${row.symbol})`);
      out.set(`${market}|${row.isin}|${row.currency}`, { list, last: clean(row.lastSalePrice) });
    }
    await sleep(800);
  }
  return out;
}

// ---- Xetra ------------------------------------------------------------------

const XETRA_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";

// "ISIN|CCY" of the Active lines.
async function xetraLines() {
  const link = (await get(XETRA_PAGE)).match(/href="([^"]*t7-xetr-allTradableInstruments\.csv)"/)?.[1];
  if (!link) throw new Error("the Xetra instruments page no longer links t7-xetr-allTradableInstruments.csv");
  const lines = (await get(new URL(link, XETRA_PAGE).href)).split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("Product Status;"));
  const header = (lines[at] || "").split(";");
  const [statusAt, isinAt, currencyAt] = ["Instrument Status", "ISIN", "Currency"].map((column) => header.indexOf(column));
  if (at < 0 || Math.min(statusAt, isinAt, currencyAt) < 0) throw new Error("the Xetra instruments file header changed");
  const out = new Set();
  for (const line of lines.slice(at + 1)) {
    const cells = line.split(";");
    if (cells[statusAt] === "Active" && ISIN.test(cells[isinAt] || "")) out.add(`${cells[isinAt]}|${cells[currencyAt]}`);
  }
  if (out.size < 4000) throw new Error(`the Xetra instruments file has only ${out.size} active lines`);
  return out;
}

// ---- London -----------------------------------------------------------------

const LSE_HEADERS = { Accept: "application/json", Origin: "https://www.londonstockexchange.com", Referer: "https://www.londonstockexchange.com/" };
const EXPLORER = "https://api.londonstockexchange.com/api/v1/pages?path=live-markets/market-data-dashboard/price-explorer&parameters=";
const LSE_LINE = "https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/";

async function lseExplorer() {
  const lines = [];
  let total = null;
  for (let page = 0; page < 40; page += 1) {
    const body = await get(EXPLORER + encodeURIComponent(`categories=EQUITY,ETFS&size=1000&page=${page}`), { headers: LSE_HEADERS, as: "json" });
    const block = (body?.components || []).flatMap((component) => component.content || []).find((item) => item.name === "priceexplorersearch")?.value;
    if (!block || !Array.isArray(block.content)) throw new Error("the LSE price explorer answered no list");
    total ??= block.totalElements;
    lines.push(...block.content);
    if (block.content.length < 1000 || lines.length >= total) break;
    await sleep(2000);
  }
  if (lines.length !== total || lines.length < 8000) throw new Error(`the LSE price explorer has ${lines.length} of ${total} lines`);
  if (lines.some((line) => !line.tidm || !line.isin || !("midPrice" in line))) throw new Error("the LSE price explorer lines changed shape");
  return lines;
}

// ---- SIX and Toronto --------------------------------------------------------

// "ISIN|CCY" -> short name
async function sixLines() {
  const out = new Map();
  for (const [segment, least] of [["EQ", 500], ["FU", 2000]]) {
    const url = `https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency,ShortName&where=PortalSegment=${segment}&pagesize=50000`;
    const [head, ...lines] = (await get(url)).trim().split(/\r?\n/);
    if (head !== "ISIN;ValorSymbol;TradingBaseCurrency;ShortName") throw new Error(`SIX reference header changed: ${head}`);
    if (lines.length < least) throw new Error(`SIX reference ${segment}: only ${lines.length} lines`);
    for (const line of lines) {
      const [isin, , currency, ...name] = line.split(";");
      out.set(`${isin}|${currency}`, name.join(";"));
    }
  }
  return out;
}

async function tsxSymbols() {
  const out = new Set();
  for (const [board, least] of [["tsx", 2000], ["tsxv", 1000]]) {
    const body = await get(`https://www.tsx.com/json/company-directory/search/${board}/%5E*`, { as: "json" });
    if (!Array.isArray(body?.results)) throw new Error(`the ${board} directory answered no list`);
    let count = 0;
    for (const company of body.results) for (const item of company.instruments || []) { out.add(item.symbol); count += 1; }
    if (count < least) throw new Error(`the ${board} directory gave ${count} symbols`);
  }
  return out;
}

// ---- the check --------------------------------------------------------------

// lines: [{ code (DNB MIC), isin, currency, ticker, type, segment }]
// Returns one verdict per line: { drop: reason or "", mic: the MIC of the
// real place when it is not the one DNB's code gives, else "" }.
export async function checkOfficialLists(lines) {
  const has = (codes) => lines.some((line) => codes.has(line.code));
  const us = has(US_CODES) ? await usDirectory() : null;
  const euronext = has(EURONEXT_CODES) ? await euronextLines() : null;
  const nordic = has(new Set(Object.keys(NORDIC))) ? await nordicLines() : null;
  const xetra = has(new Set(["XETR"])) ? await xetraLines() : null;
  const six = has(new Set(["XSWX"])) ? await sixLines() : null;
  const tsx = has(new Set(["XTSE", "XTSX"])) ? await tsxSymbols() : null;
  const london = has(new Set(["XLON"])) ? await lseExplorer() : null;
  const lseByTidm = new Map((london || []).map((line) => [line.tidm, line]));
  const lseByIsin = new Map();
  for (const line of london || []) lseByIsin.set(line.isin, [...(lseByIsin.get(line.isin) || []), line]);

  const verdicts = [];
  const askLse = [];
  for (const line of lines) {
    const verdict = { drop: "", mic: "" };
    verdicts.push(verdict);
    const { code, isin, currency, ticker, type } = line;
    const segment = clean(line.segment);
    if (type === "STOCK" && /non equit/i.test(segment)) { verdict.drop = "Paris non-equity line (titre participatif)"; continue; }
    if (/^prelist$/i.test(segment)) { verdict.drop = "prelist line"; continue; }
    if (/^EEX REG MKT$/i.test(segment)) { verdict.drop = "EEX listing line"; continue; }
    if (/^STBS-/i.test(segment) || /^UK Corporates$/i.test(segment)) { verdict.drop = "London bond segment"; continue; }

    if (US_CODES.has(code)) {
      if (/ WI$/.test(ticker)) { verdict.drop = "US when-issued line"; continue; }
      const entry = us.get(actSymbol(ticker));
      if (!entry) { verdict.drop = "not on the Nasdaq Trader lists"; continue; }
      const notShare = usNotShare(entry.name);
      if (notShare) { verdict.drop = notShare; continue; }
      if (entry.mic !== code && !(entry.mic === "XNAS" && /^XN/.test(code))) verdict.mic = entry.mic;
    } else if (EURONEXT_CODES.has(code)) {
      const found = euronext.get(`${isin}|${currency}|${code}`);
      if (!found) { verdict.drop = "not on Euronext's lists"; continue; }
      if (found.some((entry) => /BUY BACK|TREAS SHARES|\sTS$/.test(entry.name))) { verdict.drop = "Euronext technical line (buy-back, treasury shares)"; continue; }
      if (found.every((entry) => entry.last === "-" || entry.last === "")) { verdict.drop = "Euronext line with no trading data"; continue; }
      const market = found[0].market;
      if (code === "XPAR" && /^Euronext Growth Paris/.test(market)) verdict.mic = "ALXP";
      if (code === "XBRU" && /^Euronext Growth Brussels/.test(market)) verdict.mic = "ALXB";
    } else if (NORDIC[code]) {
      const [market, main, firstNorth] = NORDIC[code];
      const found = nordic.get(`${market}|${isin}|${currency}`);
      if (!found) { verdict.drop = "not on the Nasdaq Nordic lists"; continue; }
      if (!found.last) { verdict.drop = "Nasdaq Nordic: no last price (suspended)"; continue; }
      if (found.list === "FIRST_NORTH" && !FIRST_NORTH_CODES.has(code)) verdict.mic = firstNorth;
      if (found.list === "MAIN_MARKET" && FIRST_NORTH_CODES.has(code)) verdict.mic = main;
    } else if (code === "XETR") {
      if (!xetra.has(`${isin}|${currency}`)) { verdict.drop = "not active on Xetra's list"; continue; }
    } else if (code === "XSWX") {
      const name = six.get(`${isin}|${currency}`);
      if (name === undefined) { verdict.drop = "not in SIX reference data"; continue; }
      if (/2\.\s*LINIE/i.test(name)) { verdict.drop = "SIX second trading line (issuer buy-back)"; continue; }
    } else if (code === "XTSE" || code === "XTSX") {
      if (!tsx.has(ticker.replace(/ /g, "."))) { verdict.drop = "not in the TSX directory"; continue; }
    } else if (code === "XLON") {
      const tidm = ticker.toUpperCase();
      let found = lseByTidm.get(tidm);
      if (found && found.isin !== isin) found = null;
      if (!found) {
        const same = (lseByIsin.get(isin) || []).filter((entry) => entry.currency === currency || (entry.currency === "GBX" && currency === "GBP"));
        if (same.length === 1) found = same[0];
      }
      if (!found || found.midPrice === null || found.midPrice === undefined) askLse.push([verdict, found?.tidm || tidm, isin]);
    } else if (code === "XMCE" || code === "XMAD") {
      if (/^(BME GROWTH|MERCADO ALTERNATIVO)$/i.test(segment)) verdict.mic = "MABX";
    }
  }

  // London lines with no mid price or not in the explorer, one by one and
  // slowly (the LSE API blocks a burst of calls for minutes).
  let asked = 0;
  for (const [verdict, tidm, isin] of askLse) {
    const data = await get(LSE_LINE + encodeURIComponent(tidm), { headers: LSE_HEADERS, as: "json", notFound: true });
    asked += 1;
    await sleep(500);
    if (data !== null && typeof data !== "object") throw new Error(`LSE instrument API answered no object for ${tidm}`);
    if (!data || data.isin !== isin) verdict.drop = "not on the LSE";
    else if (!("tradingstatus" in data)) throw new Error(`LSE instrument API line for ${tidm} has no trading status`);
    else if (String(data.tradingstatus || "").toUpperCase().startsWith("S")) verdict.drop = "LSE: suspended (trading status S)";
  }
  return { verdicts, notes: london ? [`${asked} London lines asked for their status`] : [] };
}
