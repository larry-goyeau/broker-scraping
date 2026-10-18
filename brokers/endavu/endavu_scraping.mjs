// Endavu (Denmark) publishes its whole shelf with no login. The "Find aktier"
// and ETF screeners read a public API, and every asset has a page
// (endavu.com/asset/<ticker>, all listed in the sitemap) with a buy button.
//
//   https://api.endavu.com/investment/assets/filter-stocks?limit=100&offset=N
//   https://api.endavu.com/investment/assets/filter-etfs?limit=100&offset=N
//     Every tradable share (incl. ADRs, GDRs, REITs, CDIs) and every ETF,
//     with `total`. 100 rows is the server's ceiling. Each walk is sorted on
//     a fixed key; another walk on a second key fills any gap, and the run
//     stops if the ids still fall short of `total`.
//   https://api.endavu.com/investment/assets/<id>
//     The asset page's data: `primaryExchange` { code, name } is the venue
//     the asset is traded on. The screeners do not carry it.
//
// The ETF screener also lists Danish investment funds that trade on Nasdaq
// Copenhagen ("mutual-fund"); those are kept as FUND. The separate
// mutual-fund screener (subscriptions, no exchange) is not part of this.
// Endavu gives no ISIN. A few Brazilian and London assets have no
// primaryExchange; their currency (BRL, GBP/GBX) names the venue. Any other
// asset without one is dropped and counted.
//
// Endavu writes code FRA with the label "Xetra"; FRA is Frankfurt's code
// and ETR (labelled "Deutsche Börse Xetra") is Xetra, so FRA is stored as
// Börse Frankfurt.
//
//   node brokers/endavu/endavu_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const API = "https://api.endavu.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const LIMIT = 100;
const CONCURRENCY = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Endavu exchange code -> [venue name used across this repo, MIC]. A code
// not listed keeps the name Endavu prints, with no MIC.
const VENUES = {
  NASDAQ: ["Nasdaq", "XNAS"],
  NYSE: ["New York Stock Exchange", "XNYS"],
  AMEX: ["NYSE American", "XASE"],
  CBZ: ["Cboe BZX", "BATS"],
  ETR: ["Börse Xetra", "XETR"],
  FRA: ["Börse Frankfurt", "XFRA"],
  STU: ["Börse Stuttgart", "XSTU"],
  MUN: ["Börse München", ""],
  LON: ["London Stock Exchange", "XLON"],
  EPA: ["Euronext Paris", "XPAR"],
  AMS: ["Euronext Amsterdam", "XAMS"],
  EBR: ["Euronext Brussels", "XBRU"],
  ELI: ["Euronext Lisbon", "XLIS"],
  BIT: ["Euronext Milan", "XMIL"],
  DUB: ["Euronext Dublin", "XMSM"],
  OSL: ["Oslo Børs", "XOSL"],
  STO: ["Nasdaq Stockholm", "XSTO"],
  CPH: ["Nasdaq Copenhagen", "XCSE"],
  HEL: ["Nasdaq Helsinki", "XHEL"],
  TAL: ["Nasdaq Tallinn", "XTAL"],
  RIGA: ["Nasdaq Riga", "XRIS"],
  VIL: ["Nasdaq Vilnius", "XLIT"],
  VIE: ["Wiener Börse", "XWBO"],
  SWX: ["SIX Swiss Exchange", "XSWX"],
  BME: ["Bolsa de Madrid", "XMAD"],
  WSE: ["Warsaw Stock Exchange", "XWAR"],
  XPRA: ["Prague Stock Exchange", "XPRA"],
  BUD: ["Budapest Stock Exchange", "XBUD"],
  ATH: ["Athens Stock Exchange", "ASEX"],
  XBSE: ["Bucharest Stock Exchange", "XBSE"],
  XIST: ["Borsa Istanbul", "XIST"],
  XLJS: ["Ljubljana Stock Exchange", "XLJU"],
  XBRA: ["Bratislava Stock Exchange", "XBRA"],
  BCXE: ["Cboe Europe", "BCXE"],
  TSE: ["Toronto Stock Exchange", "XTSE"],
  CVE: ["TSX Venture", "XTSX"],
  CNSX: ["Canadian Securities Exchange", "XCNQ"],
  NEO: ["Cboe Canada", "NEOE"],
  XATS: ["Alpha Exchange", "XATS"],
  MEX: ["Bolsa Mexicana", "XMEX"],
  BVMF: ["B3 São Paulo", "BVMF"],
  ASX: ["ASX", "XASX"],
  TYO: ["Tokyo Stock Exchange", "XTKS"],
  HKG: ["Hong Kong Stock Exchange", "XHKG"],
  SHE: ["Shenzhen Stock Exchange", "XSHE"],
  SEC: ["Shenzhen Stock Exchange (Stock Connect)", "XSEC"],
  TPE: ["Taiwan Stock Exchange", "XTAI"],
  ROCO: ["Taipei Exchange", "ROCO"],
  SGX: ["Singapore Exchange", "XSES"],
  XKLS: ["Bursa Malaysia", "XKLS"],
  TASE: ["Tel Aviv Stock Exchange", "XTAE"],
  XSAU: ["Tadawul", "XSAU"],
  XADS: ["Abu Dhabi Securities Exchange", "XADS"],
  XDFM: ["Dubai Financial Market", "XDFM"],
  XJSE: ["Johannesburg Stock Exchange", "XJSE"],
};

// Only where the currency leaves one place: a real fallback, not a guess.
const BY_CURRENCY = { BRL: "BVMF", GBP: "LON", GBX: "LON" };

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function getJson(path) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${API}${path}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= 5) throw new Error(`${path}: ${error.message}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
}

// Sort keys each screener accepts. The stock screener sorts on ticker; the
// ETF screener has no ticker key; funds tie on size and cost, so it takes
// several keys (and the default order) to see every one.
const SORTS = {
  stocks: ["orderBy=ticker&orderDirection=asc", "orderBy=ticker&orderDirection=desc"],
  etfs: [
    "orderBy=netAssetsUSD&orderDirection=desc",
    "orderBy=netAssetsUSD&orderDirection=asc",
    "orderBy=annualCostPercentage&orderDirection=asc",
    "orderBy=expenseRatioPercentage&orderDirection=desc",
    "orderBy=ongoingChargePercentage&orderDirection=asc",
    "",
  ],
};

async function walkScreener(shelf) {
  const assets = new Map();
  let total = 0;
  for (const sort of SORTS[shelf]) {
    for (let offset = 0; ; offset += LIMIT) {
      const json = await getJson(`/investment/assets/filter-${shelf}?limit=${LIMIT}&offset=${offset}${sort ? `&${sort}` : ""}`);
      total = json.total;
      for (const asset of json.data || []) assets.set(asset.id, asset);
      if (!json.data?.length || offset + LIMIT >= total) break;
      await sleep(100);
    }
    if (assets.size >= total) break;
  }
  if (assets.size < total) throw new Error(`${shelf}: ${assets.size} assets read, screener says ${total}`);
  console.error(`${shelf}: ${assets.size} assets`);
  return [...assets.values()];
}

async function primaryExchanges(assets) {
  const out = new Map();
  let next = 0;
  async function lane() {
    while (next < assets.length) {
      const asset = assets[next++];
      const json = await getJson(`/investment/assets/${asset.id}`);
      out.set(asset.id, json.primaryExchange || null);
      if (out.size % 2000 === 0) console.error(`  ${out.size} / ${assets.length} asset pages`);
      await sleep(30);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, lane));
  return out;
}

function rowType(assetClass) {
  if (assetClass === "etf") return "ETF";
  if (assetClass === "mutual-fund") return "FUND";
  return "STOCK";
}

const assets = [...(await walkScreener("stocks")), ...(await walkScreener("etfs"))];
const exchanges = await primaryExchanges(assets);

const rows = [];
const seen = new Set();
const dropped = new Map();
for (const asset of assets) {
  const primary = exchanges.get(asset.id);
  const currency = normalize(asset.currency).toUpperCase();
  const code = normalize(primary?.code).toUpperCase() || BY_CURRENCY[currency] || "";
  if (!code) {
    const label = `${currency} ${asset.exchangeCountry || "?"}`;
    dropped.set(label, (dropped.get(label) || 0) + 1);
    continue;
  }
  const [exchange, mic] = VENUES[code] || [normalize(primary?.name) || code, ""];
  const ticker = normalize(asset.ticker);
  const query = normalize(asset.canonicalTicker) || ticker;
  const type = rowType(asset.assetClass);
  const key = `${query}|${exchange}|${currency}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const name = normalize(asset.name);
  const row = { query, ticker, name, exchange, currency, type, isin: "" };
  if (mic) row.mic = mic;
  row.raw = [query, name, asset.assetClass, primary ? `${primary.name} (${primary.code})` : code, currency].filter(Boolean).join(" | ");
  rows.push(row);
}

for (const [label, count] of dropped) console.error(`no exchange for ${count} assets (${label}), dropped`);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
const final = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("endavu-parsed.json", import.meta.url), JSON.stringify(final, null, 2));

const counts = new Map();
for (const row of final) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
for (const [label, count] of [...counts].sort((a, b) => b[1] - a[1])) console.error(`${String(count).padStart(6)}  ${label}`);
console.error(`${final.length} rows`);
