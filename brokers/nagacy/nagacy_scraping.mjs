// What NAGA (NAGA Markets Europe Ltd, Cyprus, CySEC 204/13) sells as real
// shares and ETFs, with no login. CFDs are left out.
//
// NAGA's EU Hours and Fees page carries, in its page source, one table per
// asset group. The "real_stocks" table is the list of real (".re")
// instruments, the shares and ETFs a client owns 1:1 with no leverage, in a
// stock trading account; every other table there is a CFD table (stocks,
// ETFs, indices, ...) and is not read. Each real line has NAGA's symbol
// (in the "instrument" field: ADSGn.re, MMM.re, 1010.re), the title (in the
// "symbol" field), the currency it is quoted in, the trading hours (UK time)
// and the fee per trade.
//
//   https://naga.com/eu/trading/hours-and-fees
//   https://naga.com/sitemap/sitemap_instruments/eu.xml
//   https://naga.com/eu/instruments/<symbol>
//
// Place of each line, never guessed. The currency and the opening time fix
// a block of hours; a block that is one market fixes the place, and in a
// block of several markets the line's instrument page names it.
//   USD, US hours (14:31-20:58 UK time): United States. US venues are one
//     NBBO market, so a title is one row, on its listing exchange from Nasdaq
//     Trader's symbol directory (read over FTP, as in brokers/just2trade;
//     exchange code F is the Texas Stock Exchange, TXSE):
//       ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//       ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//     A symbol the directory no longer carries takes the US place
//     assets/stocks.csv or assets/etfs.csv files it on; one in neither is no
//     longer listed (taken over, delisted, renamed to another symbol: SQ,
//     GPS, SAVE) and is left out. NAGA writes RIC class letters (BRKb): the
//     ticker is written BRK.B. A directory line whose title shares no word
//     with NAGA's is another security that took the symbol over (FB, PARA,
//     PINC, AXNX) and the line is left out, except for the renamed
//     companies of RENAMED below, checked by hand. BY_HAND places the
//     company that moved to another symbol (SATS is EchoStar's ECHO, CIB is
//     Grupo Cibest).
//   GBX, London hours (08:05-16:29): London Stock Exchange (XLON). The TIDM
//     is NAGA's code without its class letters (HVPEa -> HVPE, GFTU_u ->
//     GFTU); a two-letter one takes the LSE's dot (BP.), BT is BT.A, and the
//     Refinitiv codes of RIC_TIDM are mapped by hand (ICAG -> IAG). The LSE's
//     own record of the TIDM gives the ISIN when its title shares a word with
//     NAGA's or the company was renamed (LSE_RENAMED, checked by hand); BAES
//     is a leveraged Boeing ETP on the LSE, not BAE Systems (BA.). A code the
//     LSE does not know is tried without its last letter (AUTOA -> AUTO),
//     then matched to the LSE lines of the lists as below (ASOS -> ASC,
//     BALF -> BBY), leaving out the 0xxx international order books. A line
//     neither knows is no longer listed (Royal Dutch Shell A/B, Britvic, DS
//     Smith) and is left out.
//       https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>
//   SAR, Saudi hours (Sunday-Thursday 07:01-11:59): Tadawul (XSAU); NAGA's
//     code is the Tadawul code. AGLTY (Agility, a Kuwaiti share) is in the
//     SAR block but is no Tadawul code and is left out.
//   RON, Bucharest hours (08:01-15:45): Bucharest Stock Exchange (XBSE).
//   AED, UAE hours (06:01-10:45): the Dubai Financial Market and Abu Dhabi
//     share these hours. "Real-Stocks DXB" on the instrument page is the
//     DFM (XDFM); a page that says only "Real-Stocks UAE" leaves the place
//     to the lists: the one of DFM and ADX whose list files the code (all
//     eleven are DFM codes today).
//   EUR, 08:31-14:58: the Athens block; every line in it is a Greek listing
//     (Athens Stock Exchange, XATH). EUR, 08:05-16:25: the Lisbon block
//     (Euronext Lisbon, XLIS). EUR, 08:01-16:28: every continental market
//     at once (Xetra, Paris, Amsterdam, Brussels, Milan, Madrid), so the
//     instrument page names the market of each line:
//       Real-Stocks GER  Börse Xetra (XETR)
//       Real-Stocks FRA  Euronext Paris (XPAR)
//       Real-Stocks NL   Euronext Amsterdam (XAMS)
//       Real-Stocks BE   Euronext Brussels (XBRU)
//       Real-Stocks IT   Euronext Milan (XMIL)
//       Real-Stocks ESP  Bolsa de Madrid (XMAD)
//       Real-Stocks PT   Euronext Lisbon (XLIS)
//     A page with no instrument, or a market label that is not one of the
//     block's (COL.re, Colonial, is labelled "Real-Stocks USA"), leaves the
//     place to the lists: the one market of the block whose list files
//     NAGA's code under this title (Colonial: Madrid). Paris, Amsterdam and
//     Brussels share one list, so a line only they file is left out (ATOS,
//     placed on Paris by BY_HAND).
// A page label of another block's market is reported and the line left
// out. Every line is written in the currency NAGA gives it, even where the
// LSE quotes the line in dollars (CPG, IHG, PSHD).
//
// Ticker and ISIN outside the US (and in London when the LSE's record does
// not do): NAGA's code is a Refinitiv code without its exchange suffix
// (ALVG, DTEGn, ACCP, ACBR), not the exchange's ticker, so each line is
// matched to the place's lines in assets/stocks.csv and assets/etfs.csv
// (Xetra XETR, Euronext EURONEXT, Milan MIL, Madrid BME, Athens ATHEX, Dubai
// DFM, Tadawul TADAWUL, Bucharest BVB, London LSE), in this order:
//   1. by code: NAGA's code, or the code with its class letters cut (and on
//      Xetra the German "G": DTEGn -> DTE; a preference line VOWG_p is VOW3),
//      when the listed title shares a word with NAGA's. On Tadawul,
//      Bucharest, Dubai and Madrid the code is the exchange's own and is
//      enough by itself (Sabb is 1060, Saudi Awwal Bank); those matches are
//      reported.
//   2. by title: the two titles agree (words weighted by how rare they are
//      on that place, F1 of both directions at least 0.6) and no title of
//      another ISIN comes within 0.15;
//   3. every word of NAGA's title is in one listed title only (Michelin,
//      L.V.M.H.);
//   4. one listed ticker begins like NAGA's code and its title agrees at
//      least 0.4 (DROR / DROME, MMTP / MMT).
// NOT_SAME lists title matches checked by hand and found to be another
// company. Two lines that meet on one ISIN at one place cannot both be it:
// a title match gives way to a code match, two title matches both give way.
// A line not matched keeps NAGA's code as ticker and no ISIN (stampRows may
// still find one by that code), and is reported.
//
// Type: US lines are ETF when the Nasdaq Trader directory flags them (SPY,
// QQQ, GLD), ETN when a title says ETN. Elsewhere what NAGA's title or the
// listed title says: ETN, ETC / ETP, ETF / UCITS; the rest are STOCK,
// listed closed-end and other funds included (Fondul Proprietatea, Tadawul
// REITs and traded funds).
//
// broker-list.json says "No US-domiciled ETFs (PRIIPs/KID)" for NAGA's US
// places. NAGA's own pages do not say so: its EU real-stock table lists
// SPY, QQQ, VOO and other US funds, and its help centre says nothing of a
// KID rule. They are kept, like brokers/just2trade.
//
// Account currencies (for deposits.mjs): EUR, USD, GBP, PLN and RON, per
//   https://nagamarkets.zendesk.com/hc/en-gb/articles/13801518527516-How-can-I-add-a-trading-account
//
//   node brokers/nagacy/nagacy_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { lseLine } from "../../lseListings.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HOURS = "https://naga.com/eu/trading/hours-and-fees";
const SITEMAP = "https://naga.com/sitemap/sitemap_instruments/eu.xml";
const INSTRUMENT = "https://naga.com/eu/instruments/";
const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const WORKERS = 4;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// Place: [exchange, MIC, assets list places].
const PLACE = {
  XETR: ["Börse Xetra", "XETR", ["XETR"]],
  XPAR: ["Euronext Paris", "XPAR", ["EURONEXT"]],
  XAMS: ["Euronext Amsterdam", "XAMS", ["EURONEXT"]],
  XBRU: ["Euronext Brussels", "XBRU", ["EURONEXT"]],
  XLIS: ["Euronext Lisbon", "XLIS", ["EURONEXT"]],
  XMIL: ["Euronext Milan", "XMIL", ["MIL"]],
  XMAD: ["Bolsa de Madrid", "XMAD", ["BME"]],
  XATH: ["Athens Stock Exchange", "XATH", ["ATHEX"]],
  XDFM: ["Dubai Financial Market", "XDFM", ["DFM"]],
  XADS: ["Abu Dhabi Securities Exchange", "XADS", ["ADX"]],
  XSAU: ["Tadawul", "XSAU", ["TADAWUL"]],
  XBSE: ["Bucharest Stock Exchange", "XBSE", ["BVB"]],
  XLON: ["London Stock Exchange", "XLON", ["LSE"]],
};
// Instrument page type -> place.
const PAGE_TYPE = {
  "Real-Stocks GER": "XETR",
  "Real-Stocks FRA": "XPAR",
  "Real-Stocks NL": "XAMS",
  "Real-Stocks BE": "XBRU",
  "Real-Stocks IT": "XMIL",
  "Real-Stocks ESP": "XMAD",
  "Real-Stocks PT": "XLIS",
  "Real-Stocks DXB": "XDFM",
};
// currency + opening time -> the block: a place, or the places it can be.
const BLOCK = {
  "USD 14:31": { label: "US", places: ["US"] },
  "GBX 08:05": { label: "London", places: ["XLON"] },
  "SAR 07:01": { label: "Saudi", places: ["XSAU"] },
  "RON 08:01": { label: "Bucharest", places: ["XBSE"] },
  "AED 06:01": { label: "UAE", places: ["XDFM", "XADS"], page: true },
  "EUR 08:31": { label: "Athens", places: ["XATH"] },
  "EUR 08:05": { label: "Lisbon", places: ["XLIS"] },
  "EUR 08:01": { label: "continental", places: ["XETR", "XPAR", "XAMS", "XBRU", "XMIL", "XMAD"], page: true },
};

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
// US symbols whose title in NAGA's table is the company's old name, checked
// by hand to be the same company and line today (2026-10-20).
const RENAMED = {
  GE: "GE Aerospace, formerly General Electric",
  GOOGL: "Alphabet, formerly Google",
  HPQ: "HP Inc., formerly Hewlett-Packard",
  IBM: "International Business Machines",
  NTAP: "NetApp, formerly Network Appliance",
  ODP: "The ODP Corp, formerly Office Depot",
  SLB: "SLB, formerly Schlumberger",
  SFL: "SFL Corporation, formerly Ship Finance International",
  BXP: "BXP, formerly Boston Properties",
  CBOE: "Cboe Global Markets, formerly Chicago Board Options Exchange",
  LH: "Labcorp Holdings, formerly Laboratory Corp of America",
  MSTR: "Strategy, formerly MicroStrategy",
  PCG: "PG&E Corporation",
  WAB: "Westinghouse Air Brake Technologies (Wabtec)",
  TPX: "Somnigroup International, formerly Tempur Sealy",
  IMNN: "Imunon, formerly Celsion",
};
// Lines the rules above cannot place, placed by hand (checked 2026-10-20).
const BY_HAND = {
  // Bancolombia's ADR is Grupo Cibest's since the 2025 holding change.
  CIB: { ticker: "CIB", exchange: "NYSE", mic: "XNYS", isin: "US40090E1064", type: "STOCK" },
  // EchoStar moved from SATS to ECHO; SATS is now a Strive preferred share.
  SATS: { ticker: "ECHO", exchange: "NASDAQ", mic: "XNAS", isin: "US2787681061", type: "STOCK" },
  // Atos Group lists only on Euronext Paris.
  ATOS: { ticker: "ATO", exchange: "Euronext Paris", mic: "XPAR", isin: "FR001400X2S4", type: "STOCK" },
  // iShares Core S&P 500 UCITS ETF USD (Dist): the LSE's dollar line,
  // although NAGA files it on US hours.
  IDUS: { ticker: "IDUS", exchange: "London Stock Exchange", mic: "XLON", isin: "IE0031442068", type: "ETF" },
};
// Places whose own code is NAGA's code.
const BARE = new Set(["XSAU", "XBSE", "XDFM", "XMAD"]);
const US_LIST = { NYSE: "N", NASDAQ: "Q", AMEX: "P", CBOE: "Z" };
const US_LISTS = ["NYSE", "NASDAQ", "AMEX", "CBOE"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ---- NAGA -------------------------------------------------------------

// The JSON array that follows "real_stocks": in the page source.
function realStocks(html) {
  const key = '"real_stocks":';
  const at = html.indexOf(key);
  if (at < 0) throw new Error("the Hours and Fees page has no real_stocks table");
  const start = at + key.length;
  let depth = 0;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (char === '"') {
      for (i += 1; html[i] !== '"'; i += 1) if (html[i] === "\\") i += 1;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]" && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error("the real_stocks table does not close");
}

// The market an instrument page names ("Real-Stocks GER"), or "" when the
// page has no instrument. The value is copied out so the page can be freed.
async function pageType(symbol) {
  const html = await page(INSTRUMENT + encodeURIComponent(symbol));
  const match = html.match(/"pageProps":\{"instrument":(null|\{"id":\d+,"display_name":"[^"]*","slug":"[^"]*","symbol":"([^"]*)","type":"([^"]*)")/);
  if (!match) throw new Error(`${symbol}: the instrument page has no pageProps`);
  if (match[1] === "null") return "";
  if (match[2] !== symbol) throw new Error(`${symbol}: the instrument page is ${match[2]}`);
  return Buffer.from(match[3]).toString();
}

// ---- US symbol directory ----------------------------------------------

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

// CQS symbol (BRK.B) or Nasdaq symbol -> { code, etf, name }. Test issues out.
async function usDirectory() {
  const out = new Map();
  const other = (await directoryFile(OTHER_LISTED)).split(/\r?\n/);
  if (!/^ACT Symbol\|Security Name\|Exchange\|CQS Symbol\|ETF\|/.test(other[0])) throw new Error("otherlisted.txt header changed");
  for (const line of other.slice(1)) {
    const cells = line.split("|");
    if (cells.length < 8 || cells[6] === "Y" || !cells[3]) continue;
    out.set(cells[3], { code: cells[2], etf: cells[4] === "Y", name: cells[1] });
  }
  const nasdaq = (await directoryFile(NASDAQ_LISTED)).split(/\r?\n/);
  if (!/^Symbol\|Security Name\|Market Category\|Test Issue\|Financial Status\|Round Lot Size\|ETF\|/.test(nasdaq[0])) throw new Error("nasdaqlisted.txt header changed");
  for (const line of nasdaq.slice(1)) {
    const cells = line.split("|");
    if (cells.length < 8 || cells[3] === "Y" || !cells[0]) continue;
    out.set(cells[0], { code: "Q", etf: cells[6] === "Y", name: cells[1] });
  }
  if (out.size < 10_000) throw new Error(`the US directory holds only ${out.size} symbols`);
  return out;
}

// ---- assets lists -------------------------------------------------------

function csvCells(line) {
  return line.match(/("[^"]*"|[^,]*)(,|$)/g).map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, ""));
}

// place -> [{ ticker, isin, name, fund }]
function loadLists() {
  const book = new Map();
  for (const [file, fund] of [["etfs.csv", true], ["stocks.csv", false]]) {
    const path = new URL(`../../assets/${file}`, import.meta.url);
    for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const [code, place, isin, name] = csvCells(line);
      const ticker = String(code || "").split(":").pop().trim().toUpperCase();
      if (!ticker || !place || !ISIN.test(isin || "")) continue;
      if (!book.has(place)) book.set(place, []);
      book.get(place).push({ ticker, isin, name: name || "", fund });
    }
  }
  if (book.size < 50) throw new Error(`assets lists hold only ${book.size} places`);
  return book;
}

// ---- matching a title -----------------------------------------------------

// Words that say nothing of which company a title is.
const FILLER = new Set(
  ("ag sa se nv spa p plc group groupe grupo holding holdings co company cie inc corp corporation the de des del di " +
    "of and et gmbh class ltd limited pjsc psc bsc sab ord shares share st reg ae sca scs socimi oyj asa ab " +
    "industries industry industrial commercial enterprises s a n v b").split(" "),
);

function words(text) {
  return String(text || "")
    .replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\b(\w)\.(?=\w\.)/g, "$1") // L.V.M.H. -> LVMH
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b[a-z](?: [a-z]\b)+/g, (letters) => letters.replace(/ /g, "")) // F N B -> FNB
    .split(" ")
    .filter((word) => word && !FILLER.has(word));
}

// Two words agree when equal; a word of three letters or more may stand
// for a longer one ("Bay Mot Werke", "Muench. Rueck"), which counts less.
function agree(word, other) {
  if (word === other) return 1;
  if (word.length >= 3 && other.length >= 3 && (other.startsWith(word) || word.startsWith(other))) return 0.6;
  return 0;
}

// How rare each word is among a place's titles: a word many titles share
// ("bank", "trust", "real", "estate") says less than a rare one.
const RARITY = new WeakMap();
function rarity(entries) {
  if (RARITY.has(entries)) return RARITY.get(entries);
  const count = new Map();
  for (const entry of entries) for (const word of new Set(words(entry.name))) count.set(word, (count.get(word) || 0) + 1);
  const weight = (word) => Math.log((entries.length + 1) / ((count.get(word) || 0) + 1)) + 1;
  RARITY.set(entries, weight);
  return weight;
}

// The balance (F1) of two shares, each weighted by rarity: how much of
// NAGA's title the listed title holds, and how much of the listed title
// NAGA's holds. 0 when no word of NAGA's is found.
function likeness(ours, theirs, weight = () => 1) {
  const a = words(ours);
  const b = words(theirs);
  if (!a.length || !b.length) return 0;
  const cover = (from, to) => {
    let got = 0;
    let all = 0;
    for (const word of from) {
      all += weight(word);
      got += weight(word) * Math.max(0, ...to.map((other) => agree(word, other)));
    }
    return got / all;
  };
  const forward = cover(a, b);
  const back = cover(b, a);
  return forward && back ? (2 * forward * back) / (forward + back) : 0;
}

// NAGA's code, and the code with its RIC letters cut: the lower-case
// class letters everywhere (HVPEa -> HVPE), and on Xetra the "G" of the
// German RIC too (DTEGn -> DTE, ALVG -> ALV). A preference line (_p) is
// Xetra's "3" line (VOWG_p -> VOW3), never the ordinary share's code.
function codesOf(code, mic = "") {
  if (/_p$/.test(code)) {
    const bare = code.replace(/_p$/, "");
    return [...new Set([bare.toUpperCase(), `${bare.replace(/G$/, "")}3`.toUpperCase()])];
  }
  const out = [code.toUpperCase()];
  let bare = code.replace(/_[a-z]$/i, "").replace(/[a-z]+$/, "");
  out.push(bare.toUpperCase());
  if (mic === "XETR" && /.G$/.test(bare)) out.push(bare.slice(0, -1).toUpperCase());
  return [...new Set(out)].filter(Boolean);
}

const TITLE_MIN = 0.6;
const STEM_MIN = 0.4;
// Title matches checked by hand and found to be another company.
const NOT_SAME = {
  ATRSR: "Alpha Trust Holdings is not Alpha Trust Andromeda Investment Trust (ANDRO)",
  AHT: "Ashtead Group (no longer on the LSE) is not Ashtead Technology (AT.)",
  VMUK: "Virgin Money UK (taken over) is not Virgin Wines UK (VINO)",
  MECE: "Mecanica Fina is not Mecanica Ceahlau (MECF)",
};

// `bare`: the place's own code is NAGA's code (Tadawul, Bucharest, Dubai),
// so the code alone is enough.
function match(entries, code, name, bare = false, mic = "") {
  const codes = codesOf(code, mic);
  const byCode = [];
  for (const [rank, wanted] of codes.entries()) {
    for (const entry of entries) {
      if (entry.ticker !== wanted) continue;
      const score = likeness(name, entry.name);
      if (score > 0 || (bare && rank === 0)) byCode.push({ ...entry, score, rank, how: "code" });
    }
  }
  if (byCode.length) {
    byCode.sort((a, b) => a.rank - b.rank || b.score - a.score);
    return byCode[0];
  }
  // By title: the best listed title, when the two titles mostly agree and
  // no title of another ISIN comes within 0.15 of it. A listed ticker that
  // begins like NAGA's code (DROR / DROME, EURBR / EUROB, MUVGn / MUV2)
  // needs less agreement.
  const weight = rarity(entries);
  const stem = codes.at(-1).slice(0, 3);
  const best = new Map();
  for (const entry of entries) {
    const score = likeness(name, entry.name, weight);
    if (score > (best.get(entry.isin)?.score || 0)) best.set(entry.isin, { ...entry, score });
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score);
  const [top, next] = ranked;
  const clear = top && (!next || top.score - next.score >= 0.15);
  if (clear && top.score >= TITLE_MIN && !NOT_SAME[code]) return { ...top, how: "title" };
  // Every word of NAGA's title in one listed title, and in no title of
  // another ISIN ("Michelin", "L.V.M.H.").
  if (!NOT_SAME[code]) {
    const ours = words(name);
    const whole = [...new Set(entries.filter((entry) => {
      const theirs = words(entry.name);
      return ours.every((word) => theirs.includes(word));
    }).map((entry) => entry.isin))];
    if (ours.length && whole.length === 1) return { ...best.get(whole[0]), how: "all words of the title" };
  }
  const alike = ranked.filter((entry) => stem.length === 3 && entry.ticker.startsWith(stem) && entry.score >= STEM_MIN);
  if (!NOT_SAME[code] && alike.length === 1 && (alike[0] === top || alike[0].score - top.score > -0.15)) return { ...alike[0], how: "code start and title" };
  return { score: top?.score || 0, how: "none", near: ranked.slice(0, 3).map((entry) => `${entry.ticker} ${entry.name} ${entry.score.toFixed(2)}`) };
}

// ---- type -----------------------------------------------------------------

// Outside the US: what NAGA's title or the listed title says. A fund the
// lists file that neither title calls an ETF (Fondul Proprietatea, STK
// Emergent, Tadawul's traded funds and REITs) is a closed-end or other
// listed fund and is written as STOCK.
function typeOf(...names) {
  const text = names.filter(Boolean).join(" | ");
  if (/\bETNs?\b/i.test(text)) return "ETN";
  if (/\b(ETC|ETP)\b/i.test(text)) return "ETC";
  if (/\bETFs?\b|\bUCITS\b/i.test(text)) return "ETF";
  return "STOCK";
}

// ---- read ---------------------------------------------------------------

const lines = realStocks(await page(HOURS));
if (lines.length < 2000) throw new Error(`the real_stocks table has only ${lines.length} lines`);
const mapped = new Set((await page(SITEMAP, "application/xml")).match(/<loc>[^<]+<\/loc>/g)?.map((loc) => decodeURIComponent(loc.slice(5, -6).split("/instruments/")[1] || "")));
if (mapped.size < 1000) throw new Error(`the instrument sitemap has only ${mapped.size} lines`);

const left = [];
const leave = (line, why) => left.push(`${line.instrument} (${line.symbol}): ${why}`);
const blocks = new Map();
for (const line of lines) {
  const opens = line.trading_hours.match(/Open: (\d\d:\d\d)/)?.[1];
  const block = BLOCK[`${line.currency} ${opens}`];
  if (!block) {
    leave(line, `no known market for ${line.currency} ${line.trading_hours}`);
    continue;
  }
  blocks.set(line, block);
}

// Instrument pages, for the blocks whose hours name several markets, and for
// one line of every other block as a check.
const asked = lines.filter((line) => blocks.get(line)?.page && mapped.has(line.instrument));
const types = new Map();
await pool(asked, async (line) => types.set(line, await pageType(line.instrument)));
console.error(`instrument pages read: ${asked.length}`);

const book = loadLists();
const directory = await usDirectory();
const rows = [];
const notes = { codeMatch: 0, titleMatch: 0, noMatch: [], codeOnly: [], lseOther: [] };
const tally = {};

// The LSE's API blocks a burst of calls for a few minutes: its calls go one
// at a time, 400 ms apart, and a refusal waits the block out twice before it
// counts as one (as in brokers/just2trade).
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

// London codes of NAGA's that are Refinitiv codes unlike the TIDM, checked
// by hand (2026-10-20); the LSE's record of the TIDM still has the last word.
const RIC_TIDM = {
  ICAG: "IAG", // International Consolidated Airlines Group
  SJP: "STJ", // St. James's Place
  CBRO: "CBG", // Close Brothers Group
  MNPJ: "MNDI", // Mondi
  TCAPI: "TCAP", // TP ICAP, formerly Tullett Prebon
  BDEV: "BTRW", // Barratt Redrow, formerly Barratt Developments
  PHNX: "SDLF", // Standard Life, formerly Phoenix Group Holdings
};

// London lines whose title in NAGA's table is the company's old name,
// checked by hand to be the LSE's line of that TIDM today (2026-10-20).
const LSE_RENAMED = {
  ABDN: "Aberdeen Group, formerly Standard Life Aberdeen",
  CURY: "Currys, formerly Dixons Carphone",
  ENT: "Entain, formerly GVC Holdings",
  FRAS: "Frasers Group, formerly Sports Direct International",
  IWG: "International Workplace Group, formerly Regus",
  MCG: "Mobico Group, formerly National Express Group",
  MONY: "MONY Group, formerly Moneysupermarket.com Group",
  THG: "THG, formerly The Hut Group",
  VANQ: "Vanquis Banking Group, formerly Provident Financial",
};

// The TIDM: NAGA's code without its class letters (HVPEa -> HVPE); a
// two-letter one takes the LSE's dot (BP.), BT is BT.A. A code the LSE does
// not know is tried once more without its last letter (AUTOA -> AUTO), kept
// only when the LSE's title shares a word with NAGA's.
async function london(code, name) {
  const bare = RIC_TIDM[code] || code.replace(/_[a-z]$/i, "").replace(/[a-z]+$/, "").toUpperCase();
  const tidms = bare === "BT" ? ["BT.A"] : bare.length <= 2 ? [`${bare}.`, bare] : [bare];
  for (const tidm of tidms) {
    const found = await paced(() => lseLine(tidm));
    if (found && (likeness(name, found.name) > 0 || LSE_RENAMED[code] || RIC_TIDM[code])) return found;
    if (found) notes.lseOther.push(`${code}: NAGA "${name}", LSE ${found.ticker} "${found.name}"`);
  }
  if (bare.length >= 4) {
    const found = await paced(() => lseLine(bare.slice(0, -1)));
    if (found && likeness(name, found.name) > 0) return { ...found, cut: true };
  }
  return { ticker: tidms[0] };
}

for (const line of lines) {
  const block = blocks.get(line);
  if (!block) continue;
  const code = line.instrument.replace(/\.re$/, "");
  const name = line.symbol.trim();
  const type = types.get(line) || "";
  let raw = [line.instrument, name, line.currency, line.trading_hours, `fee ${line.fee}`, type].filter(Boolean).join(" | ");

  if (BY_HAND[code]) {
    const { ticker, exchange, mic, isin, type: kind } = BY_HAND[code];
    rows.push({ query: line.instrument, ticker, name, exchange, mic, currency: line.currency, type: kind, isin, raw: `${raw} | placed by hand` });
    continue;
  }

  if (block.places[0] === "US") {
    const ticker = code.replace(/([A-Z])([a-z])$/, (_, a, b) => `${a}.${b.toUpperCase()}`);
    const hits = US_LISTS.flatMap((place) => (book.get(place) || []).filter((entry) => entry.ticker === ticker).map((entry) => ({ ...entry, place })));
    let listed = directory.get(ticker);
    if (!listed) {
      const place = US_LISTS.find((list) => hits.some((hit) => hit.place === list));
      if (place) listed = { code: US_LIST[place], etf: false, name: hits.find((hit) => hit.place === place).name };
    }
    if (!listed || !US_PLACE[listed.code]) {
      leave(line, "not listed on a US exchange today (Nasdaq Trader directory, assets lists)");
      continue;
    }
    if (!RENAMED[ticker] && likeness(name, listed.name) === 0) {
      leave(line, `the US line ${ticker} is "${listed.name}", not this title`);
      continue;
    }
    const [exchange, mic] = US_PLACE[listed.code];
    const kind = /\bETNs?\b/i.test(name) || /\bETN\b/i.test(listed.name) ? "ETN" : listed.etf || /\bETF\b/i.test(name) ? "ETF" : "STOCK";
    rows.push({ query: line.instrument, ticker, name, exchange, mic, currency: line.currency, type: kind, isin: "", raw });
    continue;
  }

  let mic = block.places.length === 1 ? block.places[0] : "";
  if (block.page) {
    const named = PAGE_TYPE[type];
    if (named && block.places.includes(named)) mic = named;
    else if (named) {
      leave(line, `the instrument page says ${type}, which the ${block.label} hours do not fit`);
      continue;
    }
  }
  let how = type ? "page" : "hours";
  if (!mic) {
    // The page names no market of the block: the place is the one market
    // of the block whose list files NAGA's code under this title. Paris,
    // Amsterdam and Brussels share one list (EURONEXT), so it cannot
    // separate them.
    const found = [...new Set(block.places.map((place) => PLACE[place][2].join()))]
      .filter((list) => match(book.get(list) || [], code, name).how === "code")
      .flatMap((list) => block.places.filter((place) => PLACE[place][2].join() === list));
    if (found.length === 1) {
      mic = found[0];
      how = `lists (${PLACE[mic][2].join()} files ${code.toUpperCase()})`;
    } else {
      const why = found.length ? `the lists file it on ${found.join("/")}` : "no list of those markets files the code";
      leave(line, `${block.label} hours fit ${block.places.join("/")}, the instrument page names ${type ? `"${type}"` : "no market"} and ${why}`);
      continue;
    }
  }
  if (mic === "XSAU" && !/^\d{4}$/.test(code)) {
    leave(line, `Saudi hours and SAR, but ${code} is not a Tadawul code${type ? ` (page: ${type})` : ""}`);
    continue;
  }
  if (how.startsWith("lists")) raw += ` | place from ${how}`;
  const [exchange, , lists] = PLACE[mic];
  const entries = lists.flatMap((list) => book.get(list) || []);

  if (mic === "XLON") {
    const found = await london(code, name);
    let isin = found.isin || "";
    let ticker = found.ticker;
    let listName = "";
    if (!isin) {
      // The LSE's international order books (0xxx) are not UK shares.
      const hit = match(entries.filter((entry) => !/^0/.test(entry.ticker)), found.ticker, name);
      if (hit.how === "none") {
        leave(line, `the LSE and the lists do not know ${ticker} (no longer listed)`);
        continue;
      }
      ({ isin, ticker } = hit);
      listName = hit.name;
    } else listName = found.name;
    const kind = typeOf(name, listName);
    rows.push({ query: line.instrument, ticker, name, exchange, mic, currency: line.currency, type: kind, isin, raw: `${raw} | LSE ${found.isin ? `${found.ticker} ${found.currency}` : "lists"}` });
    tally[mic] = (tally[mic] || 0) + 1;
    continue;
  }

  const hit = match(entries, code, name, BARE.has(mic), mic);
  if (hit.how === "code") notes.codeMatch += 1;
  else if (hit.isin) notes.titleMatch += 1;
  else notes.noMatch.push(`${mic} ${line.instrument} ${name}${hit.near?.length ? ` (closest: ${hit.near.join("; ")})` : ""}`);
  const kind = typeOf(name, hit.name);
  if (hit.how === "code" && hit.score === 0) notes.codeOnly.push(`${mic} ${code}: NAGA "${name}", list "${hit.name}"`);
  rows.push({
    query: line.instrument,
    // Tadawul's list writes a few codes as names (JAHEZ): the code stays.
    ticker: hit.ticker && (mic !== "XSAU" || /^\d{4}$/.test(hit.ticker)) ? hit.ticker : code.toUpperCase(),
    name,
    exchange,
    mic,
    currency: line.currency,
    type: kind,
    isin: hit.isin || "",
    raw: hit.isin ? `${raw} | lists ${hit.how}: ${hit.ticker} ${hit.name}` : raw,
    how: hit.how,
  });
}

// Two NAGA lines on one place cannot be one listed line: when they meet on
// an ISIN, a line matched by title gives way to one matched by code (both
// "Porsche" lines: P911_p is Porsche AG by code, PSHG_p is not), and two
// title matches both give way.
const byListing = new Map();
for (const row of rows) {
  if (!row.isin || !row.how) continue;
  const key = `${row.mic}|${row.isin}|${row.currency}`;
  if (!byListing.has(key)) byListing.set(key, []);
  byListing.get(key).push(row);
}
for (const group of byListing.values()) {
  if (group.length < 2) continue;
  const byCode = group.filter((row) => row.how === "code");
  for (const row of group) {
    if (byCode.length === 1 && row === byCode[0]) continue;
    notes.noMatch.push(`${row.mic} ${row.query} ${row.name} (its match ${row.ticker} ${row.isin} is also ${group.filter((other) => other !== row).map((other) => other.query).join(", ")})`);
    if (row.how === "code") notes.codeMatch -= 1;
    else notes.titleMatch -= 1;
    row.isin = "";
    row.ticker = row.query.replace(/\.re$/, "").toUpperCase();
    row.raw = row.raw.replace(/ \| lists .*$/, "");
  }
}
for (const row of rows) delete row.how;

// Every place written must be one the venue table knows.
const unresolved = new Set();
for (const row of rows) {
  const { venue } = resolveVenue({ exchange: row.exchange, mic: row.mic, currency: row.currency });
  if (!venue || venue.mic !== row.mic) unresolved.add(`${row.exchange}|${row.mic}|${row.currency}`);
}
if (unresolved.size) console.error("unresolved venues:", [...unresolved]);

for (const row of rows) if (!row.isin) delete row.isin;
rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
const kept = withoutObligations(rows);
if (kept.length < rows.length) console.error(`dropped as debt: ${rows.filter((row) => !kept.includes(row)).map((row) => row.query).join(", ")}`);
const stamped = stampRows(kept);
fs.writeFileSync(new URL("nagacy-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));

const counts = {};
for (const row of stamped) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`matched to the lists by code ${notes.codeMatch}, by title ${notes.titleMatch}, not matched ${notes.noMatch.length}`);
for (const item of notes.noMatch) console.error(`  not matched: ${item}`);
console.error(`LSE lines of NAGA's code that are another title: ${notes.lseOther.length}`);
for (const item of notes.lseOther) console.error(`  ${item}`);
console.error(`matched by the place's own code, titles sharing no word: ${notes.codeOnly.length}`);
for (const item of notes.codeOnly) console.error(`  ${item}`);
console.error(`left out: ${left.length}`);
for (const item of left) console.error(`  ${item}`);
console.error(`${stamped.length} rows from ${lines.length} lines, ${stamped.filter((row) => row.isin).length} with an ISIN, ${stamped.filter((row) => !row.isin && row.matches?.length).length} with several (matches)`);
