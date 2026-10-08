// What Share.Market sells on the NSE and the BSE. The public plans are
// the fiches: one page per share, one page per ETF. News, events,
// financials, technicals and stock-list are tabs of that same page,
// not extra names. There is no foreign book on the site.
//
// A fiche quotes a symbol, a name and a board. It does not print an
// ISIN. The ISIN is the same symbol on that board in the shared
// catalogues, and only when that board has one ISIN for it.
//
//   https://www.share.market/sitemap-stocks.xml
//   https://www.share.market/sitemap-etfs.xml
//   https://trade.share.market/apis/cube/prelogin/v1/instrument/elements/slug
//
//   node brokers/sharemarket/sharemarket_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS_SITEMAP = "https://www.share.market/sitemap-stocks.xml";
const ETFS_SITEMAP = "https://www.share.market/sitemap-etfs.xml";
const SCRIP = "https://trade.share.market/apis/cube/prelogin/v1/instrument/elements/slug";
const STOCKS_CSV = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS_CSV = new URL("../../assets/etfs.csv", import.meta.url);

const BOOKS = [
  { sitemap: STOCKS_SITEMAP, section: "stocks", type: "STOCK", floor: 3000 },
  { sitemap: ETFS_SITEMAP, section: "etf", type: "ETF", floor: 300 },
];

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

async function textOf(url, { missing = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, application/xml, text/xml, */*",
          Origin: "https://www.share.market",
          Referer: "https://www.share.market/",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      if (response.status === 404 && missing) return "";
      last = `${response.status} ${url}`;
      if (response.status === 404) break;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function slugsOf(xml, section) {
  const slugs = new Set();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = decodeXml(match[1]).split("?")[0].replace(/\/+$/, "");
    const parts = url.split("share.market/")[1]?.split("/") || [];
    if (parts.length === 2 && parts[0] === section && parts[1]) slugs.add(parts[1]);
  }
  return [...slugs];
}

function loadIsins(file) {
  const index = new Map();
  if (!fs.existsSync(file)) return index;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("ticker,")) continue;
    const [tickerCell, exchange, isinCell] = line.split(",");
    const isin = isinOf(isinCell);
    const board = normalize(exchange).toUpperCase();
    const symbol = normalize(String(tickerCell || "").split(":").pop()).toUpperCase();
    if (!isin || !symbol || (board !== "NSE" && board !== "BSE")) continue;
    const key = `${board}|${symbol}`;
    const held = index.get(key);
    if (!held) index.set(key, new Set([isin]));
    else held.add(isin);
  }
  return index;
}

function isinFor(index, symbol, exchange) {
  const held = index.get(`${exchange}|${symbol}`);
  if (!held || held.size !== 1) return "";
  return [...held][0];
}

async function fiche(slug) {
  const body = JSON.stringify({ slug, elements: [{ elementType: "BASIC_INFO" }] });
  const url = `${SCRIP}?body=${encodeURIComponent(Buffer.from(body).toString("base64"))}`;
  const text = await textOf(url, { missing: true });
  if (!text) return null;
  const payload = JSON.parse(text);
  const info = payload.data?.find?.((item) => item.elementType === "BASIC_INFO")?.data;
  if (!info) throw new Error(`${slug} has no fiche`);
  return info;
}

async function mapPool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

const isins = loadIsins(STOCKS_CSV);
for (const [key, values] of loadIsins(ETFS_CSV)) {
  const held = isins.get(key);
  if (!held) isins.set(key, values);
  else for (const isin of values) held.add(isin);
}

const rows = [];
for (const book of BOOKS) {
  const slugs = slugsOf(await textOf(book.sitemap), book.section);
  if (slugs.length < book.floor) throw new Error(`only ${slugs.length} ${book.section} fiches`);
  console.error(`${slugs.length} ${book.section} fiches`);
  let done = 0;
  const infos = await mapPool(slugs, 12, async (slug) => {
    const info = await fiche(slug);
    done += 1;
    if (done % 500 === 0) console.error(`  ${book.section} ${done}/${slugs.length}`);
    return info;
  });
  const missing = slugs.filter((slug, index) => !infos[index]);
  if (missing.length) console.error(`${book.section}: ${missing.length} sitemap fiches have no instrument (${missing.slice(0, 8).join(", ")})`);
  if (infos.filter(Boolean).length < book.floor) {
    throw new Error(`only ${infos.filter(Boolean).length} ${book.section} fiches answered`);
  }
  for (const info of infos) {
    if (!info) continue;
    const ticker = normalize(info.instrumentSymbol).toUpperCase();
    const name = normalize(info.instrumentName);
    const exchange = normalize(info.exchangeSymbol).toUpperCase();
    const kind = normalize(info.instrumentType).toUpperCase();
    if (!ticker || !name) throw new Error(`${info.slug} has no ticker or name`);
    if (exchange !== "NSE" && exchange !== "BSE") throw new Error(`${ticker} is quoted on ${exchange || "no board"}`);
    if (book.type === "STOCK" && kind !== "EQUITY") throw new Error(`${ticker} is a ${kind}, not a share`);
    if (book.type === "ETF" && kind !== "ETF") throw new Error(`${ticker} is a ${kind}, not an ETF`);
    const type = book.type;
    const isin = isinFor(isins, ticker, exchange);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange,
      currency: "INR",
      type,
      isin,
      raw: [ticker, name, exchange, "INR", isin, type].filter(Boolean).join(" "),
    });
  }
}

for (const ticker of ["VOLTAS", "PHARMABEES"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}

const seen = new Set();
for (const row of rows) {
  const key = `${row.type}|${row.exchange}|${row.ticker}`;
  if (seen.has(key)) throw new Error(`${row.ticker} is listed twice on ${row.exchange} as ${row.type}`);
  seen.add(key);
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("sharemarket-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byBook = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  byBook.set(key, (byBook.get(key) || 0) + 1);
}
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")}); ${withIsin} with an ISIN`
);
