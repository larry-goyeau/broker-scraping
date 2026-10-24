// What Webull Securities (Thailand) Co., Ltd. (webull.co.th, SEC Thailand
// licence) sells as shares and funds. Checked on webull.co.th on 2026-10-23.
// Four markets:
//
// - Thailand (SET and mai):
//     "Webull Thailand offers trading services in Common Stocks, Derivative
//     Warrants, Depositary Receipts (including those available for night
//     trading), and Exchange-Traded Funds (ETFs)."
//     https://www.webull.co.th/en/help/faq/576
//     "Invest in leading Thai companies listed on SET, SET50, SET100, and mai."
//     https://www.webull.co.th/en/thai-stocks
//   The titles are Webull's own Thai instrument master, read from its public
//   quote host (quotes-gw.webullfintech.com, region 172) by walking the Thai
//   ticker-id block through the batch quote call, as webullsg does for SGX.
//   Kept: live (listStatus 1) common shares, DRs (isDr) and ETFs. A common
//   share is kept only when SET's own listed-companies file still names it;
//   that file also says SET or mai (both are the one XBKK book, so the row is
//   exchange SET and the board goes in raw).
//     https://www.set.or.th/dat/eod/listedcompany/static/listedCompanies_en_US.xls
//   Left out, as the FAQ does not name them: preferred shares, REITs,
//   property and infrastructure funds, and warrants (derivative warrants are
//   not a catalogue type). ISIN: the asset lists' SET line for the symbol
//   (stampRows fills it); a DR whose ISIN the lists file as an ETF is ETF.
//
// - US: the frozen Webull rows (../webull/webull-base.json) on NYSE, Nasdaq,
//   NYSE American / Arca (AMEX) and Cboe BZX; one NBBO book.
//     "Clients can place orders for whole shares, fractional shares, ETFs,
//     and Options listed on U.S. exchanges"
//     https://www.webull.co.th/en/help/faq/343
//   "Trade US Stocks in NYSE, NASDAQ, AMEX, CBOT, CME and more!"
//   (https://www.webull.co.th/en/us-stocks). OTC is no exchange and no page
//   offers it (the fee schedule only carries the CAT fee line for it), so the
//   base OTC rows go, with crypto. PTPs stay: FAQ 485 explains the 10%
//   withholding on their sale.
//
// - Leveraged and inverse funds, US and HK:
//     "At present, companies are permitted to provide trading services for
//     Leveraged ETFs and Inverse ETFs that reference an index or any sector
//     only" (Thai SEC, TorNor. 87/2558 as amended by TorNor. 9/2568)
//     https://www.webull.co.th/en/help/faq/469
//   So a leveraged or inverse fund on one company (TSLL, NVDU, CSOP Tesla
//   Daily (2x)...) goes. The underlying is read from the fund's name: a
//   ticker or a company's first name word in the base's US shares, or one
//   of a few non-US companies (SK Hynix, Samsung Electronics, SpaceX...).
//   Commodity, crypto and index products are not touched.
//
// - Hong Kong and China:
//     "Currently, clients can trade stocks and ETFs listed on the Hong Kong
//     Exchange (HKEX), as well as China A-shares, through Webull Thailand."
//     https://www.webull.co.th/en/help/faq/600
//     "ChiNEXT and STAR symbols are currently not available for trading on
//     Webull."  https://www.webull.co.th/en/help/faq/626
//   → the base HKEX stock and ETF lines Webull lists itself (HKD counters
//   and RMB counters, no USD copies), and the base Shanghai / Shenzhen
//   shares and ETFs (Northbound, CNH), without 688/689 and 300/301. The
//   FAQ names only "China A-shares"; the ETFs Webull lists on those two
//   exchanges are kept as in webullsg (owner's choice, 2026-10-24).
//
// Deposits: "you can only deposit money with THB and then convert to
// USD/HKD/CN¥" (https://www.webull.co.th/en/help/faq/360). No market
// quotes these titles in baht except SET, so each row keeps its own
// counter's currency, one row per title and counter.
//
// Fees: https://www.webull.co.th/en/pricing (US 0.10%, Thai 0.04%, HK and
// A-shares 0.10% of the trade amount).
//
//   node brokers/webullth/webullth_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";

const BASE = new URL("../webull/webull-base.json", import.meta.url);
const OUTPUT = new URL("webullth-parsed.json", import.meta.url);
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const QUOTES = "https://quotes-gw.webullfintech.com";
const SET_FILE = "https://www.set.or.th/dat/eod/listedcompany/static/listedCompanies_en_US.xls";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const HEADERS = { app: "th", hl: "en", platform: "web", os: "web", ver: "1.0.0", "User-Agent": UA };

const US_PLACES = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);
const THAI_REGION = 172;
const THAI_BLOCK = 492000000;

const EVIDENCE = [
  { id: 576, test: /Common Stocks,\s*Derivative Warrants,\s*Depositary Receipts.*Exchange-Traded Funds/s },
  { id: 600, test: /stocks and ETFs listed on the Hong Kong Exchange \(HKEX\), as well as China A-shares/ },
  { id: 626, test: /ChiNEXT and STAR symbols are currently not available/ },
  { id: 469, test: /reference an index or any sector only/ },
  { id: 343, test: /listed on U\.S\. exchanges/ },
  { id: 360, test: /only deposit money with THB/ },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function request(url, options = {}, as = "text") {
  let last;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, ...(options.headers || {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return as === "json" ? await response.json() : await response.text();
    } catch (error) {
      last = error;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(`${url}: ${last}`);
}

// ---- the broker's own sentences ---------------------------------------------

for (const { id, test } of EVIDENCE) {
  const page = await request(`https://www.webull.co.th/en/help/faq/${id}`);
  if (!test.test(page.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " "))) {
    throw new Error(`webull.co.th FAQ ${id} no longer says what the catalogue rests on`);
  }
  await sleep(1500);
}

// ---- Thailand ----------------------------------------------------------------

// The Thai ids sit in one block from 492000000. Walk it a hundred at a time
// until twenty batches in a row come back empty.
async function thaiBlock() {
  const found = new Map();
  let empty = 0;
  for (let start = THAI_BLOCK; start < THAI_BLOCK + 200_000 && empty < 20; start += 100) {
    const ids = Array.from({ length: 100 }, (_, index) => start + index).join(",");
    const answer = await request(`${QUOTES}/api/bgw/quote/realtime?ids=${ids}&includeSecu=1&delay=0&more=1`, { headers: HEADERS }, "json");
    const list = Array.isArray(answer) ? answer : [];
    for (const ticker of list) if (ticker.regionId === THAI_REGION) found.set(ticker.tickerId, ticker);
    empty = list.length ? 0 : empty + 1;
  }
  return found;
}

async function setBoards() {
  const text = await request(SET_FILE);
  const boards = new Map();
  for (const row of text.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) =>
      clean(cell[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")));
    if (cells.length > 3 && /^(SET|mai)$/.test(cells[2])) boards.set(cells[0].toUpperCase(), cells[2]);
  }
  if (boards.size < 700) throw new Error(`SET listed-companies file gave ${boards.size} lines`);
  return boards;
}

function setKinds() {
  const kinds = new Map();
  for (const [file, kind] of [[STOCKS, "STOCK"], [ETFS, "ETF"]]) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const [ticker, place] = line.split(",");
      if (place !== "SET" || !ticker) continue;
      const code = ticker.split(":").pop().toUpperCase();
      if (!kinds.has(code)) kinds.set(code, kind);
    }
  }
  return kinds;
}

const dropped = new Map();
const drop = (reason) => dropped.set(reason, (dropped.get(reason) || 0) + 1);

function thaiRows(block, boards, kinds) {
  const rows = [];
  for (const ticker of block.values()) {
    if (ticker.template === "index") continue;
    if (ticker.listStatus !== 1) { drop("SET not live on Webull (listStatus)"); continue; }
    const secType = ticker.secType || [];
    const symbol = clean(ticker.symbol).toUpperCase();
    const name = clean(ticker.name) || symbol;
    let type;
    let label;
    if (ticker.template === "etf") { type = "ETF"; label = "ETF"; }
    else if (secType.length === 1 && secType[0] === 61 && ticker.isDr === 1) {
      type = kinds.get(symbol) === "ETF" || /\bETF\b/i.test(name) ? "ETF" : "STOCK";
      label = "DR";
    } else if (secType.length === 1 && secType[0] === 61) {
      if (!boards.has(symbol)) { drop("SET share not on SET's listed-companies file"); continue; }
      type = "STOCK";
      label = boards.get(symbol);
    } else {
      drop(secType.includes(66) ? "SET warrant" : secType.includes(64) ? "SET preferred share" : secType.includes(63) ? "SET REIT / property or infrastructure fund" : `SET secType ${secType}`);
      continue;
    }
    rows.push({
      query: symbol,
      ticker: symbol,
      name,
      exchange: "SET",
      mic: "XBKK",
      currency: "THB",
      type,
      raw: [symbol, name, "SET", label, "THB"].join(" "),
      isin: "",
    });
  }
  return rows;
}

// ---- leveraged and inverse funds on one company --------------------------------

const UNDERLYING = [
  /\bdaily target \d+(?:\.\d+)?x (?:long|short|inverse)\s+(.+?)\s+etf\b/i,
  /\b(?:long|short|inverse|bull|bear)\s+(.+?)\s+(?:daily|monthly)\b/i,
  /\bdirexion daily\s+(.+?)\s+(?:bull|bear)\b/i,
  /\bcorgi\s+(.+?)\s+\d+(?:\.\d+)?x\b/i,
  /\bproshares ultra(?:pro)?(?:short)?\s+(.+?)(?:\s+etf)?$/i,
  /\b(?:csop|chinaamc|bosera|mirae asset|samsung|global x|premia)\s+(.+?)\s+daily\b/i,
];
const LEVERED = /(?:^|[\s(-])-?\d+(?:\.\d+)?x\b|\bultra|\bbull\b|\bbear\b|\binverse\b|\bleveraged\b/i;
const NOT_A_COMPANY = new Set(
  ("GOLD SILVER COPPER OIL GAS CORN WHEAT EURO YEN BITCOIN ETHER SOLANA XRP SUI AVALANCHE CARDANO CHAINLINK " +
    "MEMORY INNOVATION ENERGY FINANCIAL FINANCIALS INDUSTRIALS MATERIALS UTILITIES TECHNOLOGY SEMICONDUCTOR " +
    "SEMICONDUCTORS RETAIL HEALTHCARE BIOTECH URANIUM PALLADIUM PLATINUM CHINA INDIA BRAZIL MEXICO JAPAN EUROPE " +
    "KOREA DOW30 S&P500 QQQ").split(" ")
);
const NAMED_COMPANY = /^(spacex|sk hynix|samsung electronics|tsmc|microstrategy|berkshire|berkshire hathaway)$/i;

function singleStockTest(usShares) {
  const tickers = new Set(usShares.map((row) => row.ticker.toUpperCase()));
  const firstWords = new Set(
    usShares.map((row) => row.name.split(/[\s,.]+/)[0].toUpperCase()).filter((word) => word.length >= 4)
  );
  return (name) => {
    const text = name.replace(/[®™]/g, "");
    if (!LEVERED.test(text)) return "";
    for (const pattern of UNDERLYING) {
      const hit = text.match(pattern);
      if (!hit) continue;
      const under = hit[1].replace(/\s+(?:etf|shares|index)$/i, "").trim();
      if (NAMED_COMPANY.test(under)) return under;
      if (/\s/.test(under)) return "";
      const up = under.toUpperCase();
      if (NOT_A_COMPANY.has(up)) return "";
      if (tickers.has(up) || (/^BRK[AB]$/.test(up) && tickers.has(`BRK.${up[3]}`))) return up;
      if (up.length >= 4 && firstWords.has(up)) return up;
      return "";
    }
    return "";
  };
}

// ---- build ---------------------------------------------------------------------

const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
const ownCurrency = (row) => clean(row.raw).split(" ").pop().toUpperCase();
const singleStock = singleStockTest(base.filter((row) => US_PLACES.has(row.exchange) && row.type === "STOCK"));

const [block, boards] = [await thaiBlock(), await setBoards()];
const thai = thaiRows(block, boards, setKinds());

const foreign = [];
for (const source of base) {
  const row = { ...source };
  if (row.type === "CRYPTO") { drop("crypto"); continue; }
  if (row.exchange === "OTC") { drop("US OTC"); continue; }
  if (row.currency !== ownCurrency(row)) continue;
  if (row.exchange === "Shanghai" || row.exchange === "Shenzhen") {
    if ((row.exchange === "Shanghai" && /^68[89]/.test(row.ticker)) || (row.exchange === "Shenzhen" && /^30[01]/.test(row.ticker))) {
      drop("STAR / ChiNext");
      continue;
    }
  } else if (!US_PLACES.has(row.exchange) && row.exchange !== "HKEX") {
    drop(`${row.exchange} (not offered)`);
    continue;
  }
  if (row.type !== "STOCK") {
    const one = singleStock(row.name);
    if (one) { drop(`${row.exchange} leveraged/inverse fund on one company`); continue; }
  }
  foreign.push(row);
}

const rows = [...thai, ...foreign];

const unresolved = new Set();
for (const row of rows) if (!resolveVenue(row).venue) unresolved.add(`${row.exchange}|${row.mic || ""}|${row.currency}`);
if (unresolved.size) throw new Error(`venues not resolved: ${[...unresolved].join(", ")}`);

const count = (test) => rows.filter(test).length;
const thaiShares = count((row) => row.exchange === "SET" && / (SET|mai) THB$/.test(row.raw));
const thaiDrs = count((row) => row.exchange === "SET" && / DR THB$/.test(row.raw));
if (thaiShares < 800 || thaiDrs < 200 || count((row) => US_PLACES.has(row.exchange)) < 9000 ||
    count((row) => row.exchange === "HKEX") < 2000 || count((row) => row.exchange === "Shanghai" || row.exchange === "Shenzhen") < 1500) {
  throw new Error(`catalogue looks truncated: ${thaiShares} SET/mai shares, ${thaiDrs} DRs, ${rows.length} rows`);
}

rows.sort((left, right) =>
  String(left.type).localeCompare(right.type) ||
  String(left.exchange).localeCompare(right.exchange) ||
  String(left.ticker).localeCompare(right.ticker) ||
  String(left.currency).localeCompare(right.currency)
);

const final = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2));

const tally = new Map();
for (const row of final) {
  const board = row.exchange === "SET" ? ` ${row.raw.split(" ").slice(-2, -1)[0]}` : "";
  const key = `${row.exchange}${board} ${row.type} ${row.currency}`;
  tally.set(key, (tally.get(key) || 0) + 1);
}
const noIsin = final.filter((row) => !row.isin).length;
console.error(
  `${final.length} rows -> ${OUTPUT.pathname}\n` +
    [...tally].sort().map(([key, count]) => `  ${key}: ${count}`).join("\n") +
    `\n  ${noIsin} rows without ISIN; Thai block: ${block.size} Webull lines\n` +
    `  left out: ${[...dropped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`
);
