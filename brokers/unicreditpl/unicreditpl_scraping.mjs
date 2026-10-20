// What UniCredit Polska (UniCredit S.A. Spółka Akcyjna Oddział w Polsce, the
// Polish branch of UniCredit NV/SA) sells in its self-directed investing app,
// with no login: Warsaw shares, foreign shares and UCITS ETFs. The regulations
// (§6a) say orders are taken only for the instruments and markets in the
// lists published on unicredit.pl. The page links three of them:
//
//   "Lista oferowanych akcji GPW"            Warsaw shares (372 lines)
//   "Lista oferowanych akcji zagranicznych"  foreign shares (2,011 lines)
//   "Lista oferowanych ETF wraz z KID"       ETFs, each with its KID (405 lines)
//
// Every line gives a name, a currency, an ISIN and a ticker; the ETF lines
// add a KID link. No line gives a market. Cash accounts are PLN, EUR, USD,
// GBP and CHF (regulations §7d), the page says the same ("inwestycje w 5
// walutach") and the fee table charges foreign trades in EUR, USD, CHF or
// GBP. The page counts "14 rynków" (markets) and names none.
//
//   https://unicredit.pl/indywidualni/inwestycje/inwestowanie-samodzielne
//   https://unicredit.pl/dam/jcr:bd9b1e9f-a4d4-45af-a23a-c17d4950b0dc/Lista%20oferowanych%20akcji%20GPW.pdf
//   https://unicredit.pl/dam/jcr:4551162b-832f-4fdf-91a9-af3a51fc04b9/Lista%20oferowanych%20akcji%20zagranicznych.pdf
//   https://unicredit.pl/dam/jcr:6ef16dfe-1371-415c-9c66-d1b891a44f12/Lista%20oferowanych%20ETF%20wraz%20z%20KID.pdf
//   https://unicredit.pl/dam/jcr:c4bf5152-a0f7-4fb7-a0b1-ec58853eb789/Regulamin%20... (regulations)
//
// The links are read from the page by their file names, so a new edition of
// a list is picked up.
//
// Rules:
//
//   Warsaw. The list's title says the shares are quoted on the Giełda
//   Papierów Wartościowych w Warszawie: every line is GPW (XWAR), in PLN,
//   a STOCK.
//
//   Foreign shares and ETFs. A line is placed on the listings of its ISIN
//   that are quoted in the line's currency and carry the line's ticker.
//   Listings come from the repository's listing files (assets/stocks.csv and
//   assets/etfs.csv, by ISIN and exchange column) and, where those files give
//   no currency or no city, from the exchanges' own files:
//
//     Euronext   the stock and ETF downloads give symbol, currency and the
//                market (Paris, Amsterdam, Brussels, Lisbon, Milan, ETFplus).
//                A share listed in several cities trades on one book: the
//                first city named ("Euronext Paris, Brussels" is Paris).
//                Milan and ETFplus are Euronext Milan (XMIL).
//     Xetra      Deutsche Börse's list of all tradable Xetra instruments
//                (mnemonic and currency per ISIN). Germany is Xetra (XETR).
//     London     the LSE's own record of each line of the ISIN (TIDM and
//                currency; GBX is sterling): the main market, and AIM, which
//                is written "AIM" (XLON). Turquoise is not the LSE.
//     SIX        SIX's reference file for the ISIN (symbol and trading
//                currency of the line SIX reports).
//     US         NASDAQ, NYSE, AMEX and CBOE in the listing files, in USD.
//                US venues are one NBBO market: a US title is one row, on the
//                exchange the files give for it.
//     Madrid     BME in the listing files, in EUR (XMAD).
//     Vienna     VIE in the listing files, in EUR (XWBO).
//
//   Only the places broker-list.json gives UniCredit Polska are read: Warsaw,
//   United States, Euronext (with Euronext Milan), Germany, United Kingdom,
//   Spain, Switzerland and Austria. Its US restriction ("No US-domiciled
//   ETFs") holds anyway: the ETF list is UCITS only.
//
//   One row per place. When a share's ticker is on several of those places
//   in its currency, the issuer's home market is the place (the ISIN's
//   country: FR, NL, BE and PT are Euronext, IT Milan, DE Xetra, ES Madrid,
//   AT Vienna, CH SIX, GB/JE/GG/IM London). A share whose issuer's country
//   has no such listing (a Luxembourg or Bermuda issuer, say) keeps one row
//   per place, except Vienna's global market, which quotes foreign shares
//   under their home tickers. An ETF has no home market: it gets one row per
//   place quoting its ticker in its currency.
//
//   When the ticker is on none of the ISIN's listings in that currency (a
//   renamed company: CFX is now ENOV), the ISIN's listing in that currency is
//   used, with that listing's own ticker, by the same home-market rule for a
//   share; an ETF is placed this way only when one place is left. A USD line
//   whose ISIN no listing file knows is placed in the US when a US exchange
//   lists its ticker (an ADR or a renamed ISIN: TEVA, IHG). A line no source
//   places stays one row by ISIN with no exchange, and is reported.
//
//   Type: Warsaw and foreign shares are STOCK (ADRs, REITs and investment
//   trusts included). An ETF-list line is ETC when its name says ETC or ETP,
//   ETN when it says ETN, else ETF. A line repeated with the same ISIN,
//   currency and ticker is one line; the ETF list has some ISINs twice in two
//   currencies, and those are two lines.
//
//   node brokers/unicreditpl/unicreditpl_scraping.mjs
//
// Text is read with PyMuPDF (`python3 -c "import fitz"`).

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://unicredit.pl/indywidualni/inwestycje/inwestowanie-samodzielne";
const EURONEXT_STOCKS = "https://live.euronext.com/en/pd_es/data/stocks/download?mics=dm_all_stock";
const EURONEXT_ETFS = "https://live.euronext.com/en/pd_es/data/track/download?mics=XPAR,XAMS,XBRU,XLIS,ETFP,XMSM";
const XETRA_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";
const LSE_SEARCH = "https://api.londonstockexchange.com/api/gw/lse/search/autocomplete?q=";
const LSE_LINE = "https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/";
const SIX_REF = "https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency&where=ISIN=";
const OUTPUT = new URL("unicreditpl-parsed.json", import.meta.url);
const WORKERS = 4;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const CURRENCY = /^[A-Z]{3}$/;

// MIC -> exchange name, as spreads/venues.mjs names it.
const EXCHANGE = {
  XWAR: "Warsaw Stock Exchange",
  XNYS: "New York Stock Exchange",
  XNAS: "Nasdaq",
  XASE: "NYSE American",
  BATS: "Cboe BZX",
  XPAR: "Euronext Paris",
  XAMS: "Euronext Amsterdam",
  XBRU: "Euronext Brussels",
  XLIS: "Euronext Lisbon",
  XMIL: "Euronext Milan",
  XETR: "Börse Xetra",
  XLON: "London Stock Exchange",
  XMAD: "Bolsa de Madrid",
  XSWX: "SIX Swiss Exchange",
  XWBO: "Wiener Börse",
};
const US_MICS = new Set(["XNYS", "XNAS", "XASE", "BATS"]);
// Listing-file exchange -> MIC, for the files read directly.
const FILE_MIC = { NASDAQ: "XNAS", NYSE: "XNYS", AMEX: "XASE", CBOE: "BATS", BME: "XMAD", VIE: "XWBO" };
// broker-list.json place -> MICs it covers.
const PLACE_MICS = {
  "Warsaw Stock Exchange": ["XWAR"],
  "United States": [...US_MICS],
  Euronext: ["XPAR", "XAMS", "XBRU", "XLIS", "XMIL"],
  Germany: ["XETR"],
  "United Kingdom": ["XLON"],
  Spain: ["XMAD"],
  Switzerland: ["XSWX"],
  Austria: ["XWBO"],
};
// The issuer's country (ISIN prefix) -> its home market MICs.
const HOME = {
  FR: ["XPAR", "XAMS", "XBRU", "XLIS"],
  NL: ["XPAR", "XAMS", "XBRU", "XLIS"],
  BE: ["XPAR", "XAMS", "XBRU", "XLIS"],
  PT: ["XPAR", "XAMS", "XBRU", "XLIS"],
  IT: ["XMIL"],
  DE: ["XETR"],
  ES: ["XMAD"],
  AT: ["XWBO"],
  CH: ["XSWX"],
  GB: ["XLON"],
  JE: ["XLON"],
  GG: ["XLON"],
  IM: ["XLON"],
};
// Euronext's Market column, first city -> MIC.
const EURONEXT_MARKET = {
  "Euronext Paris": "XPAR",
  "Euronext Amsterdam": "XAMS",
  "Euronext Brussels": "XBRU",
  "Euronext Lisbon": "XLIS",
  "Euronext Milan": "XMIL",
  "ETF Plus": "XMIL",
};

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const sameSymbol = (left, right) =>
  String(left || "").toUpperCase().replace(/[.\s/-]/g, "") === String(right || "").toUpperCase().replace(/[.\s/-]/g, "");
const held = (currency) => (currency === "GBX" ? "GBP" : currency);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A body, or null when the server answers 404.
async function get(url, { accept = "*/*", binary = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8" },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
      if (response.status === 404) return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// At most WORKERS tasks at once, results in input order.
async function pool(items, task) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, items.length) }, worker));
  return out;
}

// The three list links on the page, by file name.
async function listUrls() {
  const html = await get(PAGE, { accept: "text/html" });
  const links = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((match) => new URL(match[1].replace(/&amp;/g, "&"), PAGE).href);
  const named = (pattern) => {
    const hits = [...new Set(links.filter((href) => pattern.test(decodeURIComponent(href))))];
    if (hits.length !== 1) throw new Error(`the page has ${hits.length} links for ${pattern}`);
    return hits[0];
  };
  return {
    gpw: named(/Lista oferowanych akcji GPW\.pdf$/i),
    foreign: named(/Lista oferowanych akcji zagranicznych\.pdf$/i),
    etf: named(/Lista oferowanych ETF/i),
  };
}

// Every word of a PDF with its page and position.
function pdfWords(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
print(json.dumps([[page.number, round(w[0], 1), round(w[1], 1), w[4]] for page in doc for w in page.get_text("words")]))
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.status !== 0) {
    const detail = python.stderr?.toString() || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : `Could not read the PDF: ${detail.trim()}`);
  }
  return JSON.parse(python.stdout.toString("utf8")).map(([page, x, y, text]) => ({ page, x, y, text }));
}

// The table: Nazwa | Waluta | Kod ISIN | Identifikator (ticker) [| KID URL].
// Columns are placed by the header words on the first page and hold for
// every page. Words on one line share a top edge within 5 points; a name may
// be printed out of reading order, so lines are rebuilt from positions.
function listLines(words, label) {
  const date = words.map((word) => word.text).join(" ").match(/Stan na (\d{4}-\d{2}-\d{2})/)?.[1] || "";
  const head = (text) => words.find((word) => word.page === 0 && word.text === text)?.x;
  const [currencyX, isinX, tickerX] = [head("Waluta"), head("Kod"), head("Identifikator")];
  const kidX = words.find((word) => word.page === 0 && word.text === "URL")
    ? Math.min(...words.filter((word) => word.page === 0 && word.text === "KID" && word.y < 300).map((word) => word.x))
    : Infinity;
  if (![currencyX, isinX, tickerX].every(Number.isFinite)) throw new Error(`${label}: no column header`);
  const column = (x) => (x < currencyX - 6 ? 0 : x < isinX - 6 ? 1 : x < tickerX - 6 ? 2 : x < kidX - 6 ? 3 : 4);
  const rows = [];
  for (const word of [...words].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)) {
    let row = rows.find((candidate) => candidate.page === word.page && Math.abs(candidate.y - word.y) <= 5);
    if (!row) {
      row = { page: word.page, y: word.y, cells: [[], [], [], [], []] };
      rows.push(row);
    }
    row.cells[column(word.x)].push(word);
  }
  const out = [];
  const stray = [];
  for (const row of rows) {
    // A long name runs into the currency column ("... KMP S | PLN").
    const spill = row.cells[1].filter((word) => !CURRENCY.test(word.text));
    if (spill.length && spill.length < row.cells[1].length) {
      row.cells[0].push(...spill);
      row.cells[1] = row.cells[1].filter((word) => CURRENCY.test(word.text));
    }
    const cells = row.cells.map((cell) => normalize(cell.sort((a, b) => a.x - b.x).map((word) => word.text).join(" ")));
    const [name, currency, isin, ticker, kid] = cells;
    if (!ISIN.test(isin)) {
      if (cells.slice(1).some(Boolean) || (name && !/^(\d{1,3}|Nazwa|Lista .*|Stan na .*|Giełdzie .*|Warszawie|oferowanych .*)$/.test(name))) stray.push(cells.filter(Boolean).join(" | "));
      continue;
    }
    if (!CURRENCY.test(currency) || !ticker) throw new Error(`${label}: line ${isin} reads "${cells.join(" | ")}"`);
    out.push({ name, currency, isin, ticker, kid: kid === `${isin} KID` });
  }
  return { date, lines: out, stray };
}

// Euronext download: ISIN -> [{mic, symbol, currency, market}].
function euronextListings(text, into) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0].split(";").map((cell) => cell.replace(/"/g, ""));
  const col = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Euronext file has no ${name} column`);
    return index;
  };
  const [isin, symbol, market, currency] = ["ISIN", "Symbol", "Market", "Currency"].map(col);
  let count = 0;
  for (const line of lines.slice(1)) {
    const cells = (line.match(/("[^"]*"|[^;]*)(;|$)/g) || []).map((cell) => cell.replace(/;$/, "").replace(/^"|"$/g, "").trim());
    if (!ISIN.test(cells[isin] || "")) continue;
    const first = String(cells[market] || "").split(",")[0].trim();
    const mic = EURONEXT_MARKET[first];
    if (!mic) continue;
    const list = into.get(cells[isin]) || [];
    list.push({ mic, symbol: cells[symbol], currency: held(String(cells[currency]).toUpperCase()), source: "Euronext" });
    into.set(cells[isin], list);
    count += 1;
  }
  return count;
}

// Xetra's list of tradable instruments: ISIN -> [{mic, symbol, currency}].
async function xetraListings(into) {
  // The page sometimes comes back without its download block; ask again.
  let href = "";
  for (let attempt = 0; attempt < 4 && !href; attempt += 1) {
    if (attempt) await sleep(2000 * attempt);
    const page = await get(XETRA_PAGE, { accept: "text/html" });
    href = page.match(/href="(https:\/\/www\.cashmarket\.deutsche-boerse\.com\/resource\/blob\/[^"]+allTradableInstruments\.csv)"/)?.[1] || "";
  }
  if (!href) throw new Error("Deutsche Börse did not link the Xetra instrument file");
  const lines = (await get(href, { accept: "text/csv" })).split(/\r?\n/);
  const headerAt = lines.findIndex((line) => line.startsWith("Product Status;"));
  const header = (lines[headerAt] || "").split(";");
  const [status, isin, mnemonic, currency] = ["Instrument Status", "ISIN", "Mnemonic", "Currency"].map((name) => header.indexOf(name));
  if ([status, isin, mnemonic, currency].some((index) => index < 0)) throw new Error("Xetra instrument columns moved");
  let count = 0;
  for (const line of lines.slice(headerAt + 1)) {
    const cells = line.split(";");
    if (cells[status] !== "Active" || !ISIN.test(cells[isin] || "")) continue;
    const list = into.get(cells[isin]) || [];
    list.push({ mic: "XETR", symbol: cells[mnemonic].trim(), currency: held(cells[currency].trim().toUpperCase()), source: "Xetra" });
    into.set(cells[isin], list);
    count += 1;
  }
  if (count < 2000) throw new Error(`Xetra file has only ${count} active lines`);
  return count;
}

// The listing files: ISIN -> [{exchange, symbol}], and US symbol -> exchanges.
function listingFiles() {
  const byIsin = new Map();
  const usSymbols = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/).slice(1)) {
      const [code, exchange, isin] = line.split(",");
      if (!code || !exchange) continue;
      const symbol = code.slice(code.indexOf(":") + 1);
      if (ISIN.test(isin || "")) {
        const list = byIsin.get(isin) || [];
        list.push({ exchange, symbol });
        byIsin.set(isin, list);
      }
      if (FILE_MIC[exchange] && US_MICS.has(FILE_MIC[exchange])) {
        const list = usSymbols.get(symbol) || [];
        list.push({ mic: FILE_MIC[exchange], symbol, isin });
        usSymbols.set(symbol, list);
      }
    }
  }
  return { byIsin, usSymbols };
}

// The LSE answers 403 when asked too fast: one call every LSE_GAP ms, and
// three minutes' rest after a refusal.
const LSE_GAP = 400;
let lseSlot = 0;
async function lsePace() {
  const now = Date.now();
  const slot = Math.max(now, lseSlot);
  lseSlot = slot + LSE_GAP;
  if (slot > now) await sleep(slot - now);
}
async function lseJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await lsePace();
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.json();
      if (response.status === 404) return null;
      last = `${response.status} ${url}`;
      if (response.status === 403 || response.status === 429) {
        console.error(`LSE ${response.status}, waiting`);
        lseSlot = Math.max(lseSlot, Date.now() + 180_000);
        continue;
      }
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// Every LSE main-market and AIM line of an ISIN, with its TIDM and currency.
async function lseListings(isin) {
  const found = await lseJson(LSE_SEARCH + encodeURIComponent(isin));
  const items = found?.instruments || [];
  const out = [];
  for (const item of items) {
    if (item.code !== isin || item.islse !== true) continue;
    const line = await lseJson(LSE_LINE + encodeURIComponent(item.tidm));
    if (!line || line.isin !== isin || !/^(MAINMARKET|AIM)/.test(line.market || "")) continue;
    const aim = /^AIM/.test(line.market);
    out.push({ mic: "XLON", symbol: line.tidm, currency: held(String(line.currency || "").toUpperCase()), source: aim ? "LSE AIM" : "LSE", aim });
  }
  return out;
}

// SIX's line for an ISIN.
async function sixListings(isin) {
  const text = (await get(SIX_REF + encodeURIComponent(isin), { accept: "text/csv" })) || "";
  const out = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [code, symbol, currency] = line.split(";");
    if (code === isin && symbol) out.push({ mic: "XSWX", symbol: symbol.trim(), currency: held(String(currency).trim().toUpperCase()), source: "SIX" });
  }
  return out;
}

function brokerMics() {
  const list = JSON.parse(fs.readFileSync(new URL("../../broker-list.json", import.meta.url), "utf8"));
  const entry = list.find((row) => row.name === "UniCredit Polska");
  if (!entry) throw new Error("UniCredit Polska is not in broker-list.json");
  const mics = new Set();
  for (const place of Object.keys(entry.exchanges)) {
    if (!PLACE_MICS[place]) throw new Error(`no reader for the place ${place}`);
    for (const mic of PLACE_MICS[place]) mics.add(mic);
  }
  return mics;
}

// The share's home market among several listings, else all but Vienna.
function homeOf(isin, listings) {
  const home = HOME[isin.slice(0, 2)] || [];
  const inHome = listings.filter((hit) => home.includes(hit.mic));
  if (inHome.length) return { kept: inHome.slice(0, 1), how: "home" };
  const away = listings.filter((hit) => hit.mic !== "XWBO");
  return { kept: away.length ? away : listings, how: away.length > 1 ? "several" : "single" };
}

function onePerMic(listings) {
  const seen = new Map();
  for (const hit of listings) {
    const prior = seen.get(hit.mic);
    if (!prior) seen.set(hit.mic, hit);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------

const mics = brokerMics();
const urls = await listUrls();
const [gpwPdf, foreignPdf, etfPdf] = await pool([urls.gpw, urls.foreign, urls.etf], (url) => get(url, { accept: "application/pdf", binary: true }));
const gpw = listLines(pdfWords(gpwPdf), "GPW list");
const foreign = listLines(pdfWords(foreignPdf), "foreign list");
const etf = listLines(pdfWords(etfPdf), "ETF list");
for (const list of [gpw, foreign, etf]) if (list.stray.length) console.error(`text outside the lines: ${list.stray.join(" || ")}`);
console.error(`lists: GPW ${gpw.lines.length} (${gpw.date}), foreign ${foreign.lines.length} (${foreign.date}), ETF ${etf.lines.length} (${etf.date})`);
if (gpw.lines.length < 300 || foreign.lines.length < 1500 || etf.lines.length < 300) throw new Error("a list came out short");
if (etf.lines.some((line) => !line.kid)) console.error(`ETF lines with no KID: ${etf.lines.filter((line) => !line.kid).length}`);

// Exchange-own listings with currency, by ISIN.
const exchangeListings = new Map();
const [stockText, etfText] = await pool([EURONEXT_STOCKS, EURONEXT_ETFS], (url) => get(url, { accept: "text/csv" }));
const euronextCount = euronextListings(stockText, exchangeListings) + euronextListings(etfText, exchangeListings);
if (euronextCount < 1500) throw new Error(`Euronext files have only ${euronextCount} lines`);
const xetraCount = await xetraListings(exchangeListings);
const files = listingFiles();
console.error(`Euronext ${euronextCount} lines, Xetra ${xetraCount} lines`);

const foreignLines = [
  ...foreign.lines.map((line) => ({ ...line, type: "STOCK", list: "foreign" })),
  ...etf.lines.map((line) => ({
    ...line,
    type: /\bETN\b/i.test(line.name) ? "ETN" : /\b(ETC|ETP)\b/i.test(line.name) ? "ETC" : "ETF",
    list: "ETF",
  })),
];

// London and SIX are asked only for the ISINs that need them.
const fileExchanges = (isin) => new Set((files.byIsin.get(isin) || []).map((hit) => hit.exchange));
const lseIsins = [...new Set(foreignLines.filter((line) => line.currency === "GBP" || (line.list === "ETF" && fileExchanges(line.isin).has("LSE"))).map((line) => line.isin))];
const sixIsins = [...new Set(foreignLines.filter((line) => line.currency === "CHF" || (line.list === "ETF" && fileExchanges(line.isin).has("SIX"))).map((line) => line.isin))];
const lse = new Map();
const six = new Map();
await pool(lseIsins, async (isin) => lse.set(isin, await lseListings(isin)));
await pool(sixIsins, async (isin) => six.set(isin, await sixListings(isin)));
console.error(`LSE asked for ${lseIsins.length} ISINs, SIX for ${sixIsins.length}`);

function listingsOf(isin) {
  const out = [...(exchangeListings.get(isin) || []), ...(lse.get(isin) || []), ...(six.get(isin) || [])];
  for (const hit of files.byIsin.get(isin) || []) {
    const mic = FILE_MIC[hit.exchange];
    if (!mic) continue;
    out.push({ mic, symbol: hit.symbol, currency: US_MICS.has(mic) ? "USD" : "EUR", source: "listing file" });
  }
  return out.filter((hit) => mics.has(hit.mic));
}

const rows = [];
const notes = { renamed: [], tickerOnly: [], several: [], unplaced: [] };
const seen = new Set();

function makeRow(line, hit, extra = "") {
  return {
    query: hit ? hit.symbol : line.isin,
    ticker: hit ? hit.symbol : line.ticker,
    name: line.name,
    ...(hit ? { exchange: hit.aim ? "AIM" : EXCHANGE[hit.mic], mic: hit.mic } : {}),
    currency: line.currency,
    type: line.type,
    isin: line.isin,
    raw: [line.name, line.currency, line.isin, line.ticker].join(" | ") + (hit ? ` | ${hit.mic} ${hit.symbol} ${hit.currency} (${hit.source})` : "") + extra,
  };
}

for (const line of gpw.lines) {
  const key = `${line.isin}|${line.currency}|${line.ticker}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (line.currency !== "PLN") throw new Error(`GPW line ${line.isin} is in ${line.currency}`);
  rows.push(makeRow({ ...line, type: "STOCK" }, { mic: "XWAR", symbol: line.ticker, currency: "PLN", source: "GPW list" }));
}

for (const line of foreignLines) {
  const key = `${line.isin}|${line.currency}|${line.ticker}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const listings = listingsOf(line.isin).filter((hit) => hit.currency === line.currency);
  const exact = listings.filter((hit) => sameSymbol(hit.symbol, line.ticker));
  const usExact = exact.filter((hit) => US_MICS.has(hit.mic));
  const label = `${line.ticker} ${line.isin} ${line.currency}`;

  // United States: one row.
  if (line.currency === "USD" && (usExact.length || listings.some((hit) => US_MICS.has(hit.mic)))) {
    const hit = usExact[0] || listings.find((hit) => US_MICS.has(hit.mic));
    if (!usExact.length) notes.renamed.push(`${label} -> ${hit.mic} ${hit.symbol}`);
    rows.push(makeRow(line, hit));
    continue;
  }
  let kept = [];
  if (exact.length) {
    const unique = onePerMic(exact);
    if (line.type === "STOCK" && unique.length > 1) {
      const pick = homeOf(line.isin, unique);
      kept = pick.kept;
      if (pick.how === "several") notes.several.push(`${label}: ${kept.map((hit) => hit.mic).join(", ")}`);
    } else kept = unique;
  } else if (listings.length) {
    const unique = onePerMic(listings);
    if (line.type === "STOCK") kept = homeOf(line.isin, unique).kept;
    else if (unique.length === 1) kept = unique;
    if (kept.length) notes.renamed.push(`${label} -> ${kept.map((hit) => `${hit.mic} ${hit.symbol}`).join(", ")}`);
  } else if (line.currency === "USD" && files.usSymbols.has(line.ticker)) {
    const hit = files.usSymbols.get(line.ticker)[0];
    kept = [{ mic: hit.mic, symbol: hit.symbol, currency: "USD", source: `listing file, ISIN ${hit.isin}` }];
    notes.tickerOnly.push(`${label} -> ${hit.mic} ${hit.symbol} (${hit.isin})`);
  }
  if (!kept.length) {
    const known = listingsOf(line.isin).map((hit) => `${hit.mic}:${hit.symbol}:${hit.currency}`);
    notes.unplaced.push(`${label} ${line.name}${known.length ? ` (other lines: ${known.join(", ")})` : ""}`);
    rows.push(makeRow(line, null, " | no listing found"));
    continue;
  }
  for (const hit of kept) rows.push(makeRow(line, hit));
}

rows.sort((left, right) => (left.exchange || "~").localeCompare(right.exchange || "~") || left.name.localeCompare(right.name) || left.ticker.localeCompare(right.ticker));
const output = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

// Report.
const tally = (pick) => {
  const counts = {};
  for (const row of output) counts[pick(row)] = (counts[pick(row)] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} ${count}`).join(", ");
};
console.error(`${output.length} rows over ${new Set(output.map((row) => row.isin)).size} ISINs (${rows.length - output.length} dropped as debt)`);
console.error(`by place: ${tally((row) => row.mic || "none")}`);
console.error(`by currency: ${tally((row) => row.currency)}`);
console.error(`by type: ${tally((row) => row.type)}`);
const unresolved = output.filter((row) => !resolveVenue(row).venue);
console.error(`venues unresolved: ${unresolved.length}${unresolved.length ? `: ${unresolved.map((row) => `${row.ticker} ${row.isin} ${row.exchange || "-"}`).join("; ")}` : ""}`);
for (const [kind, list] of Object.entries(notes)) if (list.length) console.error(`${kind} (${list.length}): ${list.join("; ")}`);
