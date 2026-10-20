// What Charles Stanley Direct (UK) sells in shares, investment trusts and
// exchange-traded products, with no login.
//
// The public investment search has a Shares tab (about 10,100 lines) that
// lists every security the platform deals in that is not a fund: UK and AIM
// shares, investment trusts, ETFs and ETCs, US, Canadian, French, German and
// Swiss shares, and bonds. Each line has a name, a symbol, ISA/SIPP flags, a
// Buy button and an Info page. The Funds tab (OEICs and unit trusts) is not
// read; the All tab is the two together.
//
//   https://www.charles-stanley-direct.co.uk/InvestmentSearch/Search?SearchType=KeywordSearch&Category=Equities&SortColumn=Name&SortDirection=Asc&Pagesize=50&Page=1
//   https://www.charles-stanley-direct.co.uk/ViewShare?InvestmentId=<id>
//   https://www.charles-stanley.co.uk/help-and-contact/help/international-trading
//
// Online, Charles Stanley deals in "Over 4,000 US, Canadian, and European
// shares": NYSE, NASDAQ, TSX, TSX Venture, Paris, Frankfurt and Zurich.
// Other markets are phone-only and are not in the list.
//
// The list gives no market, currency or ISIN, so every Info page is read
// (about 10,100 pages, four at a time). It gives the Refinitiv code of the
// quote it shows (VOD.L, TXG.NB, AUMB.NBC, ABEO.PA, ADSGn.BE, ABBN.S) and the
// chart's exchange prefix (NASDAQBAS, NASBASNYSE, NASDAQCAN, PAR, BER, SWX),
// which places the line. A line with no code but a chart prefix is placed by
// the prefix.
//
//   .L        London. The LSE's record of the symbol (or else of the code)
//             gives the TIDM, the ISIN, the line's own trading currency (GBX,
//             GBP, USD, EUR, and a few CAD or HKD lines) and the market:
//             MAINMARKET, ATT (admitted to trading only) and OTHERS (the
//             international segment of 0xxx lines, such as 0HD6 for
//             Alphabet C) are "London Stock Exchange", AIM is "AIM"; all XLON.
//             The MiFIR class gives the type: ETFS is an ETF, ETCS an ETC,
//             ETNS an ETN; shares, depositary receipts, CDIs and investment
//             trusts are STOCK. Bonds, gilts, warrants (SDRV) and the
//             Professional Securities Market are left out.
//             A London code the LSE does not know is an Aquis Stock Exchange
//             line (AQSE, GBX) when the Aquis listing file has that symbol
//             under the same issuer; otherwise it is left out (mostly
//             "ASSD" assented lines and delisted shares or ETFs).
//   .NB       United States. US venues are one NBBO market, so a US title is
//             one row, in USD, on the listing exchange the listing files give
//             (Nasdaq XNAS, NYSE XNYS, NYSE American XASE, Cboe BZX BATS; an
//             ETF on NYSE American's file is NYSE Arca ARCX). A symbol that is
//             in none of them is left out: over the counter, or delisted. The
//             code's ticker is tried too, for a renamed company (IMPX is
//             LVWR.NB).
//   .NBC      Canada: Toronto Stock Exchange (XTSE) or TSX Venture (XTSX), by
//             the listing files, in CAD (a ".U" symbol is the USD line). The
//             code's ticker is tried too (GLDG is GOLD.NBC).
//   .PA       Paris, from Euronext's own list: Euronext Paris (XPAR) or
//             Euronext Growth Paris (ALXP), in EUR.
//   .BE       Germany. The page quotes Berlin, but Charles Stanley names the
//             Frankfurt Stock Exchange as its German market: the row is
//             "Frankfurt Stock Exchange" on Xetra (XETR), in EUR, when the
//             Xetra or Frankfurt listing file has the symbol.
//   .S        SIX Swiss Exchange (XSWX), in CHF.
//
// The price header ("All prices are in USD as at 15:58") is kept in `raw`
// only: when the quote feed misses a line the page falls back to pence "as
// at 3 days ago" even for a live share, so it places nothing.
//
// Left out as well: a code with "=" (a bond or note quote), a code with "^"
// (a retired quote: delisted), a line with neither code nor chart (unquoted
// bonds and notes), and an Info page the site cannot render (it answers 500
// every time) unless the LSE or a US listing file knows that symbol under
// the same issuer. Bonds and notes that slip through are dropped by
// withoutObligations. The site repeats a few lines twice; one Info id is one
// line.
//
// ISIN: London lines from the LSE record, Paris lines from Euronext's list,
// every other line from the repository's listing files (assets/stocks.csv
// and assets/etfs.csv) by exchange and symbol; a symbol with several ISINs
// keeps them all in `matches`. Outside London a line is an ETF, ETC or ETN
// only when its name says so; otherwise it is a STOCK.
//
//   https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>
//   https://live.euronext.com/pd_es/data/stocks/download?mics=XPAR,ALXP,XMLI
//
//   node brokers/charlesstanley/charlesstanley_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://www.charles-stanley-direct.co.uk";
const LIST = `${SITE}/InvestmentSearch/Search?SearchType=KeywordSearch&Category=Equities&SortColumn=Name&SortDirection=Asc&Pagesize=50&Page=`;
const INFO = `${SITE}/ViewShare?InvestmentId=`;
const LSE = "https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/";
const EURONEXT = "https://live.euronext.com/pd_es/data/stocks/download?mics=XPAR,ALXP,XMLI";
const OUTPUT = new URL("charlesstanley-parsed.json", import.meta.url);
const WORKERS = 4;
const FLOOR = 9000;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// Listing-file exchange -> [exchange, MIC].
const US = {
  NASDAQ: ["Nasdaq", "XNAS"],
  NYSE: ["NYSE", "XNYS"],
  AMEX: ["NYSE American", "XASE"],
  CBOE: ["Cboe BZX", "BATS"],
};
const CANADA = {
  TSX: ["Toronto Stock Exchange", "XTSE"],
  TSXV: ["TSX Venture Exchange", "XTSX"],
};
// Euronext's Market column -> [exchange, MIC]. A share listed in Paris and
// elsewhere reads "Euronext Paris, Amsterdam, Brussels".
function parisMarket(market) {
  const first = String(market || "").split(",")[0].trim();
  if (first === "Euronext Paris") return ["Euronext Paris", "XPAR"];
  if (first === "Euronext Growth Paris") return ["Euronext Growth Paris", "ALXP"];
  if (first === "Euronext Access Paris") return ["Euronext Access Paris", "XPAR"];
  return null;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A page, or null when the server answers 404 or keeps answering 500.
async function get(url, accept = "text/html", tries = 5) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-GB,en;q=0.9" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
      if (response.status === 404) return null;
      if (response.status === 500 && attempt >= 2) return null;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

async function pool(items, task) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await task(items[index]);
      done += 1;
      if (done % 1000 === 0) console.error(`${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return out;
}

// One search page: every line with its name, symbol and Info id.
function listLines(html) {
  const lines = [];
  for (const [row] of html.matchAll(/<tr>\s*<td class="name">[\s\S]*?<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => normalize(match[1]));
    const id = row.match(/ViewShare\?InvestmentId=([^"&]+)/)?.[1];
    if (!id) continue;
    lines.push({ id, name: cells[0], symbol: cells[1], isa: cells[2], sipp: cells[3] });
  }
  return lines;
}

async function readList() {
  const first = await get(LIST + 1);
  const total = Number(first.match(/of <em>(\d+)<\/em> matching/)?.[1]);
  const pages = Number(first.match(/page <em>1<\/em> of <em>(\d+)<\/em>/)?.[1]);
  if (!total || !pages) throw new Error("the search page has no count");
  const rest = await pool(Array.from({ length: pages - 1 }, (_, index) => index + 2), async (page) => listLines(await get(LIST + page)));
  const all = [...listLines(first), ...rest.flat()];
  if (all.length !== total) throw new Error(`the search says ${total} lines, ${all.length} read`);
  // The server repeats a few lines twice in a row; one Info id is one line.
  const seen = new Set();
  const unique = all.filter((line) => !seen.has(line.id) && seen.add(line.id));
  console.error(`${total} lines in the Shares tab, ${unique.length} distinct`);
  if (unique.length < FLOOR) throw new Error(`only ${unique.length} lines`);
  return unique;
}

// The Info page: the Refinitiv code and the chart's exchange:symbol.
// A page that still fails after the retries counts as unreadable; more than
// 50 of those stops the run.
let unreadable = 0;
async function readInfo(line) {
  let html = null;
  try {
    html = await get(INFO + line.id, "text/html", 4);
  } catch (error) {
    unreadable += 1;
    console.error(`unreadable: ${error.message}`);
    if (unreadable > 50) throw new Error("more than 50 Info pages unreadable");
  }
  if (html === null) return { ...line, broken: true, ric: "", chart: "", quoted: "" };
  const tickers = [...new Set([...html.matchAll(/data-ticker="([^"]*)"/g)].map((match) => match[1].trim()))];
  const ric = tickers.find((code) => /[.=]/.test(code)) || "";
  const chart = tickers.find((code) => code.includes(":")) || "";
  // "All prices are in <b>USD</b> as at 15:58". The Time & Sales box further
  // down always says GBX and is not this. It is kept in `raw` only: when the
  // quote feed misses a line, the page falls back to pence "as at 3 days
  // ago" even for a live share (RIVN, VTRS), so it says nothing reliable.
  const price = html.match(/All prices are in\s*(?:<[^>]*>\s*)*([A-Z]{3})\s*(?:<[^>]*>\s*)*as at/);
  return { ...line, ric, chart, quoted: price?.[1] || "" };
}

// The LSE's record of one TIDM, or null when the LSE does not know it.
// The API sits behind a rate rule that answers 403 for about three minutes
// after a burst of calls: one call every 400 ms stays under it, and a 403
// holds every LSE call for three minutes.
const LSE_GAP = 400;
let lseSlot = 0;
async function lsePace() {
  const now = Date.now();
  const slot = Math.max(now, lseSlot);
  lseSlot = slot + LSE_GAP;
  if (slot > now) await sleep(slot - now);
}

const lseCache = new Map();
async function lseFetch(tidm) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await lsePace();
    try {
      const response = await fetch(LSE + encodeURIComponent(tidm), {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.json();
      if (response.status === 404) return null;
      last = `${response.status} ${tidm}`;
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

function lseRecord(tidm) {
  const key = String(tidm || "").trim().toUpperCase();
  if (!key) return null;
  if (!lseCache.has(key)) lseCache.set(key, lseFetch(key).then((record) => (record && ISIN.test(record.isin || "") ? record : null)));
  return lseCache.get(key);
}

// Euronext's list of Paris shares: symbol -> [{isin, mic, currency}].
async function parisLines() {
  const text = await get(EURONEXT, "text/csv");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = lines[0].split(";").map((cell) => cell.replace(/"/g, ""));
  const at = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Euronext file has no ${name} column`);
    return index;
  };
  const [isin, symbol, market, currency] = ["ISIN", "Symbol", "Market", "Currency"].map(at);
  const out = new Map();
  for (const line of lines.slice(1)) {
    const cells = line.match(/("[^"]*"|[^;]*)(;|$)/g)?.map((cell) => cell.replace(/;$/, "").replace(/^"|"$/g, "").trim()) || [];
    if (!ISIN.test(cells[isin] || "")) continue;
    const place = parisMarket(cells[market]);
    if (!place) continue;
    const key = cells[symbol].toUpperCase();
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ isin: cells[isin], exchange: place[0], mic: place[1], currency: cells[currency].toUpperCase() });
  }
  if (out.size < 500) throw new Error(`Euronext file has only ${out.size} Paris symbols`);
  return out;
}

// assets/stocks.csv and assets/etfs.csv: "EXCHANGE:SYMBOL" -> {isins, names}.
function listingFiles() {
  const book = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const cells = line.split(",");
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const symbol = String(cells[0] || "").split(":").slice(1).join(":").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!exchange || !symbol || !ISIN.test(isin)) continue;
      const key = `${exchange}:${symbol}`;
      if (!book.has(key)) book.set(key, { isins: new Set(), names: [] });
      book.get(key).isins.add(isin);
      book.get(key).names.push(cells.slice(3).join(",").replace(/"/g, ""));
    }
  }
  return book;
}

// Outside London the type comes from the name. A closed-end fund that the
// listing files put among ETFs says "COM" and stays a STOCK.
function typeOf(name) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\b(ETFs?|UCITS)\b|exchange traded/i.test(name)) return "ETF";
  return "STOCK";
}

const MIFIR = { ETFS: "ETF", ETCS: "ETC", ETNS: "ETN", SHRS: "STOCK", DPRS: "STOCK" };
// The LSE's markets: the Main Market, AIM, ATT (admitted to trading only,
// such as Investec's preference shares) and OTHERS, the international
// segment (SSX4) of overseas shares and funds such as 0HD6 (Alphabet C).
const LONDON_MARKETS = new Set(["MAINMARKET", "AIM", "ATT", "OTHERS"]);

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const paris = await parisLines();
const files = listingFiles();
const lines = await readList();

function makeRow(info, { ticker, exchange, mic, currency, type, isin, extra = [] }) {
  return {
    query: isin || ticker,
    ticker,
    name: info.name,
    exchange,
    mic,
    currency,
    type,
    isin: isin || "",
    raw: [info.symbol, info.name, info.ric, info.chart, info.quoted, ...extra].filter(Boolean).join(" | "),
  };
}

// A symbol looked up on the listing files of the given exchanges, in order.
function fromFiles(symbol, exchanges) {
  const groups = new Map();
  let first = "";
  for (const exchange of exchanges) {
    const hit = files.get(`${exchange}:${symbol}`);
    if (!hit) continue;
    groups.set(exchange, hit.isins);
    first ||= exchange;
  }
  return { groups, first };
}

// The first word of two names, past "THE" and the like, is the same.
function sameIssuer(left, right) {
  const word = (name) =>
    normalize(name)
      .toUpperCase()
      .replace(/['\u2019]/g, "")
      .replace(/[^A-Z0-9 ]/g, " ")
      .split(" ")
      .filter((part) => part && !/^(THE|LA|LE|DIE|DER)$/.test(part))[0] || "";
  return word(left) !== "" && word(left) === word(right);
}

function withIsin(row, groups) {
  const only = stampIsinMatches(row, groups, row.ticker);
  if (only) {
    row.isin = only;
    row.query = only;
  }
  return row;
}

async function london(info) {
  const base = info.ric.replace(/\.L$/, "");
  let record = await lseRecord(info.symbol);
  if (!record && base.toUpperCase() !== info.symbol.toUpperCase()) record = await lseRecord(base);
  if (!record) return aquis(info);
  const market = String(record.market || "").toUpperCase();
  if (!LONDON_MARKETS.has(market)) return skip(`London market ${market || "none"}`);
  const mifir = String(record.mifir || "").toUpperCase();
  // OTHR is a share held as a CDI (GRAFTON GROUP PLC UT (CDI)).
  const type = MIFIR[mifir] || (mifir === "OTHR" && record.category === "EQUITY" ? "STOCK" : "");
  if (!type) return skip(`London MiFIR class ${mifir || "none"}`);
  return makeRow(info, {
    ticker: record.tidm,
    exchange: market === "AIM" ? "AIM" : "London Stock Exchange",
    mic: "XLON",
    currency: String(record.currency || "").toUpperCase(),
    type,
    isin: record.isin,
    extra: [record.tidm, record.isin, record.currency, record.market, record.mifir],
  });
}

// The site gives an Aquis share a London code too. A London code the LSE
// does not know is an Aquis line when the Aquis listing file has that
// symbol under the same issuer.
function aquis(info) {
  const symbol = info.symbol.toUpperCase();
  const listed = fromFiles(symbol, ["AQUIS"]);
  const names = listed.first ? files.get(`AQUIS:${symbol}`).names : [];
  if (!names.some((name) => sameIssuer(name, info.name))) return skip("London symbol the LSE does not know");
  const row = makeRow(info, { ticker: symbol, exchange: "Aquis Stock Exchange", mic: "AQSE", currency: "GBX", type: "STOCK" });
  return withIsin(row, listed.groups);
}

// A US quote code is the ticker with a lower-case class letter (BRKb.NB).
// It is tried when the list's symbol is no longer listed (a renamed company).
function unitedStates(info) {
  const own = info.ric.replace(/\.[A-Z]+$/, "").replace(/([a-z])$/, ".$1").toUpperCase();
  let symbol = info.symbol.toUpperCase();
  let listed = fromFiles(symbol, Object.keys(US));
  if (!listed.first && own && own !== symbol) {
    const other = fromFiles(own, Object.keys(US));
    if (other.first) [symbol, listed] = [own, other];
  }
  if (!listed.first) return skip(fromFiles(symbol, ["OTC"]).first ? "US over the counter" : "US symbol on no US exchange");
  let [exchange, mic] = US[listed.first];
  const type = typeOf(info.name);
  if (type !== "STOCK" && mic === "XASE") [exchange, mic] = ["NYSE Arca", "ARCX"];
  const row = makeRow(info, { ticker: symbol, exchange, mic, currency: "USD", type });
  return withIsin(row, listed.groups);
}

// The quote code is tried as well when the symbol is not found: GoldMining
// is GLDG in the list and GOLD.NBC on the page.
function canada(info) {
  const own = info.ric.replace(/\.[A-Z]+$/, "").replace(/([a-z])$/, ".$1").toUpperCase();
  let symbol = info.symbol.toUpperCase();
  let listed = fromFiles(symbol, Object.keys(CANADA));
  if (!listed.first && own && own !== symbol) {
    const other = fromFiles(own, Object.keys(CANADA));
    if (other.first) [symbol, listed] = [own, other];
  }
  if (!listed.first) return skip("Canadian symbol on neither TSX nor TSX Venture");
  const [exchange, mic] = CANADA[listed.first];
  const type = typeOf(info.name);
  const currency = /\.U$/.test(symbol) ? "USD" : "CAD";
  const row = makeRow(info, { ticker: symbol, exchange, mic, currency, type });
  return withIsin(row, listed.groups);
}

function france(info) {
  const symbol = info.symbol.toUpperCase();
  const hits = paris.get(symbol) || [];
  if (!hits.length) return skip("Paris symbol not in Euronext's list");
  const { exchange, mic, currency } = hits[0];
  const row = makeRow(info, { ticker: symbol, exchange, mic, currency: currency || "EUR", type: typeOf(info.name) });
  return withIsin(row, new Map([[mic, new Set(hits.map((hit) => hit.isin))]]));
}

function germany(info) {
  const symbol = info.symbol.toUpperCase();
  const listed = fromFiles(symbol, ["XETR", "FWB"]);
  if (!listed.first) return skip("German symbol on neither Xetra nor Frankfurt");
  const type = typeOf(info.name);
  const row = makeRow(info, { ticker: symbol, exchange: "Frankfurt Stock Exchange", mic: "XETR", currency: "EUR", type });
  return withIsin(row, listed.groups);
}

// SIX also quotes some German shares in francs (BEIERSDORF AG NPV (CHF)) under
// the Xetra symbol. When the SIX file lacks the symbol, the ISIN comes from
// the Xetra or Frankfurt line of that symbol if the names agree.
function switzerland(info) {
  const symbol = info.symbol.toUpperCase();
  let listed = fromFiles(symbol, ["SIX"]);
  if (!listed.first) {
    const home = fromFiles(symbol, ["XETR", "FWB"]);
    const names = home.first ? files.get(`${home.first}:${symbol}`).names : [];
    if (names.some((name) => sameIssuer(name, info.name))) listed = home;
  }
  const type = typeOf(info.name);
  const row = makeRow(info, { ticker: symbol, exchange: "SIX Swiss Exchange", mic: "XSWX", currency: "CHF", type });
  return withIsin(row, listed.groups);
}

// An Info page the site cannot render (500) leaves only the list's name and
// symbol. The line is kept when the LSE, or a US exchange's listing file,
// knows that symbol under the same issuer: 0XSE is Infosys's London line,
// DDS is Dillard's on NYSE. The rest are mostly bonds and delisted shares.
async function blind(info) {
  const symbol = info.symbol.toUpperCase();
  if (!symbol) return skip("Info page answers 500");
  const record = await lseRecord(symbol);
  if (record && sameIssuer(record.issuername || record.description, info.name)) return london(info);
  const listed = fromFiles(symbol, Object.keys(US));
  const names = listed.first ? files.get(`${listed.first}:${symbol}`).names : [];
  if (names.some((name) => sameIssuer(name, info.name))) return unitedStates(info);
  return skip("Info page answers 500");
}

// Quote-code suffix, or else the chart's exchange prefix -> market.
const BY_SUFFIX = {
  ".L": "london",
  ".NB": "us",
  ".N": "us",
  ".O": "us",
  ".OQ": "us",
  ".A": "us",
  ".P": "us",
  ".K": "us",
  ".NBC": "canada",
  ".TO": "canada",
  ".V": "canada",
  ".PA": "france",
  ".BE": "germany",
  ".DE": "germany",
  ".F": "germany",
  ".S": "switzerland",
};
const BY_PREFIX = { NASDAQBAS: "us", NASBASNYSE: "us", NASDAQCAN: "canada", PAR: "france", BER: "germany", SWX: "switzerland" };
const MARKET = { london, us: unitedStates, canada, france, germany, switzerland };

async function place(info) {
  if (info.broken) return blind(info);
  const ric = info.ric;
  if (ric.includes("=")) return skip("bond or note quote");
  if (ric.includes("^")) return skip("retired quote (delisted)");
  // A few lines have no quote code but still a chart (SOUN: NASDAQBAS:SOUN).
  const market = ric ? BY_SUFFIX[ric.slice(ric.lastIndexOf(".")).toUpperCase()] : BY_PREFIX[info.chart.split(":")[0].toUpperCase()];
  if (!market) return skip(ric ? "unknown quote code" : "no quote code (unquoted bond or note)");
  return MARKET[market](info);
}

// Each worker reads an Info page and then places the line, so the LSE
// calls share the same four slots as the Charles Stanley pages.
const placed = await pool(lines, async (line) => place(await readInfo(line)));
const rows = [];
const seen = new Set();
for (const row of placed) {
  if (!row) continue;
  const key = `${row.mic}|${row.ticker}|${row.currency}`;
  if (seen.has(key)) {
    skip("same line twice");
    continue;
  }
  seen.add(key);
  rows.push(row);
}

if (!rows.some((row) => row.ticker === "VOD" && row.mic === "XLON" && row.type === "STOCK")) throw new Error("Vodafone is missing");
if (!rows.some((row) => row.ticker === "SMT" && row.mic === "XLON")) throw new Error("Scottish Mortgage is missing");
if (!rows.some((row) => row.ticker === "AAPL" && row.mic === "XNAS")) throw new Error("Apple is missing");
if (!rows.some((row) => row.mic === "XLON" && row.type === "ETF")) throw new Error("no London ETF");

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker) || left.currency.localeCompare(right.currency));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) {
  const key = `${row.exchange} ${row.mic} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`left out: ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
console.error(`${rows.length - kept.length} bond or note rows dropped by withoutObligations`);
console.error(`${kept.length} rows, ${kept.filter((row) => row.isin).length} with an ISIN`);
