// What Sahm Capital (Sahm Capital Financial Company, Riyadh, CMA licence)
// sells: Saudi stocks, ETFs and REITs on Tadawul and Nomu, and US stocks,
// ETFs and OTC lines. Its pricing page prices "U.S. and Saudi stock, ETF"
// trades; the OTC page says OTC lets a client trade "unissued securities,
// delisted stocks, bonds, and derivatives".
//
// The book is Sahm's own quote API, the one behind the "Market ranking
// table" of each market page. It answers without a login, by limit and
// offset, and gives each list's total. Every list is read to the end.
//   Saudi: type 5 stocks, type 8 ETFs, type 7 REITs; type 40 is the Main
//   Market board, type 41 the Nomu board.
//   US: type 1 stocks, type 55 ETFs, type 2 OTC.
// Saudi type 6 is sukuk, US type 4 warrants: not read. The other types
// are subsets of these (top-20 boards, sectors).
// A line is kept only when its status is 0 (trading). Status 1 is a halted
// or delisted line (SABB Takaful, US Steel), 4 delisted (Twitter), 6 an IPO
// not yet trading.
//
// Saudi. The stock list holds Tadawul and Nomu. Sahm's two boards place
// each code; a code on neither or both stops the run. The closed-end
// funds on the Main Market board (Alkhabeer Income, 47xx) are not ETFs
// and stay out. Sahm's Nomu article: an account must meet one of the CMA qualified-
// investor criteria (SAR 40 million traded, SAR 5 million net assets,
// three years in finance, CME-1, ...) before Nomu is activated. That
// depends on the client, so Nomu rows carry a remark. A REIT is a share.
// Currency SAR. The ISIN comes from the shared lists (stampRows).
//
// US. The list has no exchange field and holds long-dead codes (LOXO,
// RCII). A code is kept when the Nasdaq Trader symbol directory lists it,
// and is placed on the exchange the directory names. Directory code F is
// the Texas Stock Exchange, M NYSE Texas, as brokers/moomoous reads them.
// One NBBO market: one row a title. Warrants, rights and when-issued
// lines stay out; units stay as shares. Sahm writes units as AAC.UN where
// the directory writes AAC=. Debt (baby bonds) goes by Sahm's name or the
// directory's. The type rule is at usType below.
//
// OTC. Sahm's list is a raw security master (29,711 lines on 23 October
// 2026, about 5,300 never priced). A line is kept when OTC Markets' stock
// screener lists the symbol, on any tier: Sahm states no tier rule and
// offers delisted and unissued lines, so Grey and Expert Market stay.
// The screener's security type decides: shares, ADRs, preferred shares,
// funds, units and "other" are STOCK; ETFs and structured products are
// ETF, unless the name shows a company share (ADR, NY registry, REIT).
// Warrants, rights and debt stay out. A symbol already kept on a US
// exchange is not written again. otcmarkets.com refuses plain HTTP
// clients, so the screener is read from a headless Chrome and kept in
// otc-screener-cache.json for three days.
//
// Restrictions: broker-list.json names none. Sahm states no OTC tier or
// ETF rule. US accounts are for non-US persons only (account guides).
//
//   https://www.sahmcapital.com/pricing
//   https://www.sahmcapital.com/invest/saudi-stock-market
//   https://www.sahmcapital.com/invest/us-stock-market
//   https://www.sahmcapital.com/invest/otc
//   https://www.sahmcapital.com/support/detail/what-conditions-are-required-to-activate-nomu-in-the-app?articleId=311
//   https://quoteapi.sahmcapital.com/base/hq/queryMarketDataList     (POST type=5&limit=5000&offset=0)
//   https://quoteapi.sahmcapital.com/us/base/hq/queryMarketDataList  (POST type=1&limit=5000&offset=0)
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//   https://www.otcmarkets.com/research/stock-screener/api?market=1&sortField=symbol&sortOrder=asc&page=0&pageSize=100
//
//   node brokers/sahm/sahm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { isObligation, withoutObligations } from "../../obligation.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";

const SAUDI = "https://quoteapi.sahmcapital.com/base/hq/queryMarketDataList";
const US = "https://quoteapi.sahmcapital.com/us/base/hq/queryMarketDataList";
const NASDAQ = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const SCREENER = "https://www.otcmarkets.com/research/stock-screener";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const OUTPUT = new URL("sahm-parsed.json", import.meta.url);
const SCREENER_CACHE = new URL("otc-screener-cache.json", import.meta.url);

const LIMIT = 5000;
const PAGE_SIZE = 100;
const PAGE_GAP = 1500;
const SCREENER_DAYS = 3;

// Each list's least plausible size, well under what it held on 23 October
// 2026 (400, 14, 20, 297, 141, 13,473, 2,982, 29,711).
const LISTS = {
  saudiStocks: { url: SAUDI, type: 5, floor: 300 },
  saudiEtfs: { url: SAUDI, type: 8, floor: 8 },
  saudiReits: { url: SAUDI, type: 7, floor: 12 },
  saudiMain: { url: SAUDI, type: 40, floor: 200 },
  saudiNomu: { url: SAUDI, type: 41, floor: 80 },
  usStocks: { url: US, type: 1, floor: 9000 },
  usEtfs: { url: US, type: 55, floor: 2000 },
  usOtc: { url: US, type: 2, floor: 20000 },
};
// 60004 is a closed-end fund on the Main Market board (Alkhabeer Income).
const DATA_TYPE = {
  5: "60000",
  8: "60002",
  7: "60003",
  40: ["60000", "60002", "60003", "60004"],
  41: ["60000", "60003"],
  1: ["20000", "20002"],
  55: "20002",
  2: "20009",
};

const US_EXCHANGE = {
  Q: { exchange: "Nasdaq", mic: "XNAS" },
  N: { exchange: "New York Stock Exchange", mic: "XNYS" },
  A: { exchange: "NYSE American", mic: "XASE" },
  P: { exchange: "NYSE Arca", mic: "ARCX" },
  Z: { exchange: "Cboe BZX", mic: "BATS" },
  F: { exchange: "Texas Stock Exchange", mic: "TXSE" },
  M: { exchange: "NYSE Texas", mic: "XCHI" },
};

// OTC Markets screener markets: 1 OTCQX, 10 OTCQB, 20 OTCID, 21 Pink
// Limited, 30 Grey, 40 Expert Market. Market 1 files its lines as 2
// (OTCQX U.S.) or 6 (OTCQX International).
const OTC_MARKETS = ["1", "10", "20", "21", "30", "40"];
const OTC_TIER = { 1: "OTCQX", 2: "OTCQX", 6: "OTCQX", 10: "OTCQB", 20: "OTCID", 21: "Pink Limited", 30: "Grey", 40: "Expert Market" };
const OTC_TYPE = {
  "Common Stock": "STOCK",
  "Foreign Ordinary Shares": "STOCK",
  ADRs: "STOCK",
  "New York Registry Shs": "STOCK",
  "Preferred Stock": "STOCK",
  Fund: "STOCK",
  Units: "STOCK",
  "Other Security Type": "STOCK",
  ETFs: "ETF",
  "Structured Product": "ETF",
};
const OTC_DROP = new Set(["Warrants", "Rights", "Corporate Bond", "Bonds", "Debt", "Convertible Bond"]);
const OTC_ETF_SHARE = /\b(ADRS?|S\/ADR|SP\/ADR|U\/ADR|NY REG|NEW YORK REGISTRY|REGISTRY|FIBR|FIBRA|REIT)\b/i;
const OTC_DEBT = /\b\d+(\.\d+)?%?\s+(SR|SUB|NTS?|NOTES?|DEB)\b/i;

const NOMU_REMARK = "Nomu is for qualified investors only.";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

async function sahmPage(url, type, offset) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
          "x-hq-rest-api": "true",
          Referer: "https://www.sahmcapital.com/",
        },
        body: new URLSearchParams({ type: String(type), limit: String(LIMIT), offset: String(offset) }),
        signal: AbortSignal.timeout(90_000),
      });
      const payload = await response.json();
      if (payload.code !== "10000000" || !Array.isArray(payload.data?.list)) throw new Error(`code ${payload.code}`);
      const total = Number(payload.data.totalCount);
      if (!Number.isInteger(total) || total < 1) throw new Error(`total ${payload.data.totalCount}`);
      return { total, list: payload.data.list };
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`Sahm list ${type} offset ${offset}: ${last}`);
}

// The list is ranked by a live figure, so a line can move between pages
// while they are read. A walk that does not return every code once is
// read again.
async function sahmList(name) {
  const { url, type, floor } = LISTS[name];
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const first = await sahmPage(url, type, 0);
    const rows = [...first.list];
    for (let offset = LIMIT; offset < first.total; offset += LIMIT) rows.push(...(await sahmPage(url, type, offset)).list);
    const byCode = new Map();
    for (const row of rows) {
      const code = normalize(row.securityCode).toUpperCase();
      if (!code) throw new Error(`Sahm list ${type} has a line with no code`);
      const expected = [DATA_TYPE[type]].flat();
      if (!expected.includes(String(row.dataType))) throw new Error(`Sahm list ${type}: ${code} has data type ${row.dataType}`);
      byCode.set(code, row);
    }
    if (byCode.size === first.total) {
      if (first.total < floor) throw new Error(`Sahm list ${type} has only ${first.total} lines`);
      return [...byCode.values()];
    }
    last = `announced ${first.total}, read ${byCode.size} codes`;
    await sleep(5000);
  }
  throw new Error(`Sahm list ${type}: ${last}`);
}

// Nasdaq-integrated symbol -> place. otherlisted.txt's last column is that
// symbol (BRK.B, AHT-D, AAC= for a unit, AAC+ a warrant, AIIA^ a right).
function usBook(nasdaqText, otherText) {
  const book = new Map();
  const add = (symbol, value) => {
    const code = normalize(symbol).toUpperCase();
    if (code && !book.has(code)) book.set(code, value);
  };
  const nasdaqLines = nasdaqText.split(/\r?\n/);
  if (!nasdaqLines[0].startsWith("Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF")) {
    throw new Error(`nasdaqlisted.txt header is ${nasdaqLines[0]}`);
  }
  for (const line of nasdaqLines.slice(1)) {
    const cells = line.split("|");
    if (cells.length < 7 || line.startsWith("File Creation")) continue;
    if (cells[3] === "Y") continue;
    add(cells[0], { ...US_EXCHANGE.Q, name: cells[1], etf: cells[6] === "Y", symbol: cells[0] });
  }
  const otherLines = otherText.split(/\r?\n/);
  if (!otherLines[0].startsWith("ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol")) {
    throw new Error(`otherlisted.txt header is ${otherLines[0]}`);
  }
  for (const line of otherLines.slice(1)) {
    const cells = line.split("|");
    if (cells.length < 8 || line.startsWith("File Creation")) continue;
    if (cells[6] === "Y") continue;
    const place = US_EXCHANGE[cells[2]];
    if (!place) {
      // IEX lists only its test symbols; any other code is a new place.
      if (cells[2] === "V") continue;
      throw new Error(`otherlisted.txt exchange code ${cells[2]} (${cells[0]})`);
    }
    const value = { ...place, name: cells[1], etf: cells[4] === "Y", symbol: cells[7] };
    add(cells[7], value);
    if (cells[7].endsWith("=")) add(`${cells[7].slice(0, -1)}.UN`, value);
  }
  if (book.size < 10000) throw new Error(`the symbol directory has ${book.size} codes`);
  return book;
}

// A warrant or a right (a contingent value right too). otherlisted.txt
// marks it in the symbol (AAC+, AIIA^). nasdaqlisted.txt names the line's
// kind after " - " ("Gen Digital Inc. - Contingent Value Rights"); the
// rest of a name can say "right" of a share (AMX: "the right to receive
// twenty Series B Shares").
function usWarrantOrRight(place) {
  if (/[+^]$/.test(place.symbol)) return true;
  if (place.exchange !== "Nasdaq") return false;
  const kind = place.name.split(" - ").slice(1).join(" - ");
  if (/\bUnits?\b/i.test(kind)) return false;
  return /\b(Warrants?|Rights?)\b/i.test(kind);
}

// Sahm's ETF list also holds closed-end funds, baby bonds and a few
// shares (AFB, CMSC, DOO). The directory's ETF flag decides; a line of
// Sahm's ETF list it does not flag is still one when the directory names
// an exchange-traded note or a trust (VXX, DGP, BAR gold trust).
function usType(place, line) {
  if (place.etf) return "ETF";
  if (String(line.dataType) === "20002" && /\bETNs?\b|Exchange Traded Notes?|\bTrust\b/i.test(place.name)) return "ETF";
  return "STOCK";
}

function readJson(url) {
  try {
    return fs.existsSync(url) ? JSON.parse(fs.readFileSync(url, "utf8")) : {};
  } catch {
    return {};
  }
}

function writeJson(url, value) {
  const temporary = new URL(`${url.pathname.split("/").pop()}.tmp`, url);
  fs.writeFileSync(temporary, JSON.stringify(value));
  fs.renameSync(temporary, url);
}

async function withScreenerPage(task) {
  const require = createRequire(import.meta.url);
  let module;
  try {
    module = await import(require.resolve("puppeteer-core"));
  } catch {
    module = await import("puppeteer-core");
  }
  const puppeteer = module.default || module;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(SCREENER, { waitUntil: "domcontentloaded", timeout: 90_000 });
    return await task(async (path) => {
      const [status, text] = await page.evaluate(async (target) => {
        const response = await fetch(target);
        return [response.status, await response.text()];
      }, path);
      if (status !== 200) throw new Error(`${path} answered ${status}`);
      let body = JSON.parse(text);
      if (typeof body === "string") body = JSON.parse(body);
      return body;
    });
  } finally {
    await browser.close();
  }
}

// Every line of the screener's markets, page by page, each page saved as it
// arrives so a cut walk resumes.
async function otcScreener() {
  const cache = readJson(SCREENER_CACHE);
  const fresh = (entry) => entry?.done && Date.now() - Date.parse(entry.at) < SCREENER_DAYS * 86400_000;
  const resumable = (entry) => entry && !entry.done && Date.now() - Date.parse(entry.at) < 86400_000;
  let last = "";
  for (let attempt = 0; attempt < 3 && OTC_MARKETS.some((market) => !fresh(cache[market])); attempt += 1) {
    try {
      await withScreenerPage(async (get) => {
        for (const market of OTC_MARKETS) {
          if (fresh(cache[market])) continue;
          const entry = resumable(cache[market]) ? cache[market] : { at: new Date().toISOString(), done: false, count: null, pages: {} };
          cache[market] = entry;
          for (let number = 0; number < 500; number += 1) {
            if (entry.pages[number]) {
              if (entry.pages[number].length < PAGE_SIZE) break;
              continue;
            }
            const body = await get(`/research/stock-screener/api?market=${market}&sortField=symbol&sortOrder=asc&page=${number}&pageSize=${PAGE_SIZE}`);
            if (!Array.isArray(body.stocks)) throw new Error(`OTC Markets market ${market} page ${number} has no stocks`);
            entry.count ??= body.count;
            const stocks = body.stocks.map((stock) => ({
              symbol: stock.symbol,
              name: stock.securityName,
              marketId: stock.marketId,
              type: stock.securityType,
              caveatEmptor: Boolean(stock.caveatEmptor),
            }));
            for (const stock of stocks) {
              if (OTC_TIER[stock.marketId] !== OTC_TIER[market]) {
                throw new Error(`OTC Markets market ${market} page ${number} holds ${stock.symbol} of market ${stock.marketId}`);
              }
            }
            entry.pages[number] = stocks;
            writeJson(SCREENER_CACHE, cache);
            if (stocks.length < PAGE_SIZE) break;
            await sleep(PAGE_GAP);
          }
          const symbols = new Set(Object.values(entry.pages).flat().map((stock) => stock.symbol));
          // The count runs a few symbols ahead of the pages while the list
          // moves: up to 0.5% short is accepted.
          if (!entry.count || symbols.size > entry.count || symbols.size < entry.count * 0.995) {
            delete cache[market];
            writeJson(SCREENER_CACHE, cache);
            throw new Error(`OTC Markets market ${market}: announced ${entry.count}, read ${symbols.size}`);
          }
          entry.done = true;
          entry.at = new Date().toISOString();
          writeJson(SCREENER_CACHE, cache);
          console.error(`OTC Markets market ${market}: ${symbols.size} lines`);
          await sleep(PAGE_GAP);
        }
      });
      last = "";
    } catch (error) {
      last = String(error.message || error);
      console.error(`OTC Markets screener: ${last}`);
      await sleep(10_000 * (attempt + 1));
    }
  }
  if (last || OTC_MARKETS.some((market) => !fresh(cache[market]))) throw new Error(`the OTC Markets screener could not be read: ${last}`);
  const out = new Map();
  for (const market of OTC_MARKETS) {
    for (const stock of Object.values(cache[market].pages).flat()) out.set(normalize(stock.symbol).toUpperCase(), stock);
  }
  if (out.size < 12000) throw new Error(`the OTC Markets screener has ${out.size} lines`);
  return out;
}

function otcType(stock, name) {
  if (OTC_DROP.has(stock.type)) return { drop: stock.type };
  const type = OTC_TYPE[stock.type];
  if (!type) throw new Error(`OTC Markets security type ${JSON.stringify(stock.type)} (${stock.symbol}) is new`);
  if (stock.type !== "Preferred Stock" && OTC_DEBT.test(name)) return { drop: "debt by name" };
  if (type === "ETF" && OTC_ETF_SHARE.test(name)) return { type: "STOCK" };
  return { type };
}

function rowOf({ ticker, name, exchange, mic, currency, type, raw, remark = "" }) {
  const code = normalize(ticker).toUpperCase();
  if (!code || !exchange || !currency || !type) throw new Error(`incomplete row ${code} ${exchange} ${currency} ${type}`);
  const row = {
    query: code,
    ticker: code,
    name: normalize(name) || code,
    exchange,
    mic,
    currency,
    type,
    raw,
  };
  if (remark) row.remark = remark;
  return row;
}

const lists = {};
for (const name of Object.keys(LISTS)) lists[name] = await sahmList(name);
const [nasdaqText, otherText] = await Promise.all([getText(NASDAQ), getText(OTHER)]);
const america = usBook(nasdaqText, otherText);
const screener = await otcScreener();

const rows = [];
const left = { status: 0, usUnlisted: 0, usWarrant: 0, usWhenIssued: 0, usDebt: 0, otcUnscreened: 0, otcListed: 0, otcType: new Map() };

// Saudi. Every code of the stock, ETF and REIT lists must be on one board.
const mainBoard = new Set(lists.saudiMain.map((line) => normalize(line.securityCode).toUpperCase()));
const nomuBoard = new Set(lists.saudiNomu.map((line) => normalize(line.securityCode).toUpperCase()));
for (const [name, type] of [["saudiStocks", "STOCK"], ["saudiEtfs", "ETF"], ["saudiReits", "STOCK"]]) {
  for (const line of lists[name]) {
    const full = normalize(line.securityCode).toUpperCase();
    const match = full.match(/^(\d{4})\.SA$/);
    if (!match) throw new Error(`Saudi code ${line.securityCode}`);
    const nomu = nomuBoard.has(full);
    if (nomu === mainBoard.has(full)) throw new Error(`Saudi code ${full} is on ${nomu ? "both boards" : "no board"}`);
    if (String(line.status) !== "0") {
      left.status += 1;
      continue;
    }
    const exchange = nomu ? "Nomu" : "Tadawul";
    rows.push(rowOf({
      ticker: match[1],
      name: line.name,
      exchange,
      mic: "XSAU",
      currency: "SAR",
      type,
      raw: [full, line.name, exchange, "SAR", `list ${LISTS[name].type}`].join(" | "),
      remark: nomu ? NOMU_REMARK : "",
    }));
  }
}

// US exchanges.
const listedCodes = new Set();
for (const name of ["usStocks", "usEtfs"]) {
  for (const line of lists[name]) {
    const code = normalize(line.securityCode).toUpperCase();
    if (String(line.status) !== "0") {
      left.status += 1;
      continue;
    }
    if (listedCodes.has(code)) continue;
    const place = america.get(code);
    if (!place) {
      left.usUnlisted += 1;
      continue;
    }
    if (usWarrantOrRight(place)) {
      left.usWarrant += 1;
      continue;
    }
    // A when-issued line (MSGK#) is a share not yet issued.
    if (place.symbol.endsWith("#")) {
      left.usWhenIssued += 1;
      continue;
    }
    if (isObligation(place.name, "STOCK")) {
      left.usDebt += 1;
      continue;
    }
    const type = usType(place, line);
    listedCodes.add(code);
    rows.push(rowOf({
      ticker: code,
      name: line.name,
      exchange: place.exchange,
      mic: place.mic,
      currency: "USD",
      type,
      raw: [code, line.name, place.exchange, "USD", `list ${LISTS[name].type}`].join(" | "),
    }));
  }
}

// OTC.
for (const line of lists.usOtc) {
  const code = normalize(line.securityCode).toUpperCase();
  if (String(line.status) !== "0") {
    left.status += 1;
    continue;
  }
  if (listedCodes.has(code)) {
    left.otcListed += 1;
    continue;
  }
  const stock = screener.get(code);
  if (!stock) {
    left.otcUnscreened += 1;
    continue;
  }
  const name = normalize(line.name) || normalize(stock.name);
  const kind = otcType(stock, `${name} ${normalize(stock.name)}`);
  if (kind.drop) {
    left.otcType.set(kind.drop, (left.otcType.get(kind.drop) || 0) + 1);
    continue;
  }
  const tier = OTC_TIER[stock.marketId];
  rows.push(rowOf({
    ticker: code,
    name,
    exchange: "OTC Markets",
    mic: "OTCM",
    currency: "USD",
    type: kind.type,
    raw: [code, name, "OTC Markets", tier, stock.type, stock.caveatEmptor ? "Caveat Emptor" : "", "USD"].filter(Boolean).join(" | "),
  }));
}

rows.sort((a, b) => a.type.localeCompare(b.type) || a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));

const has = (ticker, exchange) => written.some((row) => row.ticker === ticker && row.exchange === exchange);
const known = [
  ["2222", "Tadawul"],
  ["1120", "Tadawul"],
  ["4340", "Tadawul"],
  ["9405", "Tadawul"],
  ["AAPL", "Nasdaq"],
  ["KO", "New York Stock Exchange"],
  ["BRK.B", "New York Stock Exchange"],
  ["SPY", "NYSE Arca"],
  ["QQQ", "Nasdaq"],
];
for (const [ticker, exchange] of known) if (!has(ticker, exchange)) throw new Error(`${ticker} on ${exchange} is missing`);
if (written.filter((row) => row.exchange === "Nomu").length < 80) throw new Error("too few Nomu rows");
if (written.filter((row) => row.exchange === "OTC Markets").length < 8000) throw new Error("too few OTC rows");
if (left.usUnlisted < 1000) throw new Error(`only ${left.usUnlisted} US codes were not in the symbol directory`);

fs.writeFileSync(OUTPUT, JSON.stringify(written, null, 2));

const byBook = new Map();
for (const row of written) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const otcDropped = [...left.otcType].map(([type, count]) => `${count} ${type}`).join(", ");
console.error(
  `${written.length} listings (${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")}). ` +
    `Left out: ${left.status} not trading, ${left.usUnlisted} US codes not in the symbol directory, ${left.usWarrant} US warrants or rights, ` +
    `${left.usWhenIssued} US when-issued lines, ${left.usDebt} US debt lines by the directory name, ` +
    `${left.otcUnscreened} OTC codes not on the OTC Markets screener, ${left.otcListed} OTC codes listed on an exchange, OTC ${otcDropped || "none"}, ` +
    `${rows.length - written.length} debt lines.`,
);
