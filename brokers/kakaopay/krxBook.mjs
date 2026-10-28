// The Korea Exchange book of the day, for the Korean brokers that sell every
// KRX-listed share and ETF and publish no list (Kakao Pay Securities, Woori
// Investment Securities).
//
// Sources:
//   - KIND, KRX's disclosure system: the list of listed companies, one line
//     per company with its market (유가 = KOSPI, 코스닥 = KOSDAQ, 코넥스 =
//     KONEX) and its common-share code. It is the exchange's own list; it has
//     no preferred share, ETF or ETN line and no trading status.
//     https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13
//   - Naver's market lists (the KRX feed): every KOSPI and KOSDAQ share line
//     (common and preferred), every ETF and ETN, each with its trading status.
//     https://m.stock.naver.com/api/stocks/marketValue/KOSPI  (and KOSDAQ)
//     https://m.stock.naver.com/api/stocks/etf
//     https://m.stock.naver.com/api/stocks/etn
//   data.krx.co.kr, KRX's data portal, now answers "LOGOUT" without an
//   account, so it is not read.
//
// Kept: KOSPI and KOSDAQ shares (common and preferred, REITs, infrastructure
// funds, SPACs and the KDRs of foreign companies: share lines on the stock
// market), type STOCK; ETFs (all on the KOSPI market), type ETF; ETNs, type
// ETN. Left out: a line Naver marks HALTED (거래정지: suspended, the
// administrative-issue and delisting-review cases among them). Every KIND
// KOSPI/KOSDAQ company must be in Naver's lists, or the run fails (a few
// halted or same-day listings are tolerated). KONEX is added only on
// request (konex: true), from KIND alone, with no status.
//
// Rows: exchange "KOSPI" mic XKRX, "KOSDAQ" mic XKOS (ETFs and ETNs are on
// KOSPI), "KONEX" mic XKON; currency KRW. NXT (Nextrade) trades a subset of
// these same lines as a second venue routed together with KRX; it is not a
// separate place here.
//
// ISIN: none of these lists prints one. It is joined from
// ../toss/toss-parsed.json (Toss's own product pages, KRW lines) and the
// KRX lines of ../../assets/stocks.csv / etfs.csv. A domestic company's
// common share or an ETF the two do not hold gets the standard code KRX
// assigns, KR7 + short code + 00 + check digit (it matches the joined ISIN
// for every domestic common share and ETF); a foreign issuer (code 9xxxxx)
// or a preferred line keeps an empty ISIN.
//
// Use:
//   import { krxBook } from "../kakaopay/krxBook.mjs";
//   const { rows, dropped, halted, missing } = await krxBook({ konex: false });
//
//   node brokers/kakaopay/krxBook.mjs    prints the counts

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const KIND = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13";
const NAVER = "https://m.stock.naver.com";
const TOSS = new URL("../toss/toss-parsed.json", import.meta.url);
const ASSETS = [new URL("../../assets/stocks.csv", import.meta.url), new URL("../../assets/etfs.csv", import.meta.url)];

const PLACE = {
  KOSPI: { exchange: "KOSPI", mic: "XKRX" },
  KOSDAQ: { exchange: "KOSDAQ", mic: "XKOS" },
  KONEX: { exchange: "KONEX", mic: "XKON" },
};
const KIND_MARKET = { 유가: "KOSPI", 코스닥: "KOSDAQ", 코넥스: "KONEX" };
const TYPE = { stock: "STOCK", etf: "ETF", etn: "ETN" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getBytes(url, headers = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1200 * (attempt + 1));
  }
  throw new Error(last);
}

const clean = (value) => String(value ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// code -> { name, market } from KIND's listed-company file (an HTML table in EUC-KR).
async function kindCompanies() {
  const html = new TextDecoder("euc-kr").decode(await getBytes(KIND));
  const lines = new Map();
  let header = null;
  for (const tr of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => clean(cell[1]));
    if (!header) {
      header = cells;
      if (header[0] !== "회사명" || header[1] !== "시장구분" || header[2] !== "종목코드") throw new Error(`KIND header is ${header.join(", ")}`);
      continue;
    }
    const market = KIND_MARKET[cells[1]];
    if (!market) throw new Error(`KIND market ${cells[1]} for ${cells[2]}`);
    lines.set(cells[2].toUpperCase(), { name: cells[0], market });
  }
  if (lines.size < 2500) throw new Error(`KIND listed only ${lines.size} companies`);
  return lines;
}

async function naverList(path) {
  const rows = [];
  for (let page = 1; page < 100; page += 1) {
    const body = JSON.parse((await getBytes(`${NAVER}${path}?page=${page}&pageSize=100`, { Referer: `${NAVER}/` })).toString("utf8"));
    const stocks = body.stocks || [];
    rows.push(...stocks);
    if (!stocks.length || rows.length >= Number(body.totalCount || 0)) break;
    await sleep(150);
  }
  return rows;
}

function knownIsins() {
  const map = new Map();
  for (const file of ASSETS) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const [ticker, exchange, isin] = line.split(",");
      if (["KRX", "KOSPI", "KOSDAQ", "KONEX"].includes(exchange) && /^KR[A-Z0-9]{9}\d$/.test(isin || "")) map.set(ticker.split(":").pop(), isin);
    }
  }
  if (fs.existsSync(TOSS)) {
    for (const row of JSON.parse(fs.readFileSync(TOSS, "utf8"))) {
      if (row.currency === "KRW" && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(row.isin || "")) map.set(String(row.ticker), row.isin);
    }
  }
  return map;
}

function isinCheck(body) {
  const digits = [...body].map((char) => (/\d/.test(char) ? char : String(char.charCodeAt(0) - 55))).join("");
  let sum = 0;
  [...digits].reverse().forEach((char, index) => {
    let digit = Number(char);
    if (index % 2 === 0) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  });
  return String((10 - (sum % 10)) % 10);
}

const standardIsin = (code) => `KR7${code}00${isinCheck(`KR7${code}00`)}`;

export async function krxBook({ konex = false } = {}) {
  const kind = await kindCompanies();
  const lists = {};
  for (const [key, path] of [
    ["KOSPI", "/api/stocks/marketValue/KOSPI"],
    ["KOSDAQ", "/api/stocks/marketValue/KOSDAQ"],
    ["ETF", "/api/stocks/etf"],
    ["ETN", "/api/stocks/etn"],
  ]) {
    lists[key] = await naverList(path);
    await sleep(300);
  }
  const isins = knownIsins();
  const rows = [];
  const seen = new Set();
  const halted = [];
  const dropped = {};
  const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);

  for (const line of Object.values(lists).flat()) {
    const code = String(line.itemCode || "").toUpperCase();
    const type = TYPE[line.stockEndType];
    const market = String(line.stockExchangeType?.nameEng || "").toUpperCase();
    if (!/^[0-9A-Z]{6}$/.test(code)) throw new Error(`unreadable KRX code ${code} (${line.stockName})`);
    if (seen.has(code)) continue;
    seen.add(code);
    if (!type || !PLACE[market] || market === "KONEX") throw new Error(`${code} ${line.stockName} is ${line.stockEndType} on ${market}`);
    if (line.tradeStopType?.name !== "TRADING") {
      halted.push(`${code} ${line.stockName} (${line.tradeStopType?.text || line.tradableStatus})`);
      drop(`${type} halted`);
      continue;
    }
    const company = kind.get(code);
    const isin =
      isins.get(code) || ((type === "ETF" || (company && !code.startsWith("9"))) && /^\d{6}$/.test(code) ? standardIsin(code) : "");
    rows.push({
      query: isin || code,
      ticker: code,
      name: clean(line.stockName),
      exchange: PLACE[market].exchange,
      mic: PLACE[market].mic,
      currency: "KRW",
      type,
      isin,
      raw: [code, clean(line.stockName), market, line.stockEndType, company ? "KIND" : ""].filter(Boolean).join(" | "),
    });
  }

  const missing = [...kind].filter(([code, company]) => company.market !== "KONEX" && !seen.has(code)).map(([code, company]) => `${code} ${company.name}`);
  if (missing.length > 15) throw new Error(`${missing.length} KIND companies are not in the market lists: ${missing.slice(0, 10).join(", ")}`);

  if (konex) {
    for (const [code, company] of kind) {
      if (company.market !== "KONEX") continue;
      const isin = isins.get(code) || (/^\d{6}$/.test(code) ? standardIsin(code) : "");
      rows.push({
        query: isin || code,
        ticker: code,
        name: company.name,
        exchange: PLACE.KONEX.exchange,
        mic: PLACE.KONEX.mic,
        currency: "KRW",
        type: "STOCK",
        isin,
        raw: [code, company.name, "KONEX", "KIND"].join(" | "),
      });
    }
  }

  const count = (exchange, type) => rows.filter((row) => row.exchange === exchange && row.type === type).length;
  if (count("KOSPI", "STOCK") < 800 || count("KOSDAQ", "STOCK") < 1500 || count("KOSPI", "ETF") < 800 || count("KOSPI", "ETN") < 200) {
    throw new Error(`short KRX book: ${count("KOSPI", "STOCK")} KOSPI, ${count("KOSDAQ", "STOCK")} KOSDAQ, ${count("KOSPI", "ETF")} ETF, ${count("KOSPI", "ETN")} ETN`);
  }
  for (const code of ["005930", "005935", "069500"]) if (!rows.some((row) => row.ticker === code)) throw new Error(`${code} is missing from the KRX book`);
  rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
  return { rows, dropped, halted, missing };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const book = await krxBook({ konex: true });
  const counts = {};
  for (const row of book.rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
  console.log(`${book.rows.length} rows`, counts, `ISIN ${book.rows.filter((row) => row.isin).length}`);
  console.log("left out", book.dropped, `KIND companies not in the lists: ${book.missing.join(", ") || "none"}`);
}
