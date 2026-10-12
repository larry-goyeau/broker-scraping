// What Motilal Oswal sells in Indian shares and ETFs, and in the US
// book on Riise, with no login.
// A share is looked up by ISIN in the site search. An ETF is kept when
// its name opens a quote page at /share-market/<name>. The search does
// not answer ETFs.
// The US book is getusstocklist: symbol, name and ISIN, one letter at a
// time. A mutual fund, a warrant or a right stays out. The venue is the
// US listing of that symbol in the CSV, when it has one.
// The Indian and global index boards stay out: an index is not a share
// and not an ETF. Futures, options and commodities stay out.
//
//   https://www.motilaloswal.com/share-market/indian-bank
//   https://cmots.motilaloswal.cloud/stock/api/S/Stock/MasterSearch
//   https://www.motilaloswal.com/services/mowebsite/getusstocklist
//
//   node brokers/motilaloswal/motilaloswal_scraping.mjs
//   node brokers/motilaloswal/motilaloswal_scraping.mjs --reuse-india

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv, isinOf } from "../../indianCash.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const TOKEN_URL = "https://websiteapi.motilaloswal.com/bin/fetchToken";
const MF_TOKEN_URL = "https://websiteapi.motilaloswal.com/bin/fetchMFToken";
const SEARCH = "https://cmots.motilaloswal.cloud/stock/api/S/Stock/MasterSearch";
const US_LIST = "https://www.motilaloswal.com/services/mowebsite/getusstocklist";
const PAGE = "https://www.motilaloswal.com/share-market/";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const ETF_NAME = /\bETF\b|BeES|Exchange Traded/i;
const FUND_NAME = /\b(fund|portfolio|sicav|ucits)\b/i;
const US_VENUES = ["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"];
const ASIDE = /\.(WS|W|U|RT|R)$/i;

let token = null;

async function getToken() {
  if (token && Date.parse(token.expiryOn) - Date.now() > 20_000) return token;
  const response = await fetch(TOKEN_URL, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!response.ok) throw new Error(`token ${response.status}`);
  const body = await response.json();
  token = JSON.parse(body.value).data;
  return token;
}

async function api(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const auth = await getToken();
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          T: String(auth.interval || 900),
          V: "1.0",
          Authorization: `Bearer ${auth.token}`,
        },
        signal: AbortSignal.timeout(25_000),
      });
      if (response.status === 401) {
        token = null;
        last = `401 ${url}`;
        continue;
      }
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw new Error(last);
}

async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return out;
}

function codeOf(ticker) {
  const text = String(ticker || "").trim().toUpperCase();
  const cut = text.indexOf(":");
  return cut >= 0 ? text.slice(cut + 1) : text;
}

function rowsOf(file, exchanges) {
  const book = new Map();
  for (const row of parseCsv(fs.readFileSync(file, "utf8"))) {
    const exchange = String(row.exchange || "").trim().toUpperCase();
    if (!exchanges.has(exchange)) continue;
    const isin = isinOf(row.isin);
    const ticker = codeOf(row.ticker);
    if (!isin || !ticker) continue;
    if (!book.has(isin)) book.set(isin, []);
    const list = book.get(isin);
    if (!list.some((item) => item.exchange === exchange && item.ticker === ticker)) {
      list.push({ exchange, ticker, name: String(row.name || "").trim() });
    }
  }
  return book;
}

function slugify(text) {
  return String(text || "")
    .replace(/&/g, " and ")
    .replace(/\bLimited\b/gi, "Ltd")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function etfSlugs(name) {
  const raw = String(name || "").replace(/\s+/g, " ").trim();
  const stems = [raw];
  if (raw.includes(" - ")) stems.push(raw.split(" - ").slice(1).join(" - ").trim());
  const suffixes = [
    /\s+units\s+exchange\s+traded\s+fund$/i,
    /\s+exchange\s+traded\s+fund\s+units$/i,
    /\s+exchange\s+traded\s+fund$/i,
    /\s+etf\s+units$/i,
    /\s+units$/i,
  ];
  const grown = [];
  for (const stem of stems) {
    let current = stem;
    grown.push(current);
    for (const suffix of suffixes) {
      const next = current.replace(suffix, "").trim();
      if (next !== current) {
        grown.push(next);
        current = next;
      }
    }
  }
  const slugs = [];
  for (const stem of grown) {
    for (const slug of [slugify(stem), slugify(stem.replace(/&/g, " "))]) {
      if (slug && !slugs.includes(slug)) slugs.push(slug);
    }
  }
  return slugs.slice(0, 5);
}

async function pageExists(slug) {
  const response = await fetch(`${PAGE}${slug}`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return false;
  const html = (await response.text()).slice(0, 1200);
  const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || "";
  return /Share Price|LIVE NSE|Live Updates/i.test(title);
}

function listing({ ticker, name, exchange, currency, type, isin }) {
  return {
    query: ticker,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, type, isin].filter(Boolean).join(" "),
    ...(isin ? { isin } : {}),
  };
}

const stockBook = rowsOf(STOCKS, new Set(["NSE", "BSE"]));
const etfBook = rowsOf(ETFS, new Set(["NSE", "BSE"]));
const usBySymbol = new Map();
for (const [file, etf] of [[STOCKS, false], [ETFS, true]]) {
  for (const row of parseCsv(fs.readFileSync(file, "utf8"))) {
    const exchange = String(row.exchange || "").trim().toUpperCase();
    if (!US_VENUES.includes(exchange)) continue;
    const ticker = codeOf(row.ticker);
    const isin = isinOf(row.isin);
    if (!ticker) continue;
    if (!usBySymbol.has(ticker)) usBySymbol.set(ticker, []);
    usBySymbol.get(ticker).push({ exchange, isin, etf });
  }
}
const seen = new Set();
const listings = [];

function add(row) {
  const key = `${row.exchange}|${row.ticker}`;
  if (seen.has(key)) return;
  seen.add(key);
  listings.push(row);
}

const reuseIndia = process.argv.includes("--reuse-india");
if (reuseIndia) {
  const prior = JSON.parse(fs.readFileSync(new URL("motilaloswal-parsed.json", import.meta.url), "utf8"));
  for (const row of prior) {
    if (row.currency === "USD") continue;
    add(row);
  }
  console.error(`india reused ${listings.length}`);
}

const stockIsins = [...stockBook.keys()];
let stockHits = 0;
let looked = 0;
if (!reuseIndia) await pool(stockIsins, 8, async (isin) => {
  looked += 1;
  if (looked % 400 === 0) console.error(`shares ${looked}/${stockIsins.length}`);
  const body = await api(`${SEARCH}?Keyword=${encodeURIComponent(isin)}&i=2`);
  const hit = (Array.isArray(body.data) ? body.data : []).find(
    (row) => isinOf(row.isin) === isin && String(row.flag || "").toUpperCase() === "STOCK"
  );
  if (!hit) return;
  stockHits += 1;
  const name = String(hit.lname || hit.co_name || "").trim();
  for (const row of stockBook.get(isin)) {
    add(listing({
      ticker: row.ticker,
      name: name || row.name,
      exchange: row.exchange,
      currency: "INR",
      type: "STOCK",
      isin,
    }));
  }
});
if (!reuseIndia) console.error(`shares ${stockIsins.length}/${stockIsins.length}, ${stockHits} answered`);

const etfIsins = [...etfBook.keys()].filter((isin) => etfBook.get(isin).some((row) => ETF_NAME.test(row.name)));
let etfHits = 0;
let etfLooked = 0;
if (!reuseIndia) await pool(etfIsins, 6, async (isin) => {
  etfLooked += 1;
  if (etfLooked % 40 === 0) console.error(`etfs ${etfLooked}/${etfIsins.length}`);
  const rows = etfBook.get(isin);
  const name = rows.find((row) => ETF_NAME.test(row.name))?.name || rows[0].name;
  let found = false;
  for (const slug of etfSlugs(name)) {
    if (await pageExists(slug)) {
      found = true;
      break;
    }
  }
  if (!found) return;
  etfHits += 1;
  for (const row of rows) {
    add(listing({
      ticker: row.ticker,
      name: row.name,
      exchange: row.exchange,
      currency: "INR",
      type: "ETF",
      isin,
    }));
  }
});
if (!reuseIndia) console.error(`etfs ${etfIsins.length}/${etfIsins.length}, ${etfHits} pages`);

let mfToken = null;
async function mfAuth() {
  if (mfToken) return mfToken;
  const response = await fetch(MF_TOKEN_URL, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!response.ok) throw new Error(`mf token ${response.status}`);
  const body = await response.json();
  mfToken = JSON.parse(body.value).data.token;
  return mfToken;
}

async function usPage(letter, page) {
  const payload = JSON.stringify({ PageNumber: page, pageSize: 2000, stock: letter });
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const auth = await mfAuth();
    try {
      const response = await fetch(US_LIST, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth}`,
        },
        body: payload,
        signal: AbortSignal.timeout(40_000),
      });
      if (response.status === 401) {
        mfToken = null;
        last = "401 us list";
        continue;
      }
      if (response.ok) {
        const body = await response.json();
        return Array.isArray(body.data) ? body.data : [];
      }
      last = `${response.status} us list`;
    } catch (error) {
      last = `${error.message || error} us list`;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw new Error(last);
}

function usPlace(symbol, isin) {
  const hits = usBySymbol.get(symbol) || [];
  const same = isin ? hits.filter((hit) => hit.isin === isin) : hits;
  if (isin && !same.length) return "US";
  for (const exchange of US_VENUES) {
    if (same.some((hit) => hit.exchange === exchange)) return exchange;
  }
  return "US";
}

function usType(name, symbol, isin) {
  if (ETF_NAME.test(name)) return "ETF";
  const hits = usBySymbol.get(symbol) || [];
  const same = isin ? hits.filter((hit) => hit.isin === isin) : hits;
  if ((same.length ? same : hits).some((hit) => hit.etf)) return "ETF";
  return "STOCK";
}

function usIsin(symbol, published, exchange) {
  const printed = isinOf(published) || isinOf(symbol);
  if (printed) return printed;
  const hits = (usBySymbol.get(symbol) || []).filter((hit) => exchange === "US" || hit.exchange === exchange);
  const ids = [...new Set(hits.map((hit) => hit.isin).filter(Boolean))];
  return ids.length === 1 ? ids[0] : "";
}

const letters = [..."abcdefghijklmnopqrstuvwxyz0123456789"];
let usRows = 0;
for (const letter of letters) {
  let page = 1;
  for (;;) {
    const rows = await usPage(letter, page);
    for (const row of rows) {
      const ticker = String(row.symbol || "").trim().toUpperCase();
      const name = String(row.name || "").trim();
      if (!ticker || !name) continue;
      if (ASIDE.test(ticker) || /\bwarrants?\b|\brights?\b/i.test(name)) continue;
      const exchange = usPlace(ticker, isinOf(row.isin));
      const isin = usIsin(ticker, row.isin, exchange);
      const type = usType(name, ticker, isin);
      const known = (usBySymbol.get(ticker) || []).some((hit) => !isin || !hit.isin || hit.isin === isin);
      if (type !== "ETF" && !known && FUND_NAME.test(name)) continue;
      add(listing({ ticker, name, exchange, currency: "USD", type, isin }));
      usRows += 1;
    }
    console.error(`us ${letter} page ${page} ${rows.length}`);
    if (rows.length < 2000) break;
    page += 1;
  }
}
console.error(`us rows seen ${usRows}`);

listings.sort(
  (left, right) =>
    left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker)
);

if (!listings.some((row) => row.isin === "INE002A01018" && row.ticker === "RELIANCE" && row.type === "STOCK")) {
  throw new Error("Reliance was not found by ISIN");
}
if (!listings.some((row) => row.isin === "INE562A01011" && row.ticker === "INDIANB")) {
  throw new Error("Indian Bank was not found by ISIN");
}
if (!listings.some((row) => row.isin === "INF204KB17I5" && row.type === "ETF")) {
  throw new Error("Gold BeES was not found by name");
}
if (!listings.some((row) => row.isin === "US0378331005" && row.ticker === "AAPL" && row.exchange === "NASDAQ" && row.currency === "USD")) {
  throw new Error("Apple was not in the US book");
}
if (!listings.some((row) => row.isin === "US78462F1030" && row.ticker === "SPY" && row.type === "ETF" && row.currency === "USD")) {
  throw new Error("SPY was not in the US book");
}
if (listings.some((row) => row.isin === "LU1011998942" || row.ticker === "LU1011998942")) {
  throw new Error("a Luxembourg fund stayed in the US book");
}
const stocks = listings.filter((row) => row.type === "STOCK").length;
const etfs = listings.filter((row) => row.type === "ETF").length;
const usStocks = listings.filter((row) => row.currency === "USD" && row.type === "STOCK").length;
const usEtfs = listings.filter((row) => row.currency === "USD" && row.type === "ETF").length;
if (stocks < 1500) throw new Error(`only ${stocks} shares`);
if (etfs < 50) throw new Error(`only ${etfs} ETFs`);
if (usStocks < 4000) throw new Error(`only ${usStocks} US shares`);
if (usEtfs < 1500) throw new Error(`only ${usEtfs} US ETFs`);

const kept = stampRows(withoutObligations(listings));
fs.writeFileSync(new URL("motilaloswal-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${kept.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
