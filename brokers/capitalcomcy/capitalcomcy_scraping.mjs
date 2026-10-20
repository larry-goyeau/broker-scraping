// What Capital.com sells to EU clients as real stocks and ETFs (not CFDs),
// with no login.
//
// The entity: Capital Com Group Ltd, Cyprus (HE 446198), authorised by
// CySEC under licence 463/25. Its order execution policy and share-dealing
// terms are the "CCEU" documents linked from the EU site; the CFD and
// knock-out business stays with Capital Com SV Investments Limited (CySEC
// 319/17). For stocks, ETFs, ETNs, ETCs and ADRs Capital Com Group acts as
// agent and passes every order to GTN Europe Financial Services Limited:
// a stock with an EEA ISIN is executed on a regulated market, MTF,
// systematic internaliser or equivalent third-country venue; any other
// stock, and every fractional order, OTC with GTN. Stocks are open to
// residents of most EEA countries; Bulgaria, Malta and Slovenia get stocks
// but not ETFs (site footer).
//
//   https://capital.com/en-eu/ways-to-trade/stocks-and-etfs?sort=most&regions=<id>&page=N
//   https://api-website.capital.com/api/v1/instruments/en-eu?productType=securities&type=share&sort=most&limit=100&page=N&regions[]=<id>
//   https://capital.com/en-eu/ways-to-trade/fees-and-charges/stocks
//   https://capital.com/order-execution-policy-cceu  (Order-Execution-Policy-V2.1.pdf)
//   https://capital.com/terms-and-conditions-share-dealing-cceu  (CCEU_T-C_Share-Dealing-Services-V1.1.pdf)
//   https://capital.com/fees-and-charges-stocks-cysec  (Capital_com_Regulatory_Taxes_Equities.pdf)
//
// The list. The "2,200+ assets available" screener on the stocks-and-etfs
// page is the "securities" product (real holdings; the CFD and knock-out
// lists are other tabs). It is server-rendered ten lines a page, and its
// default order ("Top risers") moves between two fetches, so the pages
// cannot be read one after another. The page draws its lines from the
// site's own public JSON API above, which takes the same filters; that is
// read here, a hundred lines a call, sorted "most traded", once per
// Region. The Region names come from the screener page itself. The
// regions split the list with no overlap: their totals must add up to the
// unfiltered total, and a line is kept once by its proxy_id. A Region that
// holds lines but has no place below stops the run. The Sector filter's
// "ETFs" sector is read once more to mark funds.
//
// A line gives a name, Capital.com's symbol (SHORT_TITLE: an exchange
// ticker, often with a lower-case tag such as AIfr, SAPd, EQQQgb, HMb,
// CMus) and the Region. It gives no exchange, currency or ISIN. The
// instrument pages the site links (market-summary -> /en-eu/markets/shares/
// ...) are the CFD pages of the same underlying (their spec table reads
// "asset_derivative: CONTRACT_FOR_DIFFERENCE") with only a country and a
// CFD currency, and most ETFs have none, so they are not read.
//
// Places, one row per line (the Region is the place):
//   Great Britain        London Stock Exchange (XLON). Only UCITS ETFs
//                        today. The symbol, tag dropped (EQQQgb -> EQQQ),
//                        is the TIDM; the LSE's own record of it gives the
//                        line's ISIN and trading currency (GBX, GBP, USD,
//                        EUR) and must name the same fund. The LSE's API
//                        blocks bursts, so its calls go one at a time.
//   United States        One NBBO market: one row a title, in USD, on the
//                        listing exchange Nasdaq Trader's directory gives
//                        (Nasdaq XNAS, NYSE XNYS, NYSE American XASE, NYSE
//                        Arca ARCX, Cboe BZX BATS, Texas Stock Exchange
//                        TXSE, NYSE Texas XCHI). Tags dropped (CMus ->
//                        CM), a class letter written with a dot (BRKb ->
//                        BRK.B). Capital.com still lists some titles under
//                        a retired symbol (SQ for Block, now XYZ; FI for
//                        Fiserv, now FISV); OVERRIDES gives the current
//                        one, and its raw ends "now <symbol>". A symbol the
//                        directory lacks is looked up by name in the US
//                        lists; one found nowhere is left out (ACVA, ATKR,
//                        VSCO today: no longer listed). The ISIN is the one
//                        assets/stocks.csv files for that symbol on its
//                        place, among the lines whose name agrees when any
//                        does.
//         https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//         https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//         (read from ftp://ftp.nasdaqtrader.com/symboldirectory/, same files)
//   Germany              Börse Xetra (XETR), EUR. Capital.com names no
//                        German venue; Xetra is the reference market.
//   Switzerland          SIX Swiss Exchange (XSWX); currency from SIX's own
//                        reference data for the ISIN and symbol (CHF for
//                        every share today), CHF when SIX has no line.
//         https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency&where=ISIN=<ISIN>
//   Norway               Oslo Børs (XOSL), NOK
//   Sweden               Nasdaq Stockholm (XSTO), SEK
//   Denmark              Nasdaq Copenhagen (XCSE), DKK
//   France               Euronext Paris (XPAR), EUR
//   Netherlands          Euronext Amsterdam (XAMS), EUR
//   Ireland              Euronext Dublin (XMSM), EUR
//   Italy                Euronext Milan (XMIL), EUR
//   Spain                Bolsa de Madrid (XMAD), EUR
//   Poland               Warsaw Stock Exchange (XWAR), PLN
// The other Regions the filter offers (Singapore, UAE, Hong Kong, Greece,
// Canada, Australia, Japan, Saudi Arabia, Belgium, Portugal) hold no line
// today.
//
// Outside London and the US the row's ticker is the exchange's own (Nasdaq
// Nordic writes the class with a space: HM B, MAERSK B), found in
// assets/stocks.csv and assets/etfs.csv on that place: from OVERRIDES
// below when the symbol is there (each checked by hand: HEId is Heidelberg
// Materials' HEI, HAGG is Hensoldt's HAG); else a symbol with no tag as it
// stands (BMW, DHL, MOWI); else the symbol with its tag dropped or its
// class tag turned into the class letter, kept only when the list's name
// for it shares a word with Capital.com's name; else the name alone, when
// it is one ticker of that place (CARF is Carrefour's CA, PHGeur Philips'
// PHIA). The ISIN is that line's. The run prints every match whose names
// differ, for review. A line found nowhere keeps Capital.com's symbol and
// no ISIN (AUSCHW today: SIX has no such symbol now).
//
// Several ISINs for one ticker (an old and a new code after a split or a
// move of domicile: KOG, SGSN, FER, AENA) stay in `matches`
// (isinMatches.mjs), which the front searches one by one. The lists also
// carry codes built from a CINS number (IEG1151C1013 beside Accenture's
// IE00B4BNMY34): a code with a letter third is dropped when one with a
// digit third stands beside it. Bonds would be dropped by
// withoutObligations; there are none.
//
// Currency: the line's own, as above. The account takes deposits in EUR,
// USD, GBP and PLN (minimum deposit "20 USD/EUR/GBP or 100 PLN", fees
// page; the share-dealing terms give USD, EUR or GBP as Base Currency),
// and "Accounts held in the currency of the asset" (stocks page). The
// screener gives no currency, so a title is repeated once for each of
// those deposit currencies its place's order book also quotes it in
// (spreads/spread.json, through addDepositCurrencies of N26).
//
// Type: ETC when the name says ETC, ETP or physical metal; ETN when it
// says ETN; ETF when it is in the "ETFs" sector or its name says UCITS or
// ETF; else STOCK. broker-list.json says "No US-domiciled ETFs
// (PRIIPs/KID)" for the US place. Capital.com's pages state no such rule,
// but the US Region holds no fund at all: every line in the "ETFs" sector
// is a UCITS ETF in the Great Britain Region, plus two UBS ETFs on SIX. So
// nothing is filtered; a US line the directory flags as an ETF would be
// written as ETF and counted in the run's tally (usEtf).
//
//   node brokers/capitalcomcy/capitalcomcy_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { lseLine } from "../../lseListings.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { loadCurrencyEvidence, addDepositCurrencies } from "../N26/N26_scraping.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SCREENER = "https://capital.com/en-eu/ways-to-trade/stocks-and-etfs";
const API = "https://api-website.capital.com/api/v1/instruments/en-eu?productType=securities&type=share&sort=most&limit=100";
const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const SIX_REF = "https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency&where=ISIN=";
const WORKERS = 4;
const FLOOR = 2000;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// Region name -> [exchange, MIC, currency, assets list places].
const PLACES = {
  "Great Britain": ["London Stock Exchange", "XLON", "", ["LSE"]],
  Norway: ["Oslo Børs", "XOSL", "NOK", ["OSL"]],
  Germany: ["Börse Xetra", "XETR", "EUR", ["XETR"]],
  Switzerland: ["SIX Swiss Exchange", "XSWX", "CHF", ["SIX"]],
  Sweden: ["Nasdaq Stockholm", "XSTO", "SEK", ["OMXSTO"]],
  France: ["Euronext Paris", "XPAR", "EUR", ["EURONEXT"]],
  Poland: ["Warsaw Stock Exchange", "XWAR", "PLN", ["GPW"]],
  Italy: ["Euronext Milan", "XMIL", "EUR", ["MIL"]],
  Ireland: ["Euronext Dublin", "XMSM", "EUR", ["EURONEXT"]],
  Netherlands: ["Euronext Amsterdam", "XAMS", "EUR", ["EURONEXT"]],
  Spain: ["Bolsa de Madrid", "XMAD", "EUR", ["BME"]],
  Denmark: ["Nasdaq Copenhagen", "XCSE", "DKK", ["OMXCOP"]],
  "United States of America": ["", "", "USD", ["NYSE", "NASDAQ", "AMEX", "CBOE"]],
};
// Nasdaq Trader listing-exchange code -> [exchange, MIC].
const US_PLACE = {
  Q: ["NASDAQ", "XNAS"],
  N: ["NYSE", "XNYS"],
  A: ["NYSE American", "XASE"],
  P: ["NYSE Arca", "ARCX"],
  Z: ["Cboe BZX", "BATS"],
  F: ["Texas Stock Exchange", "TXSE"],
  M: ["NYSE Texas", "XCHI"],
};
// Listing-exchange code -> the assets list places to read its ISIN from first.
const US_LIST_OF = { Q: ["NASDAQ"], N: ["NYSE"], A: ["AMEX"], P: ["AMEX"], Z: ["CBOE"], F: [], M: [] };
// Capital.com symbol -> exchange ticker, where neither the symbol nor the
// name finds the line by itself (checked by hand on the exchange).
const OVERRIDES = {
  "Germany|HEId": "HEI", // Heidelbergcement, now Heidelberg Materials
  "Germany|HOTG": "HOT", // Hochtief
  "Germany|HAGG": "HAG", // Hensoldt (HAGG on the lists is an HSBC ETF)
  "Spain|SABEe": "SAB", // Banco de Sabadell
  "France|GETfr": "GET", // Groupe Eurotunnel, now Getlink
  "Netherlands|HEIN": "HEIA", // Heineken N.V.
  "Netherlands|SHELa": "SHELL", // Shell's Amsterdam line
  "Netherlands|VOPA": "VPK", // Koninklijke Vopak
  "Netherlands|AEGN": "AGN", // Aegon
  "Sweden|ESSIBs": "ESSITY_B", // Essity B
  "United States of America|SQ": "XYZ", // Block
  "United States of America|PWFL": "AIOT", // Powerfleet
  "United States of America|UCBI": "UCB", // United Community Banks
  "United States of America|LIAC": "LAC", // Lithium Americas
  "United States of America|TPX": "SGI", // Somnigroup International
  "United States of America|BHLB": "BBT", // Beacon Financial
  "United States of America|BIGC": "CMRC", // Commerce.com
  "United States of America|CECE": "CECO", // CECO Environmental
  "United States of America|CSWI": "CSW", // CSW Industrials
  "United States of America|FI": "FISV", // Fiserv
  "United States of America|LANC": "MZTI", // The Marzetti Company
  "United States of America|PSTG": "P", // Everpure
  "United States of America|STRC": "PDYN", // Palladyne AI (STRC is now a Strategy preferred)
  "United States of America|DWDP": "DD", // DowDuPont, renamed DuPont de Nemours in 2019
};

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

// The LSE's API blocks a burst of calls for about three minutes: its calls
// go one at a time, 500 ms apart, and a refusal waits the block out twice
// before it counts as one.
let lseNext = 0;
async function paced(work) {
  for (let attempt = 0; ; attempt += 1) {
    const wait = lseNext - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const out = await work();
      lseNext = Date.now() + 500;
      return out;
    } catch (error) {
      if (attempt >= 2) throw error;
      console.error(`LSE: ${error.message || error}; waiting 200 s`);
      lseNext = Date.now() + 200_000;
    }
  }
}

// ---- the screener --------------------------------------------------------

// The Region and Sector names, from the flight data of the screener page.
async function filters() {
  const html = await page(`${SCREENER}?sort=most`);
  let flight = "";
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) flight += JSON.parse(`"${match[1]}"`);
  const regions = flight.match(/"regions":(\{"1":[^}]*\})/);
  const sectors = flight.match(/"sectors":(\{"1":[^}]*\})/);
  if (!regions || !sectors) throw new Error("the screener page has no Region or Sector filter");
  const assets = flight.match(/"__html":"([\d,]+)\+ assets available"/);
  return { regions: JSON.parse(regions[1]), sectors: JSON.parse(sectors[1]), headline: assets ? assets[1] : "" };
}

async function apiPage(filter, number) {
  const text = await page(`${API}&page=${number}${filter}`, "application/json");
  const body = JSON.parse(text);
  if (!Array.isArray(body.data)) throw new Error(`no data in ${API}&page=${number}${filter}`);
  return body;
}

// Every line under one filter.
async function lines(filter) {
  const first = await apiPage(filter, 1);
  const rest = await pool(
    Array.from({ length: Math.max(0, first.last_page - 1) }, (_, i) => i + 2),
    (number) => apiPage(filter, number),
  );
  const out = [first, ...rest].flatMap((body) => body.data);
  if (out.length !== first.total) throw new Error(`filter ${filter || "(none)"}: read ${out.length} of ${first.total}`);
  return { total: first.total, out };
}

// ---- reference lists -----------------------------------------------------

function csvCells(line) {
  return line.match(/("[^"]*"|[^,]*)(,|$)/g).map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, ""));
}

const tickerKey = (ticker) => String(ticker || "").toUpperCase().replace(/[\s._\-/]/g, "");

// place -> { byKey: ticker key -> lines, byName: name words -> lines, size }
function loadLists(places) {
  const book = new Map(places.map((place) => [place, { byKey: new Map(), byName: new Map(), size: 0 }]));
  for (const [file, fund] of [["etfs.csv", true], ["stocks.csv", false]]) {
    const text = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const [code, place, isin, name] = csvCells(line);
      const entry = book.get(place);
      if (!entry || !ISIN.test(isin || "")) continue;
      const ticker = String(code || "").split(":").slice(1).join(":").trim();
      const hit = { ticker, isin, name: name || "", fund };
      const key = tickerKey(ticker);
      if (!entry.byKey.has(key)) entry.byKey.set(key, []);
      entry.byKey.get(key).push(hit);
      const named = words(hit.name).join(" ");
      if (!entry.byName.has(named)) entry.byName.set(named, []);
      entry.byName.get(named).push(hit);
      entry.size += 1;
    }
  }
  for (const [place, entry] of book) if (entry.size < 100) throw new Error(`assets lists hold only ${entry.size} ${place} lines`);
  return book;
}

// Nasdaq Trader's FTP copy first: the web copy can answer with a bot check.
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

// ---- names ---------------------------------------------------------------

const NOISE = new Set(
  "the and of de des du la le et plc ltd limited inc incorporated corp corporation co company sa se ag nv bv spa ab asa as oyj publ holding holdings group gruppen grp class cl shs shares share ord ordinary reg registered bearer kgaa vz pfd new adr ads sponsored common stock units unit trust eur usd chf gbp nok sek dkk pln a b c d".split(" "),
);

function words(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !NOISE.has(word));
}

// Two names of one company share a word of three letters or more, or one
// name's words run together are the start of the other's ("Kongsberg
// Gruppen" / "KOG" is not; "Hennes & Mauritz" / "H&M Hennes & Mauritz" is).
function sameName(left, right) {
  const a = words(left);
  const b = new Set(words(right));
  if (a.some((word) => word.length >= 3 && b.has(word))) return true;
  const joinedA = a.join("");
  const joinedB = [...b].join("");
  return joinedA.length >= 4 && joinedB.length >= 4 && (joinedA.startsWith(joinedB) || joinedB.startsWith(joinedA));
}

// ---- symbols -------------------------------------------------------------

// Capital.com symbol -> candidate exchange tickers, most likely first.
function candidates(symbol) {
  const text = String(symbol || "").trim().split(/\s+/)[0];
  const out = [];
  const tag = text.match(/^(.*?[A-Z0-9])([a-z]+)$/);
  if (tag) {
    out.push(tag[1]);
    if (/^[abc]$/.test(tag[2])) out.push(`${tag[1]} ${tag[2].toUpperCase()}`);
    // A class tag is also written after another tag (FDJUpUp).
    const inner = tag[1].match(/^(.*?[A-Z0-9])([a-z]+)([A-Z]*)$/);
    if (inner) out.push(inner[1], inner[1] + inner[3]);
  }
  out.push(text.toUpperCase());
  return [...new Set(out)];
}

// The list line of a symbol on its place, or null: { place, ticker, isins,
// fund, how, nameOk }. A symbol with no tag is the exchange's ticker as it
// stands; a tagged one counts only when the list's name agrees.
function findLine(book, places, symbol, name, region) {
  const pick = (place, hits, how) => {
    const named = hits.filter((hit) => sameName(name, hit.name));
    const use = named.length ? named : hits;
    return { place, ticker: use[0].ticker, isins: [...new Set(use.map((hit) => hit.isin))], fund: use.some((hit) => hit.fund), listName: use[0].name, how, nameOk: named.length > 0 };
  };
  const override = OVERRIDES[`${region}|${symbol}`];
  if (override) {
    for (const place of places) {
      const hits = book.get(place).byKey.get(tickerKey(override)) || [];
      if (hits.length) return pick(place, hits, "override");
    }
    throw new Error(`override ${region}|${symbol} -> ${override} finds no line`);
  }
  const plain = String(symbol || "").trim().split(/\s+/)[0];
  if (!/[a-z]/.test(plain)) {
    for (const place of places) {
      const hits = book.get(place).byKey.get(tickerKey(plain)) || [];
      if (hits.length) return pick(place, hits, "symbol");
    }
  }
  for (const candidate of candidates(symbol)) {
    for (const place of places) {
      const hits = (book.get(place).byKey.get(tickerKey(candidate)) || []).filter((hit) => sameName(name, hit.name));
      if (hits.length) return pick(place, hits, "symbol");
    }
  }
  const key = words(name).join(" ");
  for (const place of places) {
    const hits = key ? book.get(place).byName.get(key) || [] : [];
    if (new Set(hits.map((hit) => tickerKey(hit.ticker))).size === 1) return pick(place, hits, "name");
  }
  return null;
}

// Capital.com's US symbol -> CQS symbol: "us" tag dropped (CMus -> CM), a
// one-letter class tag after a dot (BRKb -> BRK.B, HEIa -> HEI.A).
function usSymbol(symbol) {
  const plain = String(symbol || "").trim().split(/\s+/)[0];
  const tag = plain.match(/^(.*?[A-Z0-9])([a-z]+)$/);
  if (!tag) return plain;
  if (/^[abc]$/.test(tag[2])) return `${tag[1]}.${tag[2].toUpperCase()}`;
  return tag[1];
}

function typeOf(name, etfSector) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\b(ETC|ETP)\b|\bPhysical (Gold|Silver|Platinum|Palladium|Metals?)\b/i.test(name)) return "ETC";
  if (etfSector || /\bUCITS\b|\bETF\b/i.test(name)) return "ETF";
  return "STOCK";
}

// Nasdaq Nordic and the lists' "_B" class -> "HM B".
const nordicTicker = (ticker) => String(ticker).replace(/[_.]([A-Z])$/, " $1");
// The lists' US class "BRK.B" / "BRK B" / "BRK-B" -> CQS "BRK.B".
const usTicker = (ticker) => String(ticker).replace(/[\s_\-/]([A-Z])$/, ".$1");

// One ISIN is the row's; several (an old and a new code) stay in
// `matches`, which the front searches one by one. The lists also carry
// codes built from a CINS number (IEG1151C1013 beside Accenture's
// IE00B4BNMY34): a code with a letter third is dropped when a code with a
// digit third stands beside it.
function setIsin(row, place, isins, ticker) {
  let ids = [...new Set(isins)];
  const real = ids.filter((isin) => /^[A-Z]{2}\d/.test(isin));
  if (real.length && real.length < ids.length) ids = real;
  if (ids.length === 1) row.isin = ids[0];
  else row.isin = stampIsinMatches(row, [[place, ids]], ticker);
}

// ---- main ----------------------------------------------------------------

const { regions, sectors, headline } = await filters();
const etfSectorId = Object.keys(sectors).find((id) => sectors[id] === "ETFs");
if (!etfSectorId) throw new Error("the Sector filter has no ETFs");

const everything = await lines("");
if (everything.total < FLOOR) throw new Error(`the screener lists only ${everything.total} lines`);
const etfIds = new Set((await lines(`&sectors%5B%5D=${etfSectorId}`)).out.map((line) => line.proxy_id));

const byRegion = [];
let sum = 0;
for (const [id, region] of Object.entries(regions)) {
  const { total, out } = await lines(`&regions%5B%5D=${id}`);
  sum += total;
  if (!total) continue;
  if (!PLACES[region]) throw new Error(`Region ${region} holds ${total} lines and has no place`);
  for (const line of out) byRegion.push({ line, region });
}
if (sum !== everything.total) throw new Error(`the Regions hold ${sum} lines, the list ${everything.total}`);

const seen = new Set();
const titles = [];
for (const item of byRegion) {
  if (seen.has(item.line.proxy_id)) continue;
  seen.add(item.line.proxy_id);
  titles.push(item);
}
for (const line of everything.out) if (!seen.has(line.proxy_id)) throw new Error(`${line.SHORT_TITLE} is in no Region`);

const listPlaces = [...new Set(Object.values(PLACES).flatMap((place) => place[3]).filter((place) => place !== "LSE"))];
const book = loadLists(listPlaces);
const us = await usDirectory();

const rows = [];
const tally = { lse: 0, listed: 0, byName: 0, override: 0, unfound: 0, usEtf: 0 };
const unfound = [];
const doubtful = [];
const lseRows = [];
const sixRows = [];

for (const { line, region } of titles) {
  const symbol = String(line.SHORT_TITLE || "").trim();
  const name = String(line.DISPLAY_TITLE || line.TITLE || "").trim();
  const title = String(line.TITLE || name).trim();
  const etfSector = etfIds.has(line.proxy_id);
  const [exchange, mic, currency, places] = PLACES[region];
  const raw = [title, name !== title ? name : "", symbol, region, etfSector ? "sector ETFs" : "", `proxy_id ${line.proxy_id}`].filter(Boolean).join(" | ");
  const row = { query: symbol, ticker: symbol, name: title, exchange, mic, currency, type: typeOf(title, etfSector), isin: "", raw };

  if (region === "Great Britain") {
    lseRows.push(row);
    rows.push(row);
    continue;
  }
  if (region === "United States of America") {
    let cqs = OVERRIDES[`${region}|${symbol}`] || usSymbol(symbol);
    let found = null;
    if (!us.has(cqs)) {
      found = findLine(book, places, symbol, title, region);
      if (found) cqs = usTicker(found.ticker);
    }
    const listed = us.get(cqs);
    if (!listed || !US_PLACE[listed.code]) {
      unfound.push(`${region}: ${symbol} ${title} (no US listing)`);
      tally.unfound += 1;
      continue;
    }
    [row.exchange, row.mic] = US_PLACE[listed.code];
    row.ticker = cqs;
    if (cqs !== usSymbol(symbol)) row.raw += ` | now ${cqs}`;
    if (listed.etf) {
      row.type = "ETF";
      tally.usEtf += 1;
    }
    const own = US_LIST_OF[listed.code] || [];
    const order = [...own, ...places.filter((place) => !own.includes(place))];
    const hits = order.map((place) => [place, (book.get(place).byKey.get(tickerKey(cqs)) || [])]).find(([, list]) => list.length);
    if (hits) {
      const named = hits[1].filter((hit) => sameName(title, hit.name));
      const use = named.length ? named : hits[1];
      setIsin(row, hits[0], use.map((hit) => hit.isin), cqs);
      if (!named.length && !sameName(title, listed.name)) doubtful.push(`${region}: ${symbol} "${title}" is ${cqs} "${listed.name}"`);
      tally.listed += 1;
    } else {
      unfound.push(`${region}: ${symbol} ${title} (no ISIN)`);
      tally.unfound += 1;
    }
    rows.push(row);
    continue;
  }
  const found = findLine(book, places, symbol, title, region);
  if (found) {
    row.ticker = mic === "XSTO" || mic === "XCSE" ? nordicTicker(found.ticker) : found.ticker.replace(/\.[A-Z]{3}$/, "");
    setIsin(row, found.place, found.isins, row.ticker);
    if (!found.nameOk) doubtful.push(`${region}: ${symbol} "${title}" is ${found.ticker} "${found.listName}" (${found.how})`);
    if (found.how === "name") doubtful.push(`${region}: ${symbol} "${title}" found by name as ${found.ticker} "${found.listName}"`);
    tally[found.how === "symbol" ? "listed" : found.how === "name" ? "byName" : "override"] += 1;
  } else {
    row.ticker = candidates(symbol)[0];
    unfound.push(`${region}: ${symbol} ${title}`);
    tally.unfound += 1;
  }
  if (mic === "XSWX") sixRows.push(row);
  rows.push(row);
}

// London: the LSE's own record of each TIDM, one at a time.
for (const row of lseRows) {
  let hit = null;
  for (const candidate of candidates(row.query)) {
    hit = await paced(() => lseLine(candidate));
    if (hit && sameName(row.name, hit.name)) break;
    hit = null;
  }
  if (!hit) {
    unfound.push(`Great Britain: ${row.query} ${row.name}`);
    tally.unfound += 1;
    row.ticker = candidates(row.query)[0];
    row.currency = "GBX";
    row.raw += " | currency: not found on the LSE";
    continue;
  }
  row.ticker = hit.ticker;
  row.isin = hit.isin;
  row.currency = hit.currency;
  row.raw += ` | LSE ${hit.ticker} ${hit.currency} ${hit.name}`;
  tally.lse += 1;
}

// SIX: the trading currency of the symbol's line.
await pool(sixRows, async (row) => {
  if (!row.isin) return;
  const text = await page(SIX_REF + row.isin, "text/csv");
  const lines = text.split(/\r?\n/).slice(1).map((line) => line.split(";")).filter((cells) => cells[0] === row.isin);
  const own = lines.find((cells) => cells[1] === row.ticker) || (lines.length === 1 ? lines[0] : null);
  if (own && own[2]) {
    row.currency = own[2].toUpperCase();
    row.raw += ` | SIX ${own[1]} ${own[2]}`;
  }
});

// One more line for each deposit currency the place also quotes the title in.
const DEPOSIT = new Set(["EUR", "USD", "GBP", "PLN"]);
const { listed, books } = loadCurrencyEvidence("capitalcomcy");
const own = new Set(rows);
// Only a currency the place's own order book quotes: other catalogues alone
// put DSV in euros on Copenhagen and Dino in euros on Warsaw.
const inBook = (row) => {
  const mic = resolveVenue(row).venue?.mic;
  const ccys = [...(books.get(`${mic}|${String(row.isin).toUpperCase()}`) || [])].map((ccy) => (ccy === "GBX" ? "GBP" : ccy));
  return ccys.includes(row.currency);
};
const withDeposits = addDepositCurrencies(rows, listed, books, DEPOSIT).filter((row) => own.has(row) || inBook(row));
for (const row of withDeposits) if (!own.has(row)) row.raw += ` | ${row.currency} line of the same place`;
tally.depositLines = withDeposits.length - rows.length;
rows.splice(0, rows.length, ...withDeposits);

const unresolved = new Set();
for (const row of rows) {
  const { venue } = resolveVenue({ exchange: row.exchange, mic: row.mic, currency: row.currency });
  if (!venue || venue.mic !== row.mic) unresolved.add(`${row.exchange}|${row.mic}|${row.currency}`);
}

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const kept = withoutObligations(rows);
if (kept.length < rows.length) console.error(`dropped as debt: ${rows.filter((row) => !kept.includes(row)).map((row) => `${row.exchange}:${row.ticker} ${row.name}`).join("; ")}`);
fs.writeFileSync(new URL("capitalcomcy-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));

const counts = {};
for (const row of kept) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
if (unfound.length) console.error(`not found (${unfound.length}):\n  ${unfound.join("\n  ")}`);
if (doubtful.length) console.error(`check (${doubtful.length}):\n  ${doubtful.join("\n  ")}`);
if (unresolved.size) console.error("unresolved venues:", [...unresolved]);
console.error(`${kept.length} rows from ${titles.length} lines (screener: "${headline}+ assets available", ${everything.total} lines, ${etfIds.size} in the ETFs sector)`, tally);
