// What Just2Trade (J2T Services Ltd, Cyprus, CySEC 281/15) sells as shares,
// ETFs and ETPs, with no login.
//
// Just2Trade has four account families: MT5 Global (shares, futures, bonds,
// options, forex and CFDs in one MetaTrader 5 account), Forex & CFD
// (Standard / ECN, CFDs only), Global Futures (CQG, futures only) and
// Sterling Trader Pro (US shares for professional traders). The "Choose
// account type" control on these pages only picks a demo account: "Demo MT5
// Global" or "Demo Forex & CFDs". The share list below is the MT5 Global
// one: every Buy / Sell link on it and on each ticker page opens
// /openaccount/real/mt5-global/, the ticker pages say "open an MT5 Global
// universal trading account" to buy the share, and the MT5 Global tariff
// page links each country to the same tickers.
//
//   https://j2t.com/en/tickerinfo/stocks/KIND:INSTRUM:EQUITY:SHARE:<MARKET>?page=N
//   https://j2t.com/en/tickerinfo/stocks/KIND:INSTRUM:EQUITY:TOKYO
//   https://j2t.com/en/sitemap-tickerinfo/?page=N
//   https://j2t.com/en/solutions/mt5global/terms/
//
// Each market page is a table of 200 lines a page: ticker, title, price
// with its currency ("344.77$", "394.66 GBP") and a link to
// /tickerinfo/<symbol>/. Outside the US the symbol carries the MIC
// (AAL.XLON, 2GB.XETR, 0001.XHKG, 600519.XSHG, ABX.XTSE / XTSX, 558A.XJAS).
// The pages can repeat a line across two pages; lines are kept once by
// link, a market whose pages repeat is read a second time and the two
// reads are joined, and the ticker sitemap is checked for any share link
// the lists missed. A ticker page adds nothing usable: no ISIN, no
// exchange, no type, and its "About" and "Sector" blocks are often another
// company's (III.XLON shows Information Services Group), so they are not
// read.
//
// Markets and places:
//   USA (NYSE/NASDAQ): one row a title, since the US places are one NBBO
//     market. The list names no exchange per title. J2T writes CQS symbols
//     (BACpE, BRK.B), the ones Nasdaq Trader's symbol directory carries
//     with each title's listing exchange and an ETF flag:
//       https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//       https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//       (read from ftp://ftp.nasdaqtrader.com/symboldirectory/, same files)
//     A title the directory no longer carries takes the place
//     assets/stocks.csv or assets/etfs.csv files it on (NYSE, NASDAQ,
//     AMEX as NYSE Arca, CBOE); one those lists only know on OTC, or not at
//     all (Q, F, D and U suffixes, old preferreds), is written as OTC
//     Markets. The ticker is written BAC/PE, as the lists spell it.
//   UK (LSE): currency and ISIN from the LSE's own line for the TIDM. J2T
//     labels every London price "GBP" whatever the line: AAL's 3849 is
//     pence, CPG's 32.69 is the LSE's dollar line. A "GBP" line the LSE
//     does not answer for (AIM) is GBX; a "$" line (HSBK, an IOB GDR) USD.
//   Germany: the market is labelled "GERMANY (TRADEGATE/GETTEX)", the
//     symbols end in .XETR and the tariff page says "Germany
//     (TRADEGATE/XETRA)". Each title gets one row on each of the three
//     places, in EUR, with the ISIN of its Xetra line.
//   Hong Kong, Euronext Paris, Madrid, SIX, Toronto / TSX Venture, Warsaw,
//     Korea (XKRX, as J2T writes it), Singapore, Thailand, Shanghai,
//     Shenzhen, Tokyo: one place each, from the symbol's MIC. XJAS (the
//     old JASDAQ, now part of the Tokyo exchange) is written as Tokyo.
//   Russia (MOEX): left out. The list holds one line (SBER.MM), and the
//     MT5 Global tariff page says "Russia: Trading in MT5 is based on
//     forward contracts", so it is not a share; EU sanctions also bar
//     Moscow Exchange shares for an EU client.
// Outside the US `query` is J2T's symbol (BT.A.XLON) and `ticker` the part
// before the MIC (BT.A, BBD.B), since the ticker cell drops the share class;
// a two-letter London TIDM takes the LSE's dot (BP., RR.).
// Currency is the one printed with the price; a line with no price takes
// its market's currency.
//
// Type: the list and the ticker pages carry none, so it comes from the
// title and outside lists. ETN when the title says ETN or names an ETN
// family (iPath, MicroSectors, ETRACS, X-Links); ETC when it says ETC, ETP
// or Xetra-Gold. Otherwise ETF when the title says ETF, UCITS, iShares,
// "Tracker Fund", "Index Fund" or, in Xetra's short titles, "DB X-TR",
// "LYXOR", "COMSTAGE", "ETFLAB", "POWERSHARES"; in the US when the Nasdaq
// Trader directory flags it ETF (SPY, QQQ, VOO, GLD) or it is a fund on
// NYSE Arca or Cboe BZX in assets/etfs.csv; elsewhere when assets/etfs.csv
// files it on that market's place (2800, 3033, 2828 in Hong Kong; SXR8,
// EXS1 on Xetra) and it is not a closed-end vehicle, which that file
// files as funds too: a GB, GG or JE ISIN (UK investment trusts and
// companies) or a title with Trust, Investment, Split, Infrastructure,
// REIT, PLC, Ltd, Limited, Corp or Company. The rest are STOCK: US
// closed-end funds, investment trusts, REITs and preferreds included.
//
// ISIN: the LSE line for London; elsewhere the single ISIN assets/stocks.csv
// or assets/etfs.csv files for that ticker and place (several, or none,
// leaves it to stampRows, which writes `matches` or nothing).
//
// Other currency lines: Just2Trade takes deposits in USD and EUR
// (deposits.mjs, read with depositHas). Where the place trades the same ISIN
// on another line in one of those currencies, the title gets one more row
// for that line: same ISIN, place, name and type, the line's own currency
// and ticker, and a raw that ends with where the line came from; `query`
// stays J2T's symbol. A title with no ISIN gets none. The row J2T lists is
// kept, but where the exchange's source gives the currency of the listed
// counter itself (London, Hong Kong, Singapore, SIX) the row takes that
// currency, and its raw ends with "currency: <source>". A symbol SIX trades
// in several currencies keeps J2T's when it is one of them. The sources,
// one a place:
//   London: the LSE's own lines of the ISIN, each with its TIDM and
//     currency (lseLines in lseListings.mjs, the LSE API above). GBX is a
//     sterling line, not a dollar or euro one. The LSE blocks a burst of
//     calls for about three minutes, so every LSE call here goes one at a
//     time, 400 ms apart.
//   Hong Kong: HKEX's List of Securities, with each counter's stock code,
//     ISIN and trading currency; a dual counter (HKD / USD / RMB) has its
//     own code, so 2801's dollar counter is 9801. RMB counters are not
//     added.
//       https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   Singapore: SGX's ISIN file (ISIN and counter code; the address takes
//     a date and answers with the latest file) and SGX's securities feed
//     (each trading counter's currency): HPH Trust is NS8U in dollars and
//     P7VU in Singapore dollars. J2T prints every Singapore price in SGD
//     and every Hong Kong one in HKD, also on a dollar counter: NS8U, 9077
//     and 9078 are dollar counters, so their rows are written in USD.
//       https://links.sgx.com/1.0.0/isin/1/<DD Mon YYYY>
//       https://api.sgx.com/securities/v1.1?excludetypes=bonds
//   SIX: SIX's reference data, one line per trading currency (BTCA trades
//     in CHF, EUR and USD under one symbol).
//       https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency&where=ISIN=<ISIN>
//   Xetra: Deutsche Börse's list of every Xetra instrument, with ISIN,
//     mnemonic and currency, linked from the instruments page. None of
//     J2T's Xetra titles has a dollar line today. Tradegate and gettex
//     quote in euros only: nothing is added there.
//       https://www.xetra.com/xetra-en/instruments/instruments
//       (t7-xetr-allTradableInstruments.csv)
//   Euronext Paris: Euronext's share and ETF lists for Paris, with ISIN,
//     symbol and currency. Every Paris line in them is in euros today.
//       https://live.euronext.com/en/pd_es/data/stocks/download?mics=XPAR,ALXP
//       https://live.euronext.com/en/pd_es/data/track/download?mics=XPAR
//   Toronto / TSX Venture: TMX publishes no ISIN per line. TMX's company
//     directory says whether a <symbol>.U line exists; it is added only
//     when assets/*.csv files that .U line under the title's own ISIN, with
//     the currency TMX Money gives for it. ETHH.U, the one such line among
//     J2T's titles, is a separate unit class (CA74642N3067, not ETHH's
//     CA74642N1087), so nothing is added today.
//       https://www.tsx.com/json/company-directory/search/tsx/%5E*
//       https://www.tsx.com/json/company-directory/search/tsxv/%5E*
//       https://app-money.tmx.com/graphql (getQuoteBySymbol)
//   Shanghai, Shenzhen (CNY), Tokyo (JPY), Warsaw (PLN), Korea (KRW),
//     Thailand (THB): every line of these titles is in the local currency
//     (a Shanghai B share in dollars is another share, with its own code
//     and ISIN, and J2T lists A shares only), and Madrid trades in euros
//     only, so nothing is added. The US places are one NBBO
//     market in dollars: nothing is added there either.
//
// broker-list.json says "No US-domiciled ETFs (PRIIPs/KID)" for Just2Trade's
// US places. The US list still carries SPY, QQQ, VOO and the like; those
// funds (ETF, ETC, ETN on a US place) are kept for everyone, with no
// restriction or remark: Just2Trade lists them for sale (owner, 2026-10-20).
//
//   node brokers/just2trade/just2trade_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { lseLine, lseLines, heldAs } from "../../lseListings.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { depositHas } from "../../deposits.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://j2t.com/en";
const WORKERS = 4;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// J2T market code -> how its lines are written. `list` is the place code in
// assets/*.csv; `places` the rows each title becomes.
const MARKETS = {
  "SHARE:USA": { label: "USA", currency: "USD" },
  "SHARE:LONDON": { label: "UK", currency: "GBX", list: ["LSE"], places: [["London Stock Exchange", "XLON"]] },
  "SHARE:XETRA": {
    label: "Germany",
    currency: "EUR",
    list: ["XETR", "TRADEGATE", "GETTEX"],
    places: [["Börse Xetra", "XETR"], ["Tradegate", "XGAT"], ["gettex", "XMUN"]],
  },
  "SHARE:HONGKONG": { label: "Hong Kong", currency: "HKD", list: ["HKEX"], places: [["HKEX", "XHKG"]] },
  "SHARE:FRANCE": { label: "France", currency: "EUR", list: ["EURONEXT"], places: [["Euronext Paris", "XPAR"]] },
  "SHARE:SPAIN": { label: "Spain", currency: "EUR", list: ["BME"], places: [["Bolsa de Madrid", "XMAD"]] },
  "SHARE:SWITZERLAND": { label: "Switzerland", currency: "CHF", list: ["SIX"], places: [["SIX Swiss Exchange", "XSWX"]] },
  "SHARE:CANADA": { label: "Canada", currency: "CAD", list: ["TSX", "TSXV"], byMic: { XTSE: ["Toronto Stock Exchange", "XTSE"], XTSX: ["TSX Venture", "XTSX"] } },
  "SHARE:POLAND": { label: "Poland", currency: "PLN", list: ["GPW"], places: [["Warsaw Stock Exchange", "XWAR"]] },
  "SHARE:KOREA": { label: "Korea", currency: "KRW", list: ["KRX"], places: [["KOSPI", "XKRX"]] },
  "SHARE:SINGAPORE": { label: "Singapore", currency: "SGD", list: ["SGX"], places: [["Singapore Exchange", "XSES"]] },
  "SHARE:THAILAND": { label: "Thailand", currency: "THB", list: ["SET"], places: [["Stock Exchange of Thailand", "XBKK"]] },
  "SHARE:CHINA": { label: "China", currency: "CNY", list: ["SSE", "SZSE"], byMic: { XSHG: ["Shanghai Stock Exchange", "XSHG"], XSHE: ["Shenzhen Stock Exchange", "XSHE"] } },
  "SHARE:RUS": { label: "Russia", skip: "MT5 trades Russian shares as forward contracts" },
  TOKYO: { label: "Tokyo", currency: "JPY", list: ["TSE"], places: [["Tokyo Stock Exchange", "XTKS"]] },
};
const LIST_FILE = { XSHG: "SSE", XSHE: "SZSE", XTSE: "TSX", XTSX: "TSXV" };

// Nasdaq Trader's listing-exchange code -> [exchange, MIC, assets list place].
const US_PLACE = {
  Q: ["NASDAQ", "XNAS", "NASDAQ"],
  N: ["NYSE", "XNYS", "NYSE"],
  A: ["NYSE American", "XASE", "AMEX"],
  P: ["NYSE Arca", "ARCX", "AMEX"],
  Z: ["Cboe BZX", "BATS", "CBOE"],
  F: ["Texas Stock Exchange", "TXSE", ""],
  M: ["NYSE Texas", "XCHI", ""],
};
// assets list place -> the same, for a title the directory no longer carries.
const US_LIST = { NYSE: "N", NASDAQ: "Q", AMEX: "P", CBOE: "Z" };
const US_LISTS = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const OTC = ["OTC Markets", "OTCM", "OTC"];
const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function page(url, accept = "text/html") {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(700 * 2 ** attempt);
  }
  throw new Error(last);
}

async function pool(items, work) {
  const out = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const at = index++;
      out[at] = await work(items[at], at);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return out;
}

// The LSE's API blocks a burst of calls for about three minutes: its calls
// go one at a time, 400 ms apart, and a refusal waits the block out twice
// before it counts as one.
let lseNext = 0;
async function paced(work) {
  for (let attempt = 0; ; attempt += 1) {
    const wait = lseNext - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const out = await work();
      lseNext = Date.now() + 400;
      return out;
    } catch (error) {
      if (attempt >= 2) throw error;
      console.error(`LSE: ${error.message || error}; waiting 200 s`);
      lseNext = Date.now() + 200_000;
    }
  }
}

// ---- J2T lists --------------------------------------------------------

function listUrl(market, number) {
  return `${SITE}/tickerinfo/stocks/KIND:INSTRUM:EQUITY:${market}${number > 1 ? `?page=${number}` : ""}`;
}

function tableLines(html) {
  const lines = [];
  for (const [, row] of html.matchAll(/<tr class="tr__row">([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => normalize(match[1]));
    const href = row.match(/href="\/tickerinfo\/([^"\/]+)\/"/)?.[1];
    if (!href || !cells[1]) continue;
    lines.push({ slug: href.toLowerCase(), cell: cells[1], name: cells[2], price: cells[3] || "" });
  }
  return lines;
}

async function readMarket(market) {
  const first = await page(listUrl(market, 1));
  const pages = Math.max(1, ...[...first.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1])));
  const rest = await pool(Array.from({ length: pages - 1 }, (_, i) => i + 2), (number) => page(listUrl(market, number)));
  const lines = [first, ...rest].flatMap(tableLines);
  if (!lines.length) throw new Error(`${market}: empty list`);
  return { lines, pages };
}

async function marketLines(market) {
  const found = new Map();
  let { lines, pages } = await readMarket(market);
  for (const line of lines) found.set(line.slug, line);
  let repeats = lines.length - found.size;
  // Lines repeated across pages push others off: read once more and join.
  for (let pass = 0; repeats > 0 && pass < 2; pass += 1) {
    const before = found.size;
    ({ lines } = await readMarket(market));
    for (const line of lines) found.set(line.slug, line);
    console.error(`${market}: ${repeats} repeated lines, second read added ${found.size - before}`);
    if (found.size === before) break;
    repeats = lines.length - new Set(lines.map((line) => line.slug)).size;
  }
  console.error(`${market}: ${found.size} titles on ${pages} pages`);
  return [...found.values()];
}

async function sitemapSlugs() {
  const slugs = new Set();
  let last = 1;
  for (let number = 1; number <= last; number += 1) {
    const html = await page(`${SITE}/sitemap-tickerinfo/${number > 1 ? `?page=${number}` : ""}`);
    last = Math.max(last, ...[...html.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1])));
    for (const [, slug] of html.matchAll(/href="\/tickerinfo\/([^"\/]+)\/"/g)) slugs.add(slug.toLowerCase());
  }
  return slugs;
}

// ---- US symbol directory ----------------------------------------------

// The web copies of the directories sit behind an Incapsula check; Nasdaq
// Trader's own FTP server publishes the same files and is read with curl
// (Node has no FTP client). The web copy is the fallback.
async function directoryFile(url) {
  try {
    const ftp = `ftp://ftp.nasdaqtrader.com/symboldirectory/${url.split("/").at(-1)}`;
    const body = execFileSync("curl", ["-s", "--max-time", "120", ftp], { maxBuffer: 64 << 20 }).toString("utf8");
    if (/^(ACT )?Symbol\|/.test(body)) return body;
  } catch {
    // fall back to the web copy
  }
  return page(url, "text/plain");
}

// CQS symbol (BACpE, BRK.B) or Nasdaq symbol -> { code, etf }. Test issues out.
async function usDirectory() {
  const out = new Map();
  const other = (await directoryFile(OTHER_LISTED)).split(/\r?\n/);
  if (!/^ACT Symbol\|Security Name\|Exchange\|CQS Symbol\|ETF\|/.test(other[0])) throw new Error("otherlisted.txt header changed");
  for (const line of other.slice(1)) {
    const cells = line.split("|");
    if (cells.length < 8 || cells[6] === "Y" || !cells[3]) continue;
    out.set(cells[3], { code: cells[2], etf: cells[4] === "Y" });
  }
  const nasdaq = (await directoryFile(NASDAQ_LISTED)).split(/\r?\n/);
  if (!/^Symbol\|Security Name\|Market Category\|Test Issue\|Financial Status\|Round Lot Size\|ETF\|/.test(nasdaq[0])) throw new Error("nasdaqlisted.txt header changed");
  for (const line of nasdaq.slice(1)) {
    const cells = line.split("|");
    if (cells.length < 8 || cells[3] === "Y" || !cells[0]) continue;
    out.set(cells[0], { code: "Q", etf: cells[6] === "Y" });
  }
  if (out.size < 10_000) throw new Error(`the US directory holds only ${out.size} symbols`);
  return out;
}

// ---- assets lists -------------------------------------------------------

function csvCells(line) {
  return line.match(/("[^"]*"|[^,]*)(,|$)/g).map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, ""));
}

// place|ticker -> [{ isin, fund }]
function loadLists() {
  const book = new Map();
  for (const [file, fund] of [["etfs.csv", true], ["stocks.csv", false]]) {
    const path = new URL(`../../assets/${file}`, import.meta.url);
    for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const [code, place, isin] = csvCells(line);
      const ticker = String(code || "").split(":").pop().trim().toUpperCase();
      if (!ticker || !place || !ISIN.test(isin || "")) continue;
      const key = `${place}|${ticker}`;
      if (!book.has(key)) book.set(key, []);
      book.get(key).push({ isin, fund });
    }
  }
  if (book.size < 50_000) throw new Error(`assets lists hold only ${book.size} lines`);
  return book;
}

function keysOf(ticker) {
  const keys = new Set([ticker]);
  if (/^\d{1,6}$/.test(ticker)) {
    keys.add(ticker.replace(/^0+/, "") || "0");
    keys.add(ticker.padStart(6, "0"));
  }
  return [...keys];
}

function lookup(book, places, ticker) {
  const hits = [];
  for (const place of places) for (const key of keysOf(ticker)) for (const hit of book.get(`${place}|${key}`) || []) hits.push({ ...hit, place });
  return hits;
}

const single = (hits) => {
  const ids = new Set(hits.map((hit) => hit.isin));
  return ids.size === 1 ? [...ids][0] : "";
};

// ---- type ---------------------------------------------------------------

const FUND_NAME = /\bETF|\bUCITS\b|Tracker Fund|Index Fund|\biShares\b|\bDB X-?TR|X-TRACKERS|\bLYX(OR)?\b|COMSTAGE|ETFLAB|POWERSHARES|\bGOLDBUGS I\.FD/i;
const ETN_NAME = /\bETNs?\b|\biPath\b|MicroSectors|\bETRACS\b|X-Links/i;
// assets/etfs.csv files closed-end vehicles as funds too: UK investment
// trusts and companies (GB, GG, JE ISINs), Canadian split-share companies.
const CLOSED_END = /\bTrust\b|Closed Fund|Investment|\bSplit\b|Infrastructure|\bREIT\b|\bLimited\b|\bLtd\b|\bPLC\b|\bCorp\b|\bCompany\b/i;

function typeOf(name, fund, isin = "") {
  if (ETN_NAME.test(name)) return "ETN";
  if (/\b(ETC|ETP)\b|XETRA-GOLD/i.test(name)) return "ETC";
  if (FUND_NAME.test(name)) return "ETF";
  if (fund && !CLOSED_END.test(name) && !/^(GB|GG|JE)/.test(isin)) return "ETF";
  return "STOCK";
}

// ---- other currency lines -----------------------------------------------

const HKEX_LIST = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx";
const SGX_ISIN = "https://links.sgx.com/1.0.0/isin/1/";
const SGX_PRICES = "https://api.sgx.com/securities/v1.1?excludetypes=bonds";
const SIX_REF = "https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency&where=ISIN=";
const XETRA_PAGE = "https://www.xetra.com/xetra-en/instruments/instruments";
const EURONEXT_FILES = [
  "https://live.euronext.com/en/pd_es/data/stocks/download?mics=XPAR,ALXP",
  "https://live.euronext.com/en/pd_es/data/track/download?mics=XPAR",
];
const TSX_DIRECTORY = "https://www.tsx.com/json/company-directory/search/";
const TMX_QUOTE = "https://app-money.tmx.com/graphql";

async function download(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(180_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1500 * 2 ** attempt);
  }
  throw new Error(last);
}

function addLine(book, isin, line) {
  if (!book.has(isin)) book.set(isin, []);
  book.get(isin).push(line);
}

function columnIndex(ref) {
  let n = 0;
  for (const char of ref) {
    if (!/[A-Z]/i.test(char)) break;
    n = n * 26 + char.toUpperCase().charCodeAt(0) - 64;
  }
  return n - 1;
}

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// The first sheet of an .xlsx, as rows of strings (the parser of
// brokers/hsbchk). Node's zlib reads the zip; the workbook's entries carry
// their sizes in the local header.
function xlsxRows(bytes) {
  const files = new Map();
  let offset = 0;
  while (offset + 30 < bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6);
    const method = bytes.readUInt16LE(offset + 8);
    const compressed = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    if (flags & 0x8) throw new Error(`${name}: zip entry without sizes in its header`);
    const stored = bytes.subarray(start, start + compressed);
    files.set(name, method === 0 ? stored : inflateRawSync(stored));
    offset = start + compressed;
  }
  const tag = "(?:[a-z0-9]+:)?";
  const texts = (xml) => [...xml.matchAll(new RegExp(`<${tag}t\\b[^>]*>([\\s\\S]*?)</${tag}t>`, "g"))].map((m) => m[1]).join("");
  const shared = [];
  const sharedXml = files.get("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const item of sharedXml.toString("utf8").matchAll(new RegExp(`<${tag}si\\b[^>]*>([\\s\\S]*?)</${tag}si>`, "g"))) shared.push(texts(item[1]));
  }
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("the HKEX workbook has no sheet1");
  const rows = [];
  for (const row of sheet.toString("utf8").matchAll(new RegExp(`<${tag}row\\b[^>]*>([\\s\\S]*?)</${tag}row>`, "g"))) {
    const values = {};
    for (const cell of row[1].matchAll(new RegExp(`<${tag}c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}c>)`, "g"))) {
      const ref = cell[1].match(/\br="([A-Z]+)\d+"/i)?.[1] || "A";
      const type = cell[1].match(/\bt="([^"]+)"/)?.[1] || "";
      const body = cell[2] || "";
      const raw = body.match(new RegExp(`<${tag}v>([\\s\\S]*?)</${tag}v>`))?.[1] ?? "";
      const value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? texts(body) : raw;
      values[columnIndex(ref)] = unescapeXml(value).replace(/\s+/g, " ").trim();
    }
    const keys = Object.keys(values).map(Number);
    if (keys.length) rows.push(Array.from({ length: Math.max(...keys) + 1 }, (_, i) => values[i] ?? ""));
  }
  return rows;
}

// ISIN -> HKEX counters, each with its own stock code and trading currency.
// The code is written as J2T writes it: 00001 -> 0001, 09801 -> 9801.
async function hkexLines() {
  const table = xlsxRows(await download(HKEX_LIST));
  const header = table.find((row) => row[0] === "Stock Code") || [];
  const [isinAt, currencyAt] = ["ISIN", "Trading Currency"].map((name) => header.indexOf(name));
  if (isinAt < 0 || currencyAt < 0) throw new Error("the HKEX list has no ISIN / Trading Currency column");
  const out = new Map();
  for (const row of table) {
    const [code, isin, currency] = [row[0], row[isinAt], row[currencyAt] === "RMB" ? "CNY" : row[currencyAt]];
    if (!/^\d{5}$/.test(code) || !ISIN.test(isin || "") || !/^[A-Z]{3}$/.test(currency || "")) continue;
    addLine(out, isin, { ticker: code.replace(/^0(?=\d{4}$)/, ""), currency, from: `HKEX List of Securities ${code} ${row[currencyAt]}` });
  }
  if (out.size < 5000) throw new Error(`the HKEX list gave ${out.size} ISINs`);
  return out;
}

// ISIN -> SGX counters. SGX's ISIN file names each counter's code; its
// securities feed gives the counter's trading currency. A code the feed does
// not carry is not trading and is left out.
async function sgxLines() {
  const day = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
  const [head, ...lines] = (await page(SGX_ISIN + encodeURIComponent(day), "text/plain")).split(/\r?\n/);
  const isinAt = head.indexOf("ISIN CODE");
  const codeAt = head.indexOf("CODE", isinAt + 9);
  const nameAt = head.indexOf("TRADING COUNTER NAME");
  if (isinAt < 0 || codeAt < 0 || nameAt < 0) throw new Error("the SGX ISIN file header changed");
  const prices = JSON.parse(await page(SGX_PRICES, "application/json"))?.data?.prices || [];
  const currencies = new Map(prices.map((price) => [price.nc, price.cur]));
  if (currencies.size < 500) throw new Error(`the SGX feed gave ${currencies.size} counters`);
  const out = new Map();
  for (const line of lines) {
    const isin = line.slice(isinAt, codeAt).trim();
    const code = line.slice(codeAt, nameAt).trim();
    const currency = currencies.get(code);
    if (!ISIN.test(isin) || !code || !/^[A-Z]{3}$/.test(currency || "")) continue;
    addLine(out, isin, { ticker: code, currency, from: `SGX ${code} ${line.slice(nameAt).trim()} ${currency}` });
  }
  if (out.size < 1000) throw new Error(`the SGX ISIN file gave ${out.size} trading ISINs`);
  return out;
}

// ISIN -> SIX lines, one per trading currency, from SIX's reference data.
async function sixLines(isins) {
  const out = new Map();
  for (const isin of isins) {
    const [head, ...lines] = (await page(SIX_REF + isin, "text/csv")).trim().split(/\r?\n/);
    if (head !== "ISIN;ValorSymbol;TradingBaseCurrency") throw new Error(`SIX reference header changed: ${head}`);
    for (const line of lines) {
      const [id, symbol, currency] = line.split(";");
      if (id === isin && symbol && /^[A-Z]{3}$/.test(currency)) addLine(out, isin, { ticker: symbol, currency, from: `SIX ${symbol} ${currency}` });
    }
  }
  return out;
}

// ISIN -> Xetra lines, from Deutsche Börse's list of every tradable
// instrument (the file's address changes; the instruments page links it).
async function xetraLines() {
  const link = (await page(XETRA_PAGE)).match(/href="([^"]*t7-xetr-allTradableInstruments\.csv)"/)?.[1];
  if (!link) throw new Error("the Xetra instruments page no longer links allTradableInstruments.csv");
  const lines = (await page(new URL(link, XETRA_PAGE).href, "text/csv")).split(/\r?\n/);
  const headAt = lines.findIndex((line) => line.startsWith("Product Status;"));
  const head = lines[headAt]?.split(";") || [];
  const [statusAt, isinAt, symbolAt, currencyAt] = ["Instrument Status", "ISIN", "Mnemonic", "Currency"].map((name) => head.indexOf(name));
  if (Math.min(statusAt, isinAt, symbolAt, currencyAt) < 0) throw new Error("the Xetra instrument file header changed");
  const out = new Map();
  for (const line of lines.slice(headAt + 1)) {
    const cells = line.split(";");
    if (cells[statusAt] !== "Active" || !ISIN.test(cells[isinAt] || "") || !/^[A-Z]{3}$/.test(cells[currencyAt] || "")) continue;
    addLine(out, cells[isinAt], { ticker: cells[symbolAt], currency: cells[currencyAt], from: `Xetra ${cells[symbolAt]} ${cells[currencyAt]}` });
  }
  if (out.size < 3000) throw new Error(`the Xetra file gave ${out.size} ISINs`);
  return out;
}

// ISIN -> Euronext Paris lines (shares, Growth shares and ETFs).
async function euronextLines() {
  const out = new Map();
  for (const url of EURONEXT_FILES) {
    const [head, ...lines] = (await page(url, "text/csv")).replace(/^﻿/, "").split(/\r?\n/);
    const cellsOf = (line) => line.match(/("[^"]*"|[^;]*)(;|$)/g)?.map((cell) => cell.replace(/;$/, "").replace(/^"|"$/g, "").trim()) || [];
    const header = cellsOf(head);
    const [isinAt, symbolAt, marketAt, currencyAt] = ["ISIN", "Symbol", "Market", "Currency"].map((name) => header.indexOf(name));
    if (Math.min(isinAt, symbolAt, marketAt, currencyAt) < 0) throw new Error(`Euronext file header changed: ${url}`);
    for (const line of lines) {
      const cells = cellsOf(line);
      if (!ISIN.test(cells[isinAt] || "") || !/Paris/.test(cells[marketAt]) || !/^[A-Z]{3}$/.test(cells[currencyAt] || "")) continue;
      addLine(out, cells[isinAt], { ticker: cells[symbolAt], currency: cells[currencyAt], from: `Euronext ${cells[symbolAt]} ${cells[marketAt]} ${cells[currencyAt]}` });
    }
  }
  if (out.size < 500) throw new Error(`the Euronext files gave ${out.size} ISINs`);
  return out;
}

// TMX's company directory (every listed instrument, by company) for TSX or
// TSX Venture.
async function tsxSymbols(exchange) {
  const found = JSON.parse(await page(`${TSX_DIRECTORY}${exchange}/%5E*`, "application/json"));
  const symbols = new Set((found.results || []).flatMap((company) => company.instruments || []).map((item) => item.symbol));
  if (symbols.size < 1000) throw new Error(`the ${exchange} directory gave ${symbols.size} symbols`);
  return symbols;
}

// The trading currency TMX Money gives for one symbol.
async function tmxCurrency(symbol) {
  const response = await fetch(TMX_QUOTE, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", Origin: "https://money.tmx.com", Referer: "https://money.tmx.com/" },
    body: JSON.stringify({
      operationName: "getQuoteBySymbol",
      variables: { symbol, locale: "en" },
      query: "query getQuoteBySymbol($symbol: String, $locale: String) { getQuoteBySymbol(symbol: $symbol, locale: $locale) { symbol currency } }",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} TMX quote ${symbol}`);
  return (await response.json())?.data?.getQuoteBySymbol?.currency || "";
}

// ---- rows ---------------------------------------------------------------

function priceCurrency(price, fallback) {
  if (/\$$/.test(price)) return "USD";
  if (/€$/.test(price)) return "EUR";
  return price.match(/\b([A-Z]{3})$/)?.[1] || fallback;
}

const book = loadLists();
const directory = await usDirectory();
const rows = [];
const left = {};
const leave = (why) => { left[why] = (left[why] || 0) + 1; };
const usOtc = [];
const seen = new Set();

for (const [market, spec] of Object.entries(MARKETS)) {
  const lines = await marketLines(market);
  for (const line of lines) seen.add(line.slug);
  if (spec.skip) {
    for (const line of lines) leave(`${spec.label}: ${spec.skip} (${line.cell})`);
    continue;
  }

  if (market === "SHARE:USA") {
    for (const line of lines) {
      // BRK.B is "BRK" in the ticker cell and brk.b in the link.
      const query = line.slug.includes(".") ? line.slug.toUpperCase() : line.cell;
      const ticker = query.replace(/p([A-Z]?)$/, "/P$1").toUpperCase();
      const name = normalize(line.name);
      const hits = lookup(book, [...US_LISTS, "OTC"], ticker);
      let listed = directory.get(query);
      if (!listed) {
        // Gone from the directory (delisted or moved): the assets lists' place.
        const place = US_LISTS.find((list) => hits.some((hit) => hit.place === list));
        if (place) listed = { code: US_LIST[place], etf: hits.some((hit) => hit.place === place && hit.fund) && /\bETF\b/i.test(name) };
      }
      const [exchange, mic, list] = listed ? US_PLACE[listed.code] || OTC : OTC;
      if (!listed || !US_PLACE[listed.code]) usOtc.push(`${ticker}${hits.length ? "" : " (in no list)"}`);
      const atPlace = list ? hits.filter((hit) => hit.place === list) : hits.filter((hit) => hit.place !== "OTC");
      // NYSE Arca and Cboe BZX list almost only exchange-traded products: a
      // fund there that the directory does not flag (BAR, a gold trust) is one.
      const productBook = ["ARCX", "BATS"].includes(mic) && atPlace.some((hit) => hit.fund);
      const type = ETN_NAME.test(name) ? "ETN" : /\b(ETC|ETP)\b/i.test(name) ? "ETC" : listed?.etf || productBook || /\bETF\b/i.test(name) ? "ETF" : "STOCK";
      const row = { query, ticker, name, exchange, mic, currency: priceCurrency(line.price, "USD"), type, isin: single(atPlace.length ? atPlace : hits) };
      row.raw = [line.cell, name, line.price, spec.label, `/tickerinfo/${line.slug}/`].filter(Boolean).join(" | ");
      rows.push(row);
    }
    continue;
  }

  // The symbol before its MIC: BT.A, BBD.B, where the ticker cell says BT, BBD.
  const bare = (line) => line.slug.replace(/\.[a-z]+$/, "").toUpperCase();
  // The LSE writes a two-letter TIDM with a dot: BP., RR.
  const tidms = (line) => (/^[A-Z0-9]{1,2}$/.test(bare(line)) ? [`${bare(line)}.`, bare(line)] : [bare(line)]);
  const london = [];
  if (market === "SHARE:LONDON") {
    for (const line of lines) {
      let found = null;
      for (const tidm of tidms(line)) {
        found = await paced(() => lseLine(tidm)).catch(() => null);
        if (found) break;
      }
      london.push(found);
    }
  }
  lines.forEach((line, at) => {
    const ticker = market === "SHARE:LONDON" ? london[at]?.ticker || tidms(line)[0] : bare(line);
    const symbolMic = line.slug.split(".").pop().toUpperCase();
    const name = normalize(line.name).replace(new RegExp(`\\s*\\(${line.cell}\\)$`), "");
    const listPlaces = spec.byMic ? [LIST_FILE[symbolMic]].filter(Boolean) : spec.list;
    const hits = lookup(book, listPlaces, ticker);
    let currency = priceCurrency(line.price, spec.currency);
    let isin = single(spec.list[0] === "XETR" ? hits.filter((hit) => hit.place === "XETR") : hits);
    if (spec.list[0] === "XETR" && !isin) isin = single(hits);
    if (market === "SHARE:LONDON") {
      const lse = london[at];
      if (lse) {
        isin = lse.isin;
        currency = lse.currency;
      } else if (currency === "GBP") {
        currency = "GBX";
      }
    }
    const type = typeOf(name, hits.some((hit) => hit.fund), isin || hits[0]?.isin);
    const places = spec.byMic ? [spec.byMic[symbolMic]].filter(Boolean) : spec.places;
    if (!places.length) {
      leave(`${spec.label}: unknown MIC ${symbolMic}`);
      return;
    }
    for (const [exchange, mic] of places) {
      rows.push({
        query: line.slug.toUpperCase(),
        ticker,
        name,
        exchange,
        mic,
        currency,
        type,
        isin,
        raw: [line.cell, name, line.price, spec.label, `/tickerinfo/${line.slug}/`].filter(Boolean).join(" | "),
      });
    }
  });
}

// Share links in the sitemap that no market list carried.
{
  const suffixes = new Set([...seen].map((slug) => slug.split(".")[1]).filter(Boolean));
  const missed = [...(await sitemapSlugs())].filter((slug) => !seen.has(slug) && suffixes.has(slug.split(".")[1]));
  if (missed.length) console.error(`sitemap share links missing from the lists: ${missed.length} (${missed.slice(0, 20).join(" ")})`);
}

// The place's own lines of each title. Where the exchange's source gives the
// listed counter's currency (London, Hong Kong, Singapore, SIX), the listed
// row takes it: J2T prints HKD and SGD on dollar counters too. Then each
// other line of the ISIN in a currency Just2Trade takes as a deposit gets
// a row of its own.
{
  const holds = (currency) => depositHas("just2trade", "", heldAs(currency));
  const keyOf = (row, currency) => `${row.mic}|${row.isin}|${heldAs(currency)}`;
  const atMic = (...mics) => rows.filter((row) => mics.includes(row.mic) && row.isin);
  const linesOf = new Map();
  const notes = [];

  for (const row of atMic("XLON")) {
    const lines = await paced(() => lseLines(row.isin));
    linesOf.set(row, lines.map((line) => ({ ticker: line.ticker, currency: line.currency, from: `LSE ${line.ticker} ${line.currency}` })));
  }

  const hkex = await hkexLines();
  for (const row of atMic("XHKG")) linesOf.set(row, hkex.get(row.isin));

  const sgx = await sgxLines();
  for (const row of atMic("XSES")) linesOf.set(row, sgx.get(row.isin));

  const six = await sixLines([...new Set(atMic("XSWX").map((row) => row.isin))]);
  for (const row of atMic("XSWX")) linesOf.set(row, six.get(row.isin));

  const xetra = await xetraLines();
  for (const row of atMic("XETR")) linesOf.set(row, xetra.get(row.isin));

  const euronext = await euronextLines();
  for (const row of atMic("XPAR")) linesOf.set(row, euronext.get(row.isin));

  // Toronto writes a share's dollar line as <symbol>.U. It counts only when
  // assets/*.csv files it under the title's own ISIN: ETHH.U is a separate
  // unit class with its own ISIN, not a dollar line of ETHH.
  const directory = { XTSE: await tsxSymbols("tsx"), XTSX: await tsxSymbols("tsxv") };
  for (const row of atMic("XTSE", "XTSX")) {
    const symbol = `${row.ticker}.U`;
    if (!directory[row.mic].has(symbol)) continue;
    const isins = new Set(lookup(book, [LIST_FILE[row.mic]], symbol).map((hit) => hit.isin));
    if (!isins.has(row.isin) || isins.size > 1) {
      notes.push(`${symbol} not a line of ${row.ticker} (${row.isin}): its ISIN is ${[...isins].join("/") || "unknown"}`);
      continue;
    }
    const currency = await tmxCurrency(symbol);
    linesOf.set(row, [{ ticker: symbol, currency, from: `TSX ${symbol} ${currency}` }]);
  }

  // The listed counter's own currency. A symbol SIX trades in several
  // currencies (BTCA in CHF, EUR, USD) keeps J2T's when it is one of them.
  const corrected = [];
  for (const [row, lines] of linesOf) {
    if (!["XLON", "XHKG", "XSES", "XSWX"].includes(row.mic)) continue;
    const own = (lines || []).filter((line) => line.ticker === row.ticker);
    const currencies = [...new Set(own.map((line) => line.currency))];
    if (!currencies.length || currencies.includes(row.currency) || currencies.length > 1) {
      if (currencies.length > 1 && !currencies.includes(row.currency)) notes.push(`${row.exchange} ${row.ticker}: J2T says ${row.currency}, the exchange ${currencies.join("/")}; kept`);
      continue;
    }
    corrected.push(`${row.exchange} ${row.ticker} ${row.currency} -> ${currencies[0]}`);
    row.currency = currencies[0];
    row.raw = `${row.raw} | currency: ${own[0].from}`;
  }

  const keys = new Set(rows.map((row) => keyOf(row, row.currency)));
  const added = [];
  const tally = {};
  for (const [row, lines] of linesOf) {
    for (const line of lines || []) {
      if (!holds(line.currency) || keys.has(keyOf(row, line.currency))) continue;
      keys.add(keyOf(row, line.currency));
      added.push({ ...row, ticker: line.ticker, currency: line.currency, raw: `${row.raw.replace(/ \| currency: .*$/, "")} | ${line.from}` });
      tally[`${row.exchange} ${line.currency}`] = (tally[`${row.exchange} ${line.currency}`] || 0) + 1;
    }
  }

  console.error(`listed counters whose currency the exchange corrects: ${corrected.length}${corrected.length ? ` (${corrected.join("; ")})` : ""}`);
  rows.push(...added);
  console.error(`other currency lines added: ${added.length}`, tally);
  if (notes.length) console.error(`currency lines left as they are: ${notes.join("; ")}`);
}

// Every place written must be one the venue table knows.
const unresolved = new Set();
for (const row of rows) {
  const { venue } = resolveVenue({ exchange: row.exchange, mic: row.mic, currency: row.currency });
  if (!venue || venue.mic !== row.mic) unresolved.add(`${row.exchange}|${row.mic}|${row.currency}`);
}
if (unresolved.size) console.error("unresolved venues:", [...unresolved]);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const kept = withoutObligations(rows);
const keptSet = new Set(kept);
if (kept.length < rows.length) console.error(`dropped as debt: ${rows.filter((row) => !keptSet.has(row)).map((row) => `${row.exchange}:${row.ticker} ${row.name}`).join("; ")}`);
fs.writeFileSync(new URL("just2trade-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));

const counts = {};
for (const row of kept) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`US titles written as OTC Markets: ${usOtc.length} (${usOtc.join(", ")})`);
console.error("left out", left);
console.error(`${kept.length} rows, ${kept.filter((row) => row.isin).length} with an ISIN, ${kept.filter((row) => !row.isin && row.matches?.length).length} with several (matches)`);
