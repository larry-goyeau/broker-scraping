// HSBC Hong Kong online stock trading sells Hong Kong shares, US shares
// and Shanghai / Shenzhen A-shares through Northbound Stock Connect. The
// public (pre-logon) Stock Trading Browser has a quote search that answers
// every listed security of a market with its ISIN, RIC and a "buy allowed"
// flag, and an ETF screener.
//
//   https://investments4.personal-banking.hsbc.com.hk/public-stb/en-gb/market/trade-track/actively-traded
//   .../api/wealth-mds-amh-pws-shp-api-hk-hbap-prod-proxy/v0/mds/hk/product/predictive-search
//   .../api/wealth-mds-amh-pws-shp-api-hk-hbap-prod-proxy/v0/mds/hk/equity/search/etf-screener
//   .../api/wealth-mds-amh-pws-shp-api-hk-hbap-prod-proxy/v0/mds/hk/equity/quotes
//
// The search returns at most 300 hits: first every symbol that contains the
// keyword (alphabetical), then name matches. A keyword is split into
// longer keywords only while its 300 hits are all symbol matches, so every
// symbol is reached.
//
// Kept: securities with allowBuy "Y". Hong Kong main board and GEM shares
// and funds (LEQU, LGEM); A-shares (FEQU) and A-share ETFs (SHEF, SZEF);
// US shares that the quote service places on NYSE, Nasdaq, NYSE Arca,
// NYSE American or Cboe. Skipped: HKEX bonds (LFIX), rights (LRTS), the
// old Nasdaq pilot lines (NASQ), A-share rights lines without an ISIN, and
// US OTC names, which get no exchange quote. ETFs and closed-end funds are
// the screener's "Exchange Traded Funds" and "Closed End Funds" lists.
//
//   node brokers/hsbchk/hsbchk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const API = "https://investments4.personal-banking.hsbc.com.hk/api/wealth-mds-amh-pws-shp-api-hk-hbap-prod-proxy/v0/mds/hk";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Content-Type": "application/json",
  Origin: "https://investments4.personal-banking.hsbc.com.hk",
  Referer: "https://investments4.personal-banking.hsbc.com.hk/public-stb/en-gb/market/trade-track/actively-traded",
  "X-HSBC-Chnl-CountryCode": "HK",
  "X-HSBC-Channel-Id": "OHI",
  "X-HSBC-Chnl-Group-Member": "HBAP",
  "X-HSBC-App-Code": "STBPWS",
  "X-HSBC-Customer-Id": "STBPWS",
  "X-HSBC-Locale": "en_US",
};
const CAP = 300;
const WORKERS = 4;
const SCREEN_PAGE = 20;
const QUOTE_BATCH = 200;

const DIGITS = "0123456789";
const SYMBOL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.";

const US_VENUE = {
  NASDAQ: ["NASDAQ", "XNAS"],
  NYSE: ["NYSE", "XNYS"],
  "NYSE Arca": ["NYSE Arca", "ARCX"],
  AMEX: ["NYSE American", "XASE"],
  CBOE: ["Cboe BZX", "BATS"],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(path, body, accept) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(API + path, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      if (response.ok) {
        const json = JSON.parse(text);
        if (accept(json)) return json;
      }
      last = `${response.status} ${path} ${text.slice(0, 160)}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(600 * 2 ** attempt);
  }
  throw new Error(last);
}

function segments(item) {
  return Object.fromEntries((item.prodAltNumSegs || []).map((seg) => [seg.prodCdeAltClassCde, seg.prodAltNum]));
}

async function search(keyword, market) {
  const body = { keyword, assetClasses: ["SEC"], market, topNum: CAP, filterCriterias: [] };
  return post("/product/predictive-search", body, Array.isArray);
}

// Breadth-first over keywords; returns every hit keyed by symbol.
async function enumerate(market, chars) {
  const found = new Map();
  let queue = [...chars];
  let calls = 0;
  while (queue.length) {
    const next = [];
    let index = 0;
    async function worker() {
      while (index < queue.length) {
        const keyword = queue[index++];
        const hits = await search(keyword, market);
        calls += 1;
        for (const item of hits) {
          const seg = segments(item);
          if (seg.M) found.set(seg.M, { ...item, seg });
        }
        const lastSymbol = String(segments(hits.at(-1) || {}).M || "").toUpperCase();
        if (hits.length >= CAP && lastSymbol.includes(keyword)) for (const char of chars) next.push(keyword + char);
        await sleep(80);
      }
    }
    await Promise.all(Array.from({ length: WORKERS }, worker));
    queue = next;
  }
  console.error(`${market}: ${found.size} securities after ${calls} searches`);
  return [...found.values()];
}

// A page that holds one malformed record answers {"result":null} every
// time. That page is read again one record at a time and only the bad
// record is lost; its fund then falls back to the name test below.
async function screenPage(market, universe, size, page) {
  const body = { recordsPerPage: String(size), pageNumber: String(page), marketCountryCode: market, assetUniverse: universe };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const json = await post("/equity/search/etf-screener", body, (j) => j && "result" in j);
    if (json.result && Array.isArray(json.result.data)) return json.result;
    await sleep(400);
  }
  return null;
}

async function screener(market, universe) {
  const codes = new Set();
  let total = Infinity;
  let lost = 0;
  for (let page = 1; (page - 1) * SCREEN_PAGE < total; page += 1) {
    let result = await screenPage(market, universe, SCREEN_PAGE, page);
    if (result) {
      total = Number(result.total);
      if (!result.data.length) throw new Error(`${market} ${universe} page ${page} is empty`);
      for (const row of result.data) codes.add(String(row.stockCode).trim());
    } else {
      if (!Number.isFinite(total)) throw new Error(`${market} ${universe} first page unreadable`);
      const first = (page - 1) * SCREEN_PAGE + 1;
      for (let position = first; position < first + SCREEN_PAGE && position <= total; position += 1) {
        result = await screenPage(market, universe, 1, position);
        if (result?.data?.length) codes.add(String(result.data[0].stockCode).trim());
        else lost += 1;
      }
    }
    await sleep(80);
  }
  if (codes.size + lost < total) throw new Error(`${market} ${universe}: ${codes.size} of ${total}`);
  console.error(`${market} ${universe}: ${codes.size} of ${total}${lost ? ` (${lost} unreadable)` : ""}`);
  return codes;
}

async function usExchanges(symbols) {
  const venue = new Map();
  for (let start = 0; start < symbols.length; start += QUOTE_BATCH) {
    const batch = symbols.slice(start, start + QUOTE_BATCH);
    const body = {
      productKeys: batch.map((symbol) => ({ productType: "SEC", prodCdeAltClassCde: "M", prodAltNum: symbol })),
      market: "US",
      delay: true,
      processingFlag: "SKIP",
      requestType: "0",
    };
    const json = await post("/equity/quotes", body, (j) => Array.isArray(j?.priceQuotes));
    for (const quote of json.priceQuotes) if (quote.symbol && quote.exchangeCode) venue.set(quote.symbol, quote.exchangeCode);
    await sleep(150);
  }
  return venue;
}

function makeRow(item, exchange, mic, type) {
  const ticker = item.seg.M;
  const name = String(item.productName || item.productShortName || "").replace(/\s+/g, " ").trim();
  const isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(item.seg.I || "") ? item.seg.I : "";
  const row = { query: ticker, ticker, name, exchange };
  if (mic) row.mic = mic;
  row.currency = item.productCcy;
  row.type = type;
  row.isin = isin;
  row.raw = [ticker, item.seg.T, name, exchange, item.productCcy, isin].filter(Boolean).join(" ");
  return row;
}

const rows = [];
const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };

// Hong Kong
{
  const etfs = await screener("HK", "Exchange Traded Funds");
  for (const item of await enumerate("HK", DIGITS)) {
    if (item.allowBuy !== "Y") { skip("HK buy not allowed"); continue; }
    if (item.productSubType !== "LEQU" && item.productSubType !== "LGEM") { skip(`HK ${item.productSubType}`); continue; }
    rows.push(makeRow(item, "HKEX", "XHKG", etfs.has(item.seg.M) ? "ETF" : "STOCK"));
  }
}

// China A through Stock Connect
for (const item of await enumerate("CN", DIGITS)) {
  if (item.allowBuy !== "Y") { skip("CN buy not allowed"); continue; }
  if (!/^\d{6}$/.test(item.seg.M) || !item.seg.I) { skip("CN line without code or ISIN"); continue; }
  const type = item.productSubType === "FEQU" ? "STOCK" : /^S[HZ]EF$/.test(item.productSubType) ? "ETF" : "";
  if (!type) { skip(`CN ${item.productSubType}`); continue; }
  const [exchange, mic] = item.exchange === "SHAS" ? ["SSE", "XSHG"] : item.exchange === "SZAS" ? ["SZSE", "XSHE"] : [];
  if (!exchange) { skip(`CN venue ${item.exchange}`); continue; }
  rows.push(makeRow(item, exchange, mic, type));
}

// United States
{
  const etfs = await screener("US", "Exchange Traded Funds");
  const funds = await screener("US", "Closed End Funds");
  const buyable = (await enumerate("US", SYMBOL_CHARS)).filter((item) => {
    if (item.allowBuy === "Y") return true;
    skip("US buy not allowed");
    return false;
  });
  const venues = await usExchanges(buyable.map((item) => item.seg.M));
  for (const item of buyable) {
    const place = US_VENUE[venues.get(item.seg.M)];
    if (!place) { skip(`US venue ${venues.get(item.seg.M) || "none (OTC or no quote)"}`); continue; }
    const type = etfs.has(item.seg.M) || /\bETF\b/i.test(item.productName) ? "ETF" : funds.has(item.seg.M) ? "FUND" : "STOCK";
    rows.push(makeRow(item, place[0], place[1], type));
  }
}

const unique = new Map();
for (const row of rows) unique.set(`${row.exchange}|${row.ticker}|${row.currency}`, row);
const listings = [...unique.values()].sort((a, b) =>
  a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));

fs.writeFileSync(new URL("hsbchk-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
console.error("skipped", skipped);
const counts = {};
for (const row of listings) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${listings.length} rows`);
