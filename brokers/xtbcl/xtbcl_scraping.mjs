// XTB Chile publishes its instrument specification for the "cl" branch
// (Chilean residents are served by XTB International). The page is backed
// by a public JSON API that pages every instrument of a type, and of a
// country for shares. No login.
//
//   https://www.xtb.com/cl/especificacion-de-instrumentos
//   https://www.xtb.com/web-api/v2/languages/es/branches/cl/instruments?typeSlug=cashstocks&country=US&page=1&pageSize=500
//   https://www.xtb.com/web-api/v2/languages/es/branches/cl/instruments?typeSlug=etfs&page=1&pageSize=500
//
// Kept: cash shares (one request series per country, so the place is the
// country page), ETFs, ETCs and ETNs (place read from the symbol suffix).
// Left out: CFDs ("shares", "etfcfd", indices, forex, commodities) and
// cryptocurrencies. A line flagged close_only, or whose name starts
// "CLOSE ONLY /", refuses new positions and is dropped wherever it trades.
// At 2026-10-20 that is 144 lines: 67 American, the 15 Russian depositary
// receipts on the London IOB (suspended since 2022), 52 other European
// shares and 10 ETPs. Of the 52, all but a handful are old spellings of a
// company XTB now carries on a live line (FP.FR -> TTE.FR, DAI.DE -> MBG.DE,
// RDSA.UK -> SHEL.UK, LSE.UK -> LSEG.UK, STL.NO -> EQNR.NO...) or companies
// that left the market (Wirecard, Intu, Hunter Douglas, ICA Gruppen...).
//
// American lines: the page prints every one "New York". Whether a line still
// trades, and where it is listed, is read from the official US symbol
// directories of the day (a test issue is left out):
//
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//
// The page is not purged of names that have left the tape (Activision, First
// Republic, Big Lots...) and keeps old spellings after a ticker change. An
// XTB symbol is looked for, in this order:
// 1. as printed. Kept unless the directory line is plainly another security
//    under a recycled ticker: a share whose ticker is now an ETF (INT, LAZR),
//    or a name with no word in common and no ISIN of XTB's own to vouch for
//    it (AKTS Akoustis -> Aktis Oncology, PARA, SI...);
// 2. in XTB's own spellings: a trailing digit XTB adds to tell lines apart
//    (COR1 -> COR, SE1 -> SE), a share class run into the ticker (BRKB ->
//    BRK.B, MKCV -> MKC.V) or put after it (GOOGC -> GOOG), when the names
//    agree;
// 3. under a new ticker after a rename (BK -> BNY, PSTG -> P, CHK -> EXE,
//    GSRT -> NKLR): same ISIN on another listed ticker in assets/stocks.csv
//    (the ISIN is XTB's own from its OMI tables when known, else that of the
//    stocks.csv line of the same ticker and name), or failing that the very
//    same company name on a single directory line.
// A line found nowhere has left the tape and is dropped. When two XTB lines
// land on one listed ticker (FI and FISV, GOLD = Barrick's old ticker and
// AMRK = Gold.com's), the one whose ISIN agrees with the listed ticker's
// wins, then the one spelled as listed; the other is a stale duplicate and
// is dropped. A renamed line takes the listed ticker, the directory's name
// and the ISIN that tied it. The place is the directory's listing exchange.
//
// Other places: .DE is Xetra (the page prints "Frankfurt"; XTB routes German
// shares to Xetra), .UK is the London main market, the "UK_INT" country is
// the London IOB in USD. The currency is the line's own currencyCode, or the
// currency of its minimum order. The API prints no ISIN: ISINs come from
// XTB's own OMI tables already read by brokers/xtb (same symbols) when that
// file exists, then from stampRows. (`sale_availability` is XTB's
// short-selling flag, not whether a line can be bought: it is not read.)
//
// The page is not purged of European lines either: old spellings (DPW.DE
// beside DHL.DE, ORP.FR for what is now Emeis, BDEV.UK beside BTRW.UK) and
// companies that left the market (Aareal Bank, Rothschild & Co, Neoen,
// Darktrace, DS Smith, Hargreaves Lansdown, iBonds that matured...). Each
// line is looked for in its exchange's own list of the day:
//
//   Euronext (Paris, Amsterdam, Brussels, Lisbon, Milan, Oslo), its shares
//   and ETP downloads. The Expert Market ("delisted and unlisted lines",
//   periodic auctions only), EuroTLX and the after-hours book are not
//   listings and do not count:
//     https://live.euronext.com/en/pd_es/data/stocks/download?mics=dm_all_stock
//     https://live.euronext.com/en/pd_es/data/track/download?mics=XPAR,XAMS,XBRU,XLIS,ETFP,XMSM,XOSL,XMIL
//   Deutsche Börse, "All Tradable Instruments" of Xetra, then of the
//   Frankfurt floor ("Tradable Instruments Frankfurt"); active shares and
//   ETPs only. BMW's preference shares (BMW3) are no longer there: they
//   became ordinary shares on 30 June 2026.
//     https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra
//     https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra/boersefrankfurt
//   SIX, "List of Equity Issuers" (one line per issuer):
//     https://www.six-group.com/sheldon/equity_issuers/v1/equity_issuers.csv
//   Nasdaq Nordic (Stockholm, Helsinki, Copenhagen), main market and First
//   North screeners:
//     https://api.nasdaq.com/api/nordic/screener/shares?category=MAIN_MARKET&tableonly=false&market=STO
//   London: the LSE's own record of each TIDM (as brokers/aviva reads it);
//   an unknown TIDM answers "Not found instrument with tidm: OGZD":
//     https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>
//     https://api.londonstockexchange.com/api/gw/lse/search/autocomplete?q=<ISIN>
//
// A line is found by its ISIN, else its ticker respelled ("NOVO B" is NOVOB;
// for a share, a ticker hit needs the ISIN or a word of the name to agree;
// an ETP's list name is a code, "A.ETF-S+P W.COMM.S.SC.UEA"), else its
// company name (Alzchem's new ISIN after its share consolidation is ACT0,
// and XTB still writes ACT). It is dropped when found on no list of its
// place; when it is found only by name on a line another XTB line already
// holds by ISIN or ticker (TDVOX beside DYVOX, SHA beside SHA0, BMW3 beside
// BMW); or when two XTB lines name one exchange line (the one spelled as
// listed stays). A found line takes the list's ISIN. A .DE share traded on
// the Frankfurt floor but not on Xetra is filed on Börse Frankfurt (XFRA);
// a .DE ETP must be on Xetra (the floor still lists iBonds that matured);
// a .DE line without an ISIN of XTB's own is an old spelling and must be
// on Xetra (Frankfurt's DPW is a Canadian receipt, not Deutsche Post). A
// Deutsche Börse mnemonic gives its currency: MWOX is the USD line of the
// ISIN whose EUR line is WELX, not a duplicate. London: a TIDM is read as
// XTB writes it, with the LSE's dot put back (BP. is "BP", BT.A "BTA"); a
// TIDM unknown to the LSE, or one suspended for a month and more (Evraz,
// since March 2022), is gone; a line found only by its ISIN under another
// TIDM takes that TIDM and is dropped when XTB already carries it (BDEV ->
// BTRW). Madrid, Warsaw and Prague are not checked (no list was cheap to
// read): their lines stay as XTB prints them.
//
//   node brokers/xtbcl/xtbcl_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const API = "https://www.xtb.com/web-api/v2/languages/es/branches/cl/instruments";
const PAGE_SIZE = 500;
const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

const SUFFIX = {
  DE: { exchange: "Börse Xetra", mic: "XETR" },
  UK: { exchange: "London Stock Exchange", mic: "XLON" },
  UK_INT: { exchange: "London IOB", mic: "XLON" },
  FR: { exchange: "Euronext Paris", mic: "XPAR" },
  NL: { exchange: "Euronext Amsterdam", mic: "XAMS" },
  BE: { exchange: "Euronext Brussels", mic: "XBRU" },
  PT: { exchange: "Euronext Lisbon", mic: "XLIS" },
  IT: { exchange: "Euronext Milan", mic: "XMIL" },
  ES: { exchange: "Bolsa de Madrid", mic: "XMAD" },
  CH: { exchange: "SIX Swiss Exchange", mic: "XSWX" },
  PL: { exchange: "Warsaw Stock Exchange", mic: "XWAR" },
  CZ: { exchange: "Prague Stock Exchange", mic: "XPRA" },
  DK: { exchange: "Nasdaq Copenhagen", mic: "XCSE" },
  SE: { exchange: "Nasdaq Stockholm", mic: "XSTO" },
  FI: { exchange: "Nasdaq Helsinki", mic: "XHEL" },
  NO: { exchange: "Oslo Børs", mic: "XOSL" },
};

// Listing exchange code of the US symbol directories.
const US_PLACES = {
  Q: { exchange: "Nasdaq", mic: "XNAS" },
  N: { exchange: "New York Stock Exchange", mic: "XNYS" },
  A: { exchange: "NYSE American", mic: "XASE" },
  P: { exchange: "NYSE Arca", mic: "ARCX" },
  Z: { exchange: "Cboe BZX", mic: "BATS" },
  M: { exchange: "NYSE Texas", mic: "XCHI" },
  F: { exchange: "Texas Stock Exchange", mic: "TXSE" },
  V: { exchange: "IEX", mic: "IEXG" },
};

// XTB spellings no rule below finds.
const ALIAS = { GOOGC: "GOOG" };

const TYPES = [
  { slug: "cashstocks", type: "STOCK", byCountry: true },
  { slug: "etfs", type: "ETF" },
  { slug: "etcs", type: "ETC" },
  { slug: "etns", type: "ETN" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getBody(url, json) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return json ? response.json() : response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

async function readAll(slug, country) {
  const items = new Map();
  let counts = null;
  let countries = null;
  for (let page = 1; page < 100; page += 1) {
    const query = new URLSearchParams({ typeSlug: slug, page: String(page), pageSize: String(PAGE_SIZE) });
    if (country) query.set("country", country);
    const data = await getBody(`${API}?${query}`, true);
    counts ??= data.instrumentCounts;
    if (!countries && !Array.isArray(data.instrumentTypes)) countries = data.instrumentTypes?.[slug]?.countries || [];
    const batch = Object.values(data.instrumentsCollectionLimited?.[slug] || {});
    for (const item of batch) items.set(item.symbol, item);
    await sleep(400);
    if (batch.length < PAGE_SIZE) break;
  }
  return { items: [...items.values()], counts, countries };
}

// --- US symbol directories ---
// The web copy can answer with a bot check: the FTP copy (same files) first.
async function directoryFile(url, header) {
  let body = "";
  try {
    body = execFileSync("curl", ["-s", "--max-time", "120", `ftp://ftp.nasdaqtrader.com/symboldirectory/${url.split("/").at(-1)}`], { maxBuffer: 64 << 20 }).toString("utf8");
  } catch {
    body = "";
  }
  if (!body.startsWith(header)) body = await getBody(url);
  if (!body.startsWith(header)) throw new Error(`${url}: unexpected header ${body.slice(0, 80)}`);
  const stamp = body.match(/File Creation Time: (\d{2})(\d{2})(\d{4})(\d{2}:\d{2})/);
  return { body, stamp: stamp ? `${stamp[3]}-${stamp[1]}-${stamp[2]} ${stamp[4]}` : "?" };
}
const nasdaqFile = await directoryFile(NASDAQ_LISTED, "Symbol|Security Name|Market Category|Test Issue");
const otherFile = await directoryFile(OTHER_LISTED, "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF");
const directory = new Map();
for (const line of nasdaqFile.body.split(/\r?\n/).slice(1)) {
  const cells = line.split("|");
  if (cells.length < 8 || line.startsWith("File Creation Time")) continue;
  const [symbol, name, , test, , , etf] = cells;
  if (test !== "Y") directory.set(symbol, { code: "Q", name: name.trim(), etf: etf === "Y", file: "nasdaqlisted" });
}
for (const line of otherFile.body.split(/\r?\n/).slice(1)) {
  const cells = line.split("|");
  if (cells.length < 8 || line.startsWith("File Creation Time")) continue;
  const [symbol, name, code, , etf, , test] = cells;
  if (test !== "Y") directory.set(symbol, { code, name: name.trim(), etf: etf === "Y", file: "otherlisted" });
}
if (directory.size < 10000) throw new Error(`the directories hold only ${directory.size} lines`);

// --- names ---
const NAME_NOISE = new Set(
  ("inc incorporated corp corporation co cos company companies ltd limited plc sa nv ag se the and of " +
    "class common stock shares share ordinary capital american depositary depository adr ads gdr each " +
    "representing one new holding holdings group llc lp de cv sab trust reit").split(" "),
);
function nameWords(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\s-\s.*$/, " ")
    .replace(/\bclass [a-z]\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !NAME_NOISE.has(word));
}
function shareClass(name) {
  return String(name || "").match(/\bclass ([a-z])\b/i)?.[1].toUpperCase() || "";
}
// Share of the shorter name's words found in the other.
function likeness(a, b) {
  const left = nameWords(a);
  const right = new Set(nameWords(b));
  if (!left.length || !right.size) return 0;
  return left.filter((word) => right.has(word)).length / Math.min(left.length, right.size);
}
function sameClass(a, b) {
  const left = shareClass(a);
  const right = shareClass(b);
  return !left || !right || left === right;
}
const SECURITY_TAIL = /\s*(?:-\s*)?(?:(?:Series \w+ |New )?(?:Class [A-Z] )?(?:Common Stock|Common Shares|Common stock|Ordinary Shares?|Capital Stock|American Depositary Shares|American depositary shares|Closed End Fund|Common Shares of Beneficial Interest)\b.*)$/i;
function listedName(entry) {
  return entry.name.replace(SECURITY_TAIL, "").replace(/\s+-\s*$/, "").trim() || entry.name;
}

// Directory lines by full company name, shares only (no warrant, unit,
// right, preferred, note or ETF line).
const byName = new Map();
for (const [symbol, entry] of directory) {
  if (entry.etf || /\$/.test(symbol)) continue;
  if (/warrant|\bunits?\b|\brights?\b|preferred|\bnotes?\b|debenture|\d\/\d/i.test(entry.name)) continue;
  const key = nameWords(entry.name).join(" ");
  if (!key) continue;
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(symbol);
}

// ISINs of US tickers in assets/*.csv, both ways.
const tickerIsins = new Map();
const isinTickers = new Map();
for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
  for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "")) || [];
    const [symbol, place, isin, name] = cells;
    if (!["NYSE", "NASDAQ", "AMEX", "CBOE"].includes(place) || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin || "")) continue;
    const ticker = symbol.split(":").pop().toUpperCase();
    if (!tickerIsins.has(ticker)) tickerIsins.set(ticker, []);
    tickerIsins.get(ticker).push({ isin, name });
    if (!isinTickers.has(isin)) isinTickers.set(isin, new Set());
    isinTickers.get(isin).add(ticker);
  }
}
const isinsOfTicker = (ticker) => new Set((tickerIsins.get(ticker) || []).map((entry) => entry.isin));

// ISINs XTB itself prints in its OMI tables (read by brokers/xtb).
const xtbIsin = new Map();
const xtbFile = new URL("../xtb/xtb-parsed.json", import.meta.url);
if (fs.existsSync(xtbFile)) {
  for (const row of JSON.parse(fs.readFileSync(xtbFile, "utf8"))) {
    const symbol = String(row.raw || "").split(" ")[0];
    if (!row.isin || !symbol.includes(".")) continue;
    if (!xtbIsin.has(symbol)) xtbIsin.set(symbol, new Set());
    xtbIsin.get(symbol).add(row.isin);
  }
}

function currencyOf(item) {
  if (/^[A-Z]{3}$/.test(item.currencyCode || "")) return item.currencyCode;
  return String(item.min_order_size || "").match(/\b([A-Z]{3})\b/)?.[1] || "";
}

// Where an American XTB line is listed today, or why it is not.
function findListing(symbol, ticker, type, name) {
  const own = xtbIsin.get(symbol) || new Set();
  const share = type === "STOCK";
  const fits = (candidate) => {
    const entry = directory.get(candidate);
    return entry && !(share && entry.etf) && sameClass(name, entry.name) && likeness(name, entry.name) >= 0.5;
  };
  const entry = directory.get(ticker);
  if (entry) {
    const like = likeness(name, entry.name);
    if (share && entry.etf && like < 0.5) return { reused: `${entry.name} (ETF)` };
    if (share && !own.size && like === 0) return { reused: entry.name };
    return { target: ticker, how: "exact", isin: own.size === 1 ? [...own][0] : "" };
  }
  // A class letter put after the ticker (GOOGC) needs the very same name:
  // AACT (Ares Acquisition II) is not AAC (Ares Acquisition III).
  const sameName = (candidate) => fits(candidate) && nameWords(name).join(" ") === nameWords(directory.get(candidate).name).join(" ");
  const spellings = [];
  if (ALIAS[ticker]) spellings.push([ALIAS[ticker], (candidate) => directory.has(candidate)]);
  if (/^[A-Z]+\d$/.test(ticker)) spellings.push([ticker.slice(0, -1), fits]);
  if (/^[A-Z]{3,6}$/.test(ticker)) spellings.push([`${ticker.slice(0, -1)}.${ticker.slice(-1)}`, fits], [ticker.slice(0, -1), sameName]);
  const spelled = spellings.find(([candidate, test]) => test(candidate))?.[0];
  if (spelled) return { target: spelled, how: "spelling", isin: own.size === 1 ? [...own][0] : "" };
  // Renamed: same ISIN on another listed ticker. Without XTB's own ISIN,
  // the ISINs assets/*.csv gives the old ticker (its name there may already
  // be the new one); several listed tickers leave the line unresolved.
  const isins = own.size ? [...own] : (tickerIsins.get(ticker) || []).map((entry) => entry.isin);
  const renamed = new Map();
  for (const isin of new Set(isins)) {
    for (const candidate of isinTickers.get(isin) || []) {
      if (candidate !== ticker && directory.has(candidate) && !(share && directory.get(candidate).etf)) renamed.set(candidate, isin);
    }
  }
  if (renamed.size === 1) {
    const [[target, isin]] = renamed;
    return { target, how: "isin", isin };
  }
  // Renamed: the very same company name on one directory line.
  const key = nameWords(name).join(" ");
  const hits = key.includes(" ") ? (byName.get(key) || []).filter((candidate) => sameClass(name, directory.get(candidate).name)) : [];
  if (hits.length === 1) return { target: hits[0], how: "name", isin: own.size === 1 ? [...own][0] : "" };
  return { gone: true };
}

const rows = [];
const skipped = { closeOnly: {}, unknownSuffix: [], goneUs: [], reusedUs: [], duplicateUs: [] };
const renamedUs = [];
const usLines = [];
const announced = {};
const fetched = {};

function emit(item, type, placeCode) {
  const symbol = item.symbol;
  const suffix = symbol.split(".").pop();
  const code = placeCode || suffix;
  if (item.close_only || /^CLOSE ONLY\b/i.test(item.display_name || "")) {
    const key = `${code} ${type}`;
    skipped.closeOnly[key] = (skipped.closeOnly[key] || 0) + 1;
    return;
  }
  const currency = currencyOf(item);
  const ticker = symbol.slice(0, -(suffix.length + 1));
  const name = item.display_name || item.company_name || item.description || ticker;
  const raw = [symbol, name, item.stock_market || "", currency, item.min_order_size || ""].filter(Boolean).join(" | ");
  if (code === "US") {
    const listing = findListing(symbol, ticker, type, name);
    if (listing.gone) skipped.goneUs.push(symbol);
    else if (listing.reused) skipped.reusedUs.push(`${symbol} (${name}; ${ticker} is now ${listing.reused})`);
    else usLines.push({ symbol, ticker, name, type, currency, raw, ...listing });
    return;
  }
  const place = SUFFIX[code];
  if (!place) {
    skipped.unknownSuffix.push(symbol);
    return;
  }
  const ids = xtbIsin.get(symbol);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: place.exchange,
    mic: place.mic,
    currency,
    type,
    isin: ids?.size === 1 ? [...ids][0] : "",
    raw,
  });
}

for (const { slug, type, byCountry } of TYPES) {
  if (byCountry) {
    const first = await readAll(slug, "US");
    const countries = first.countries.map((entry) => entry.countrySymbol);
    if (!countries.includes("US") || countries.length < 15) throw new Error(`${slug}: countries ${countries.join(",")}`);
    for (const country of countries) {
      const { items, counts } = country === "US" ? first : await readAll(slug, country);
      announced[`${slug}-${country}`] = counts[`${slug}-${country}`];
      fetched[`${slug}-${country}`] = items.length;
      for (const item of items) emit(item, type, country);
    }
    announced[slug] = first.counts[slug];
    fetched[slug] = countries.reduce((sum, country) => sum + fetched[`${slug}-${country}`], 0);
  } else {
    const { items, counts } = await readAll(slug);
    announced[slug] = counts[slug];
    fetched[slug] = items.length;
    for (const item of items) emit(item, type);
  }
}

// One XTB line per listed ticker: the one whose ISIN agrees with the listed
// ticker's, then the one spelled as listed; the others are stale duplicates.
const RANK = { exact: 0, spelling: 1, isin: 2, name: 3 };
const byTarget = new Map();
for (const line of usLines) {
  if (!byTarget.has(line.target)) byTarget.set(line.target, []);
  byTarget.get(line.target).push(line);
}
for (const [target, lines] of byTarget) {
  const listed = isinsOfTicker(target);
  const score = (line) => {
    const own = [...(xtbIsin.get(line.symbol) || [])];
    const isin = line.how === "isin" ? [line.isin] : own;
    if (!listed.size || !isin.length) return 1;
    return isin.some((value) => listed.has(value)) ? 0 : 2;
  };
  lines.sort((a, b) => score(a) - score(b) || RANK[a.how] - RANK[b.how]);
  const [kept, ...rest] = lines;
  for (const line of rest) skipped.duplicateUs.push(`${line.symbol} (${line.name}) = ${target}, kept ${kept.symbol}`);
  const entry = directory.get(target);
  const place = US_PLACES[entry.code];
  if (!place) throw new Error(`${target}: unknown listing exchange ${entry.code}`);
  const renamed = kept.how === "isin" || kept.how === "name";
  if (kept.target !== kept.ticker) renamedUs.push(`${kept.ticker}->${target}${renamed ? "" : "*"}`);
  rows.push({
    query: target,
    ticker: target,
    name: renamed ? listedName(entry) : kept.name,
    exchange: place.exchange,
    mic: place.mic,
    currency: kept.currency,
    type: kept.type,
    isin: kept.isin,
    raw: `${kept.raw} | ${entry.file} ${kept.ticker === target ? "" : `${target} `}${entry.name}`,
  });
}

// --- European and London lines against the exchanges' own lists ---
// Name words, where a list word cut short with a dot counts for the longer
// word of XTB's it starts (Deutsche Börse writes "BAY.MOTOREN", "UTD
// MOB.TECHN."). The score is the
// share of XTB's words found: all of them for a one- or two-word name, two
// thirds otherwise (Deutsche Post is not Deutsche Bank).
const LIST_NOISE = new Set("na on inh eo dl sf vzo vz st nam akt hldg hldgs publ oyj asa ab spa nv bv kgaa reg ord".split(" "));
function nameMatches(xtbName, listName) {
  const left = nameWords(xtbName).filter((word) => !LIST_NOISE.has(word));
  const right = nameWords(listName).filter((word) => !LIST_NOISE.has(word));
  if (!left.length || !right.length) return false;
  // Only a word the list itself cuts short with a dot stands for a longer one.
  const cut = new Set([...String(listName).toLowerCase().matchAll(/([a-z]{3,})\./g)].map((match) => match[1]));
  const found = left.filter((word) => right.some((other) => other === word || (cut.has(other) && word.startsWith(other)))).length;
  return found === left.length || (found >= 2 && found / left.length >= 2 / 3);
}
const loose = (text) => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// mic -> [{mic, isin, symbol, name, currency}]
const listed = new Map();
function addListed(entry) {
  if (!listed.has(entry.mic)) listed.set(entry.mic, []);
  listed.get(entry.mic).push(entry);
}
function csvCells(line, separator) {
  const pattern = new RegExp(`("[^"]*"|[^${separator}]*)(${separator}|$)`, "g");
  return (line.match(pattern) || []).map((cell) => cell.replace(new RegExp(`${separator}$`), "").replace(/^"|"$/g, "").trim());
}

const EURONEXT_FILES = [
  "https://live.euronext.com/en/pd_es/data/stocks/download?mics=dm_all_stock",
  "https://live.euronext.com/en/pd_es/data/track/download?mics=XPAR,XAMS,XBRU,XLIS,ETFP,XMSM,XOSL,XMIL",
];
// Euronext "Market" -> the MIC of XTB's line. The Expert Market holds
// delisted shares; EuroTLX and the after-hours book are not listings.
function euronextMics(market) {
  if (/Expert|After Hours|EuroTLX|Dublin/.test(market)) return [];
  const mics = [];
  if (/Paris/.test(market)) mics.push("XPAR");
  if (/Amsterdam/.test(market)) mics.push("XAMS");
  if (/Brussels/.test(market)) mics.push("XBRU");
  if (/Lisbon/.test(market)) mics.push("XLIS");
  if (/Milan|Global Equity Market|ETF Plus/.test(market)) mics.push("XMIL");
  if (/Oslo/.test(market)) mics.push("XOSL");
  return mics;
}
let euronextCount = 0;
for (const url of EURONEXT_FILES) {
  const lines = (await getBody(url)).replace(/^﻿/, "").split(/\r?\n/);
  const header = csvCells(lines[0], ";");
  const [nameAt, isinAt, symbolAt, marketAt, currencyAt] = ["Name", "ISIN", "Symbol", "Market", "Currency"].map((column) => header.indexOf(column));
  if ([nameAt, isinAt, symbolAt, marketAt, currencyAt].some((index) => index < 0)) throw new Error(`${url}: columns moved`);
  for (const line of lines.slice(1)) {
    const cells = csvCells(line, ";");
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(cells[isinAt] || "")) continue;
    for (const mic of euronextMics(cells[marketAt])) {
      addListed({ mic, isin: cells[isinAt], symbol: cells[symbolAt], name: cells[nameAt], currency: cells[currencyAt], source: "Euronext" });
      euronextCount += 1;
    }
  }
  await sleep(1000);
}
if (euronextCount < 5000) throw new Error(`Euronext files hold only ${euronextCount} lines`);

// Deutsche Börse: Xetra, then the Frankfurt floor.
async function deutscheBoerse(page, file, mic, least) {
  let href = "";
  for (let attempt = 0; attempt < 4 && !href; attempt += 1) {
    if (attempt) await sleep(2000 * attempt);
    href = (await getBody(page)).match(new RegExp(`href="([^"]*${file})"`))?.[1] || "";
  }
  if (!href) throw new Error(`${page} no longer links ${file}`);
  const lines = (await getBody(new URL(href, page).href)).split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("Product Status;"));
  const header = (lines[at] || "").split(";");
  const [status, nameAt, isinAt, mnemonic, currencyAt, kind] = ["Instrument Status", "Instrument", "ISIN", "Mnemonic", "Currency", "Instrument Type"].map((column) => header.indexOf(column));
  if ([status, nameAt, isinAt, mnemonic, currencyAt, kind].some((index) => index < 0)) throw new Error(`${file}: columns moved`);
  let count = 0;
  for (const line of lines.slice(at + 1)) {
    const cells = line.split(";");
    // Shares and exchange-traded products; not the bonds, funds and warrants.
    if (cells[status] !== "Active" || !["CS", "ETF", "ETN", "ETC"].includes(cells[kind]) || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(cells[isinAt] || "")) continue;
    addListed({ mic, isin: cells[isinAt], symbol: cells[mnemonic].trim(), name: cells[nameAt].trim(), currency: cells[currencyAt].trim(), source: file });
    count += 1;
  }
  if (count < least) throw new Error(`${file}: only ${count} active lines`);
  return count;
}
const DB_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";
const xetraCount = await deutscheBoerse(DB_PAGE, "t7-xetr-allTradableInstruments.csv", "XETR", 4000);
const frankfurtCount = await deutscheBoerse(`${DB_PAGE}/boersefrankfurt`, "t7-xfra-BF-allTradableInstruments.csv", "XFRA", 12000);

// SIX: one line per issuer (its main share), so other classes of a listed
// issuer (Roche's ROG) are found by name and never taken for duplicates.
const SIX_ISSUERS = "https://www.six-group.com/sheldon/equity_issuers/v1/equity_issuers.csv";
let sixCount = 0;
{
  const lines = (await getBody(SIX_ISSUERS)).replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0].split(";");
  const [nameAt, isinAt, symbolAt, currencyAt] = ["Company", "ISIN", "Symbol", "Traded Currency"].map((column) => header.indexOf(column));
  if ([nameAt, isinAt, symbolAt, currencyAt].some((index) => index < 0)) throw new Error("SIX issuers: columns moved");
  for (const line of lines.slice(1)) {
    const cells = line.split(";");
    if (!cells[isinAt]) continue;
    addListed({ mic: "XSWX", isin: cells[isinAt], symbol: cells[symbolAt], name: cells[nameAt], currency: cells[currencyAt], source: "SIX", perIssuer: true });
    sixCount += 1;
  }
  if (sixCount < 200) throw new Error(`SIX lists only ${sixCount} issuers`);
}

// Nasdaq Nordic: main market and First North of each exchange.
const NORDIC = { STO: "XSTO", HEL: "XHEL", CPH: "XCSE" };
const nordicCount = {};
for (const [market, mic] of Object.entries(NORDIC)) {
  for (const category of ["MAIN_MARKET", "FIRST_NORTH"]) {
    const data = await getBody(`https://api.nasdaq.com/api/nordic/screener/shares?category=${category}&tableonly=false&market=${market}`, true);
    for (const row of data?.data?.instrumentListing?.rows || []) {
      addListed({ mic, isin: row.isin, symbol: row.symbol, name: row.fullName, currency: row.currency, source: "Nasdaq Nordic" });
      nordicCount[mic] = (nordicCount[mic] || 0) + 1;
    }
    await sleep(800);
  }
  if ((nordicCount[mic] || 0) < 120) throw new Error(`Nasdaq Nordic ${market}: only ${nordicCount[mic]} lines`);
}

// One XTB line against the lines of its place: own ISIN, then the ticker
// (respelled: "SAAB B" is SAABB; for a share, unless the names share no
// word), then the company name.
const CHECKED = new Set(["XETR", "XPAR", "XAMS", "XBRU", "XLIS", "XMIL", "XOSL", "XSWX", "XSTO", "XHEL", "XCSE"]);
function listingsFor(row) {
  // The Frankfurt floor only for a share XTB itself gives an ISIN: a line
  // without one is an old spelling (DPW is now a Canadian receipt there).
  // Shares only: an ETP of XTB's is a Xetra line (the floor still lists
  // iBonds that matured in December 2025).
  const places = row.mic === "XETR" && row.isin && row.type === "STOCK" ? ["XETR", "XFRA"] : [row.mic];
  for (const how of ["isin", "ticker", "name"]) {
    for (const mic of places) {
      const lines = listed.get(mic) || [];
      let hits = [];
      if (how === "isin" && row.isin) hits = lines.filter((entry) => entry.isin === row.isin);
      // A ticker hit needs the ISIN or one word of the name to agree; an
      // ETP's list name is a code ("A.ETF-S+P W.COMM.S.SC.UEA") and its
      // symbol is not handed on, so the symbol suffices there.
      if (how === "ticker") hits = lines.filter((entry) => loose(entry.symbol) === loose(row.ticker) && (entry.isin === row.isin || row.type !== "STOCK" || likeness(row.name, entry.name) > 0 || nameMatches(row.name, entry.name)));
      if (how === "name") hits = lines.filter((entry) => nameMatches(row.name, entry.name));
      // An ISIN on several lines of one place (one per currency): the one of
      // XTB's ticker, else the one of XTB's currency.
      if (hits.length > 1 && how === "isin") {
        const narrowed = hits.filter((entry) => loose(entry.symbol) === loose(row.ticker));
        hits = narrowed.length ? narrowed : hits.filter((entry) => entry.currency === row.currency).length ? hits.filter((entry) => entry.currency === row.currency) : hits;
      }
      if (hits.length) return { how, mic, hits };
    }
  }
  return null;
}
const european = rows.filter((row) => CHECKED.has(row.mic));
const found = new Map(european.map((row) => [row, listingsFor(row)]));
const claimed = new Set();
for (const [row, match] of found) if (match && match.how !== "name") match.hits.forEach((entry) => claimed.add(entry));
const dropped = { gone: [], duplicate: [], frankfurtOnly: [] };
const dropRows = new Set();
const byEntry = new Map();
const recurrenced = [];
for (const [row, match] of found) {
  const label = `${row.ticker}.${row.mic} (${row.name})`;
  if (!match) {
    dropped.gone.push(label);
    dropRows.add(row);
    continue;
  }
  if (match.how === "name" && !match.hits[0].perIssuer && match.hits.every((entry) => claimed.has(entry))) {
    dropped.duplicate.push(`${label} = ${match.hits.map((entry) => entry.symbol).join("/")}`);
    dropRows.add(row);
    continue;
  }
  if (match.hits.length === 1 && !match.hits[0].perIssuer) {
    const [entry] = match.hits;
    // Two XTB lines on one exchange line: the one spelled as listed stays.
    if (byEntry.has(entry)) {
      const other = byEntry.get(entry);
      const keepThis = loose(row.ticker) === loose(entry.symbol) && loose(other.ticker) !== loose(entry.symbol);
      const loser = keepThis ? other : row;
      dropped.duplicate.push(`${loser.ticker}.${loser.mic} (${loser.name}) = ${entry.symbol}`);
      dropRows.add(loser);
      if (keepThis) byEntry.set(entry, row);
    } else byEntry.set(entry, row);
    row.isin = entry.isin;
    // Deutsche Börse quotes one ISIN in several currencies, a mnemonic each.
    if (entry.source.startsWith("t7-") && loose(entry.symbol) === loose(row.ticker) && /^[A-Z]{3}$/.test(entry.currency) && entry.currency !== row.currency) {
      recurrenced.push(`${row.ticker} ${row.currency}->${entry.currency}`);
      row.currency = entry.currency;
    }
  }
  if (match.mic === "XFRA") {
    dropped.frankfurtOnly.push(label);
    row.exchange = "Börse Frankfurt";
    row.mic = "XFRA";
  }
}

// London: the LSE's own record of each TIDM, as brokers/aviva reads it. XTB
// drops the LSE's dot (BP. is "BP", BT.A is "BTA"). A TIDM the LSE does not
// know, or one suspended for a month and more, is gone; a line found only
// by ISIN under another TIDM (BDEV -> BTRW) takes that TIDM, and is dropped
// when XTB already carries it.
// Answers are kept a few days in xtbcl-lse-cache.json, so a rerun asks
// again only for what changed; the API blocks a burst for a while (403).
const LSE_CACHE = new URL("xtbcl-lse-cache.json", import.meta.url);
const LSE_DAYS = 3;
const lseCache = fs.existsSync(LSE_CACHE) ? JSON.parse(fs.readFileSync(LSE_CACHE, "utf8")) : {};
let lseAsked = 0;
async function lseJson(path) {
  const saved = lseCache[path];
  if (saved && Date.now() - Date.parse(saved.at) < LSE_DAYS * 86400_000) return saved.body;
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await sleep(400);
    try {
      const response = await fetch(`https://api.londonstockexchange.com/api/gw/lse/${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404 || response.ok) {
        const body = response.ok ? await response.json() : null;
        lseCache[path] = { at: new Date().toISOString(), body };
        if (++lseAsked % 50 === 0) fs.writeFileSync(LSE_CACHE, JSON.stringify(lseCache));
        return body;
      }
      last = `${response.status} ${path}`;
      if (response.status === 403 || response.status === 429) {
        fs.writeFileSync(LSE_CACHE, JSON.stringify(lseCache));
        await sleep(60_000 * (attempt + 1));
        continue;
      }
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  fs.writeFileSync(LSE_CACHE, JSON.stringify(lseCache));
  throw new Error(`LSE ${last}`);
}
const lseHeld = (currency) => (String(currency || "").toUpperCase() === "GBX" ? "GBP" : String(currency || "").toUpperCase());
async function lseRecord(row) {
  const ticker = row.ticker.toUpperCase();
  const spellings = [...new Set([ticker, `${ticker}.`, ticker.length >= 3 ? `${ticker.slice(0, -1)}.${ticker.slice(-1)}` : ticker])];
  for (const tidm of spellings) {
    const record = await lseJson(`instruments/alldata/${encodeURIComponent(tidm)}`);
    if (!record?.isin) continue;
    const named = record.issuername || record.description || "";
    const agrees = record.isin === row.isin || nameMatches(row.name, named) || nameMatches(named, row.name);
    if (agrees || (tidm === ticker && likeness(row.name, named) > 0)) return { record, how: "tidm" };
  }
  if (!row.isin) return null;
  const search = await lseJson(`search/autocomplete?q=${row.isin}`);
  const candidates = [];
  for (const item of search?.instruments || []) {
    if (item.code !== row.isin && item.isin !== row.isin) continue;
    if (item.islse !== true) continue;
    const record = await lseJson(`instruments/alldata/${encodeURIComponent(item.tidm)}`);
    if (record?.isin === row.isin) candidates.push(record);
  }
  const record = candidates.find((candidate) => lseHeld(candidate.currency) === row.currency) || (candidates.length === 1 ? candidates[0] : null);
  return record ? { record, how: "isin" } : null;
}
const london = rows.filter((row) => row.mic === "XLON");
const lseResults = new Map();
{
  let next = 0;
  const worker = async () => {
    while (next < london.length) {
      const row = london[next++];
      lseResults.set(row, await lseRecord(row));
    }
  };
  await worker();
  fs.writeFileSync(LSE_CACHE, JSON.stringify(lseCache));
}
const now = Date.now();
const lseKept = new Map();
const lseDropped = { gone: [], suspended: [], duplicate: [], retidm: [] };
for (const row of london) {
  const label = `${row.ticker}.UK (${row.name})`;
  const result = lseResults.get(row);
  if (!result) {
    lseDropped.gone.push(label);
    dropRows.add(row);
    continue;
  }
  const { record, how } = result;
  const lastClose = Date.parse(record.lastclosedate || "");
  if (record.tradingstatus === "S" && !(now - lastClose < 30 * 86400_000)) {
    lseDropped.suspended.push(`${label} since ${String(record.lastclosedate || "?").slice(0, 10)}`);
    dropRows.add(row);
    continue;
  }
  const key = `${record.tidm}|${row.exchange}`;
  if (lseKept.has(key)) {
    const other = lseKept.get(key);
    const loser = how === "tidm" && other.how === "isin" ? other.row : row;
    lseDropped.duplicate.push(`${loser.raw.split(" | ")[0]} (${loser.name}) = ${record.tidm}`);
    dropRows.add(loser);
    if (loser === other.row) lseKept.set(key, { row, how });
    continue;
  }
  lseKept.set(key, { row, how });
  row.isin = record.isin;
  if (how === "isin") {
    const tidm = record.tidm.replace(/\.$/, "").replace(/\./g, "");
    lseDropped.retidm.push({ row, text: `${row.ticker}->${tidm}` });
    row.raw = `${row.raw} | LSE ${record.tidm}`;
    row.ticker = tidm;
    row.query = tidm;
  }
}
const before = rows.length;
for (let index = rows.length - 1; index >= 0; index -= 1) if (dropRows.has(rows[index])) rows.splice(index, 1);

for (const [key, total] of Object.entries(announced)) {
  if (total !== fetched[key]) throw new Error(`${key}: announced ${total}, fetched ${fetched[key]}`);
}
if (skipped.unknownSuffix.length) throw new Error(`unknown suffix: ${skipped.unknownSuffix.slice(0, 20).join(", ")}`);
if (rows.length < 7300) throw new Error(`only ${rows.length} rows`);
if (dropped.gone.length > 0.1 * european.length) throw new Error(`${dropped.gone.length} of ${european.length} European lines on no list: a list came out short`);
if (lseDropped.gone.length > 0.15 * london.length) throw new Error(`${lseDropped.gone.length} of ${london.length} London lines unknown to the LSE`);
if (skipped.goneUs.length > 0.2 * (usLines.length + skipped.goneUs.length)) throw new Error(`${skipped.goneUs.length} American lines in no directory`);
for (const [ticker, exchange] of [
  ["AAPL", "Nasdaq"],
  ["GOOG", "Nasdaq"],
  ["BRK.B", "New York Stock Exchange"],
  ["SPY", "NYSE Arca"],
  ["SAP", "Börse Xetra"],
  ["MC", "Euronext Paris"],
  ["NESN", "SIX Swiss Exchange"],
  ["NOVOB", "Nasdaq Copenhagen"],
  ["ZAB", "Warsaw Stock Exchange"],
  ["CEZ1", "Prague Stock Exchange"],
  ["SXR8", "Börse Xetra"],
]) {
  if (!rows.some((row) => row.ticker === ticker && row.exchange === exchange)) throw new Error(`${ticker} on ${exchange} missing`);
}

fs.writeFileSync(new URL("xtbcl-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.currency} ${row.type}`] = (counts[`${row.exchange} ${row.currency} ${row.type}`] || 0) + 1;
const closeOnly = Object.values(skipped.closeOnly).reduce((sum, count) => sum + count, 0);
console.log(`directories: nasdaqlisted ${nasdaqFile.stamp}, otherlisted ${otherFile.stamp}`);
console.log(
  `${rows.length} rows, ${rows.filter((row) => row.isin).length} with ISIN; left out: ${closeOnly} close-only, ` +
    `${skipped.goneUs.length} American lines in no directory, ${skipped.reusedUs.length} on a recycled ticker, ` +
    `${skipped.duplicateUs.length} stale duplicates`,
);
console.log(`close-only by place: ${JSON.stringify(skipped.closeOnly)}`);
console.log(`respelled (*) or renamed (${renamedUs.length}): ${renamedUs.join(" ")}`);
console.log(`in no directory (${skipped.goneUs.length}): ${skipped.goneUs.join(" ")}`);
console.log(`recycled ticker (${skipped.reusedUs.length}):\n  ${skipped.reusedUs.join("\n  ")}`);
console.log(`stale duplicates (${skipped.duplicateUs.length}):\n  ${skipped.duplicateUs.join("\n  ")}`);
console.log(
  `exchange lists: Euronext ${euronextCount}, Xetra ${xetraCount}, Frankfurt ${frankfurtCount}, SIX ${sixCount} issuers, ` +
    `Nasdaq Nordic ${JSON.stringify(nordicCount)}; ${before} rows before the European and London checks, ${rows.length} after`,
);
console.log(`European lines on no list of their place (${dropped.gone.length}):\n  ${dropped.gone.join("\n  ")}`);
console.log(`European stale duplicates (${dropped.duplicate.length}):\n  ${dropped.duplicate.join("\n  ")}`);
console.log(`moved to the Frankfurt floor, not on Xetra (${dropped.frankfurtOnly.length}): ${dropped.frankfurtOnly.join("; ")}`);
console.log(`currency of the Deutsche Börse mnemonic (${recurrenced.length}): ${recurrenced.join("; ")}`);
console.log(`London TIDMs the LSE does not know (${lseDropped.gone.length}):\n  ${lseDropped.gone.join("\n  ")}`);
console.log(`London lines suspended (${lseDropped.suspended.length}):\n  ${lseDropped.suspended.join("\n  ")}`);
console.log(`London stale duplicates (${lseDropped.duplicate.length}): ${lseDropped.duplicate.join("; ")}`);
const retidmed = lseDropped.retidm.filter((item) => !dropRows.has(item.row)).map((item) => item.text);
console.log(`London lines under a new TIDM (${retidmed.length}): ${retidmed.join(" ")}`);
console.table(counts);
