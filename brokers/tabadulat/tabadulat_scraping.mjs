// Tabadulat sells only Shariah-compliant (AAOIFI-screened) American shares
// and ETFs. Its public screener lists every share it screens, about 4,600
// across 117 pages of 40, each with PASS (Shariah-Compliant) or FAIL (Not
// Shariah), its sector and its exchange. A PASS share is one Tabadulat
// sells; a FAIL share is not. The ETF page lists the halal ETFs it sells.
// No login.
//
//   https://tabadulat.com/halalstockscreener?da5fbde7_page=1 .. 117
//   https://tabadulat.com/etf-stocks
//
// The screener also covers the Toronto Stock Exchange, but Tabadulat
// trades only NYSE and Nasdaq, so TSX lines stay out. NYSE and Nasdaq are
// one American NBBO market: each share is one row on the exchange the
// screener names. The ETF page names no exchange: the place is the one
// assets/etfs.csv files the ticker on (Arca is AMEX there), Nasdaq or NYSE
// Arca. The site shows no ISINs.
//
//   node brokers/tabadulat/tabadulat_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SCREENER = "https://tabadulat.com/halalstockscreener";
const ETFS = "https://tabadulat.com/etf-stocks";
const PAGE_SIZE = 40;
const PLACES = {
  NYSE: { exchange: "NYSE", mic: "XNYS" },
  NASDAQ: { exchange: "Nasdaq", mic: "XNAS" },
  AMEX: { exchange: "NYSE Arca", mic: "ARCX" },
};

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const field = (item, name) => decode(item.match(new RegExp(`fs-list-field="[^"]*" class="${name}">([^<]*)<`))?.[1]);
const hidden = (item, key) => decode(item.match(new RegExp(`fs-list-field="${key}" class="text-style-hidden">([^<]*)<`))?.[1]);

function screenerItems(page) {
  return page.split('class="stock_collection-item').slice(1).map((item) => ({
    ticker: field(item, "stock_ticker"),
    name: field(item, "stock_name"),
    verdict: hidden(item, "shariah-compliant"),
    sector: hidden(item, "sector"),
    exchange: hidden(item, "ticker"),
  }));
}

function pageCount(page) {
  const match = page.match(/w-page-count[^>]*>\s*(\d+)\s*\/\s*(\d+)\s*</);
  return match ? Number(match[2]) : 0;
}

// Ticker to American place, from the ETF list the repository keeps.
function etfPlaces() {
  const places = new Map();
  const text = fs.readFileSync(new URL("../../assets/etfs.csv", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const [ticker, place] = line.split(",");
    if (PLACES[place] && !places.has(ticker.split(":").pop())) places.set(ticker.split(":").pop(), place);
  }
  return places;
}

const first = await get(`${SCREENER}?da5fbde7_page=1`);
const pages = pageCount(first);
if (pages < 100) throw new Error(`screener announces ${pages} pages`);
const screened = screenerItems(first);
for (let page = 2; page <= pages; page += 1) {
  await sleep(300);
  const items = screenerItems(await get(`${SCREENER}?da5fbde7_page=${page}`));
  if (page < pages && items.length !== PAGE_SIZE) throw new Error(`page ${page} has ${items.length} lines`);
  if (page === pages && (items.length < 1 || items.length > PAGE_SIZE)) throw new Error(`last page has ${items.length} lines`);
  screened.push(...items);
}
// A handful of lines carry no verdict (not yet screened) or no ticker:
// they are not marked halal and stay out.
const unread = screened.filter((item) => !item.ticker || !/^(PASS|FAIL)$/.test(item.verdict));
if (unread.length > 25) throw new Error(`screener lines without ticker or verdict: ${JSON.stringify(unread.slice(0, 5))}`);

const rows = [];
const seen = new Set();
const verdicts = {};
for (const item of screened) {
  verdicts[`${item.exchange} ${item.verdict}`] = (verdicts[`${item.exchange} ${item.verdict}`] || 0) + 1;
  if (item.verdict !== "PASS" || !item.ticker) continue;
  const place = PLACES[item.exchange];
  if (!place || item.exchange === "AMEX") continue;
  if (seen.has(item.ticker)) continue;
  seen.add(item.ticker);
  rows.push({
    query: item.ticker,
    ticker: item.ticker,
    name: item.name,
    exchange: place.exchange,
    mic: place.mic,
    currency: "USD",
    type: "STOCK",
    isin: "",
    raw: [item.ticker, item.name, item.verdict, item.sector, item.exchange].join(" | "),
  });
}

await sleep(300);
const etfPage = await get(ETFS);
const etfItems = etfPage.split('class="etf-stock_collection-item').slice(1).map((item) => ({
  ticker: field(item, "stock_ticker"),
  name: field(item, "stock_name"),
}));
if (etfItems.length < 5) throw new Error(`ETF page parsed ${etfItems.length} lines`);
const etfPlace = etfPlaces();
for (const item of etfItems) {
  const listed = etfPlace.get(item.ticker);
  if (!listed) throw new Error(`no American place for ETF ${item.ticker}`);
  if (seen.has(item.ticker)) continue;
  seen.add(item.ticker);
  rows.push({
    query: item.ticker,
    ticker: item.ticker,
    name: item.name.replace(/\s*\([A-Z.]+\)$/, ""),
    exchange: PLACES[listed].exchange,
    mic: PLACES[listed].mic,
    currency: "USD",
    type: "ETF",
    isin: "",
    raw: [item.ticker, item.name].join(" | "),
  });
}

if (rows.length < 1200) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "NVDA", "JNJ", "HLAL", "SPUS"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
}

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("tabadulat-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error({ screened: screened.length, verdicts, written: counts });
