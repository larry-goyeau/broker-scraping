// Upstox publishes its whole Indian instrument master, and serves its US
// ("Global markets") book through the public website APIs, with no login.
//
// https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz
//   (the official API instrument file) NSE_EQ and BSE_EQ are the cash book. instrument_type is the NSE series
//   or the BSE group, and every row has its ISIN. A row is kept when it is
//   a sold series (indianCash.mjs: EQ, BE, BZ, SM, ST, IV, RR on NSE; the
//   BSE share groups and E), so government securities (SG, GS, TB), the
//   N0..NZ debt series and the BSE F group of closed fund units are left
//   out with the indices and F&O segments. An INF ISIN is an exchange fund.
//
// https://service.upstox.com/search/open/v1/?query=&segments=US_EQ
//   The search the website uses. An empty query pages through the whole
//   US_EQ segment, 250 rows a page, until a page comes back empty. Each
//   row says tradable and isETF.
// https://upstox.com/us-stocks/sitemap-us-stocks.xml
// https://service.upstox.com/content/open/v1/us-stocks/?slug=<ticker>
//   The US share pages. A page whose ticker the search does not return
//   (AVB, AXL...) is read through the page API, and kept when it says
//   tradable. Warrants (.WS), rights (.RT) and SPAC units are left out, and
//   baby bonds and notes by obligation.mjs; preferred shares stay. Upstox
//   writes AMEX for NYSE American (B2Gold, Energy Fuels) and ARCA for NYSE
//   Arca, BATS for Cboe BZX; OTC is the OTC book. There is no US ISIN.
//
// This master is the file indianCash.mjs reads for its cash book, so the
// series and ISIN are taken from it directly. Upstox is an India INX
// member, but its US pages say IFSC exchanges are not used for these
// orders, and it publishes no INX share list.
//
//   node brokers/upstox/upstox_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { isinOf, keepSold, companyName } from "../../indianCash.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MASTER = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
const SEARCH = "https://service.upstox.com/search/open/v1/";
const SITEMAP = "https://upstox.com/us-stocks/sitemap-us-stocks.xml";
const PAGE_API = "https://service.upstox.com/content/open/v1/us-stocks/";
const PAGE_SIZE = 250;
const WORKERS = 6;

const MIC = { NSE: "XNSE", BSE: "XBOM" };
const US_VENUE = {
  NASDAQ: { exchange: "NASDAQ", mic: "XNAS" },
  NYSE: { exchange: "NYSE", mic: "XNYS" },
  ARCA: { exchange: "NYSE Arca", mic: "ARCX" },
  AMEX: { exchange: "NYSE American", mic: "XASE" },
  BATS: { exchange: "Cboe BZX", mic: "BATS" },
  OTC: { exchange: "OTC" },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, as = "json") {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) {
        if (as === "buffer") return Buffer.from(await response.arrayBuffer());
        if (as === "text") return response.text();
        return response.json();
      }
      last = `${response.status} ${url}`;
      if (response.status === 404) break;
      if (response.status === 429) await sleep(3000 * (attempt + 1));
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index]);
        await sleep(120);
      }
    }),
  );
  return results;
}

const listings = [];
const seen = new Set();

function push(row) {
  const key = `${row.exchange}|${row.ticker.toUpperCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  listings.push(row);
}

// India: the instrument master.
const master = JSON.parse(gunzipSync(await get(MASTER, "buffer")).toString("utf8"));
for (const row of master) {
  if (row.segment !== "NSE_EQ" && row.segment !== "BSE_EQ") continue;
  const exchange = row.exchange;
  const ticker = String(row.trading_symbol || "").trim();
  if (!ticker) continue;
  const series = String(row.instrument_type || "").trim().toUpperCase();
  const isin = isinOf(row.isin);
  if (!keepSold(exchange, series, ticker, isin)) continue;
  const name = companyName(row.short_name || row.name, ticker, { name: row.name });
  push({
    query: ticker,
    ticker,
    name,
    exchange,
    mic: MIC[exchange],
    currency: "INR",
    type: isin.startsWith("INF") ? "ETF" : "STOCK",
    isin,
    raw: [ticker, name, exchange, series, isin].filter(Boolean).join(" "),
  });
}

// United States.
function excludedUs(symbol, name) {
  if (/\.(WS|WT|RT|RTWI|U|UN)$|\.WS\./.test(symbol)) return true;
  if (/\bwarrants?\b/i.test(name)) return true;
  // "each representing the right to receive" is an ADR, not a right.
  if (/\brights?\b/i.test(name) && (/R$/.test(symbol) || /\brights?\s*$/i.test(name))) return true;
  // A SPAC unit is a share plus a warrant. LP and trust units are shares.
  if (/\bunits?\b/i.test(name) && /U$/.test(symbol) && !/common units|trust units|units of beneficial|partners|L\.?P\b/i.test(name)) return true;
  return false;
}

function usRow(symbol, name, venueCode, isEtf) {
  const venue = US_VENUE[String(venueCode || "").toUpperCase()];
  if (!venue) return false;
  const ticker = String(symbol || "").trim().toUpperCase();
  const label = String(name || ticker).replace(/\s+/g, " ").trim();
  if (!ticker || excludedUs(ticker, label)) return true;
  const etf = isEtf || /\b(ETF|ETN)s?\b|exchange[- ]traded/i.test(label);
  push({
    query: ticker,
    ticker,
    name: label,
    exchange: venue.exchange,
    ...(venue.mic ? { mic: venue.mic } : {}),
    currency: "USD",
    type: etf ? "ETF" : "STOCK",
    isin: "",
    raw: [ticker, label, venueCode, etf ? "ETF" : ""].filter(Boolean).join(" "),
  });
  return true;
}

const searched = new Map();
let announced = 0;
for (let page = 1; ; page += 1) {
  if (page > 400) throw new Error("US search did not end");
  const url = new URL(SEARCH);
  url.search = new URLSearchParams({ query: "", segments: "US_EQ", records: String(PAGE_SIZE), pageNumber: String(page) });
  const body = await get(url);
  if (!body?.success) throw new Error(`US search page ${page} failed`);
  const total = Number(body.metaData?.page?.totalRecords);
  if (Number.isFinite(total) && total > announced) announced = total;
  const list = body.data?.searchList || [];
  if (!list.length) break;
  for (const item of list) {
    const a = item.attributes || {};
    if (a.segment !== "US_EQ") continue;
    searched.set(String(a.tradingSymbol).toUpperCase(), a);
  }
  if (list.length < PAGE_SIZE) break;
  await sleep(150);
}
if (announced && searched.size < announced * 0.98) throw new Error(`US search returned ${searched.size} of ${announced}`);

const unknownVenues = new Map();
for (const [symbol, a] of searched) {
  if (a.tradable !== true || String(a.status || "active").toLowerCase() !== "active") continue;
  if (!usRow(symbol, a.name, a.foreignExchange, a.isETF === true)) {
    unknownVenues.set(a.foreignExchange, (unknownVenues.get(a.foreignExchange) || 0) + 1);
  }
}

const sitemap = await get(SITEMAP, "text");
const slugs = [...sitemap.matchAll(/<loc>https:\/\/upstox\.com\/us-stocks\/([^<\/]+)-share-price\/<\/loc>/g)].map((m) => m[1]);
if (slugs.length < 5000) throw new Error(`US sitemap lists ${slugs.length} pages`);
const missing = slugs.filter((slug) => !searched.has(slug.toUpperCase()) && !searched.has(slug.toUpperCase().replace(/-/g, ".")));
let pageFailures = 0;
const pages = await pool(missing, async (slug) => {
  try {
    const body = await get(`${PAGE_API}?slug=${encodeURIComponent(slug)}`);
    return body?.success ? body.data : null;
  } catch {
    pageFailures += 1;
    return null;
  }
});
if (pageFailures > missing.length * 0.01) throw new Error(`${pageFailures} of ${missing.length} US pages failed`);
for (const data of pages) {
  if (!data || String(data.tradable) !== "true") continue;
  if (!usRow(data.symbol, data.companyName, data.foreignExchange, String(data.isETF) === "true")) {
    unknownVenues.set(data.foreignExchange, (unknownVenues.get(data.foreignExchange) || 0) + 1);
  }
}
if (unknownVenues.size) console.error("US venues not mapped:", Object.fromEntries(unknownVenues));

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("upstox-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const written = withoutObligations(listings);
const counts = {};
for (const row of written) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${written.length} listings (US search ${searched.size}, ${missing.length} sitemap pages read apart)`, counts);
