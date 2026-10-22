// Webull US (Webull Financial LLC, webull.com): the titles it sells to US residents.
//
// Start: the frozen Webull rows in ../webull/webull-base.json (Webull Singapore's
// OpenAPI shelf). Webull US's own public lists then decide what stays.
//
// Rules, each checked on webull.com on 2026-10-21:
//
// 1. US listed stocks and ETFs stay as in the base (NYSE, Nasdaq, NYSE Arca /
//    NYSE American as AMEX, Cboe BZX as CBOE).
//    https://www.webull.com/pricing prices "US-listed stocks and ETFs" and
//    "US-listed options"; every listed row is on the US tape (one row per title).
//
// 2. OTC: the base's OTC rows are replaced by Webull US's own OTC list.
//    https://www.webull.com/help/faq/10961-Over-The-Counter-OTC-Securities:
//    "Webull currently supports trading in 500+ OTC securities", the list "is
//    subject to change without prior notice", and it links
//    https://www.webull.com/ko-yield/otc-list ("Webull currently supports trading
//    in hundreds of OTC securities"). That page loads exactly
//    quotes-gw.webullfintech.com/api/wlas/ranking/otclist?...&rankType=otc_v2.all&regionId=6
//    (seen in the page's network log), which is what OTC_URL reads below with the
//    US site's headers (app: global). ISINs: the base row for the same ticker,
//    else assets/stocks.csv's OTC line.
//
// 3. Crypto stays, limited to what Webull US lists as tradable today.
//    https://www.webull.com/crypto: "Cryptocurrency trading is offered by Webull
//    Pay LLC" (NMLS 1886762), crypto is "back on the Webull App"; New York, Guam
//    and Northern Mariana Islands residents are served through Bakkt, so no state
//    is left out. The "Tradable" tab of https://www.webull.com/quote/crypto loads
//    quotes-gw.webullfintech.com/api/crypto/rank/trade-rank?regionId=6&rankType=tradeable
//    (CRYPTO_URL below). The endpoint returns at most 100 a call; six sort orders
//    gave the same 100 pairs, so 100 is the whole list. As in the base, a coin
//    stays only when assets/cryptos.csv carries its ticker.
//
// 4. No HKEX and no China Connect rows. webull.com/pricing lists US-listed stocks
//    and ETFs, options, OTC, futures, crypto and fixed income; nothing on
//    webull.com offers Hong Kong or A-share trading to US residents (the HK and
//    Connect shelves are Webull Hong Kong's and Webull Singapore's).
//
// Deposit currency: USD (deposits.mjs `webullus: ["USD"]`). webull.com's wire FAQ
// (https://www.webull.com/help/faq/10820) takes domestic wires by ABA and
// international ones by SWIFT into the one dollar account; no page offers
// another cash currency or an FX service. Every row here is a USD line, so no
// currency copy is added.
//
//   node brokers/webullus/webullus_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";

const BASE = new URL("../webull/webull-base.json", import.meta.url);
const STOCKS_CSV = new URL("../../assets/stocks.csv", import.meta.url);
const CRYPTOS_CSV = new URL("../../assets/cryptos.csv", import.meta.url);
const OUTPUT = new URL("webullus-parsed.json", import.meta.url);

const HEADERS = {
  app: "global",
  appid: "wb_web_us",
  "app-group": "broker",
  platform: "web",
  "device-type": "Web",
  hl: "en",
  os: "web",
  ver: "1.0.0",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0",
};
const GW = "https://quotes-gw.webullfintech.com/api";
const OTC_URL = `${GW}/wlas/ranking/otclist?direction=-1&pageIndex=1&pageSize=500&rankType=otc_v2.all&regionId=6`;
const CRYPTO_URL = (order, direction) =>
  `${GW}/crypto/rank/trade-rank?regionId=6&rankType=tradeable&pageIndex=1&pageSize=100&order=${order}&direction=${direction}`;

const LISTED = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);

async function getJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

// assets/stocks.csv keys OTC lines as "OTC:<ticker>".
function otcIndex() {
  const index = new Map();
  for (const line of fs.readFileSync(STOCKS_CSV, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("OTC:")) continue;
    const [key, exchange, isin, name] = splitCsvLine(line);
    if (exchange !== "OTC" || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin || "")) continue;
    const ticker = key.slice(4).replace(/[\s/]+/g, ".").toUpperCase();
    if (!index.has(ticker)) index.set(ticker, { isin, name: (name || "").trim() });
  }
  return index;
}

function cryptoTickers() {
  const tickers = new Set();
  for (const line of fs.readFileSync(CRYPTOS_CSV, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const ticker = line.split(",")[0].trim().toUpperCase();
    if (ticker) tickers.add(ticker);
  }
  return tickers;
}

const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
const rows = [];

// 1. US listed rows, as they are.
rows.push(...base.filter((row) => LISTED.has(row.exchange)));

// 2. OTC, from Webull US's own list.
const otc = await getJson(OTC_URL);
const otcListings = (otc.data || []).map((entry) => entry.ticker).filter(Boolean);
if (otcListings.length < 100) throw new Error(`OTC list came back with ${otcListings.length} names`);
const baseOtc = new Map(base.filter((row) => row.exchange === "OTC").map((row) => [row.ticker, row]));
const otcCsv = otcIndex();
let otcFromBase = 0;
let otcFromCsv = 0;
const otcNoIsin = [];
const otcSeen = new Set();
for (const listing of otcListings) {
  if (listing.listStatus !== undefined && listing.listStatus !== 1) continue;
  const ticker = String(listing.disSymbol || listing.symbol || "").replace(/[\s/]+/g, ".").toUpperCase();
  if (!ticker || otcSeen.has(ticker)) continue;
  otcSeen.add(ticker);
  const currency = listing.currencyCode || "USD";
  const kept = baseOtc.get(ticker);
  if (kept && kept.currency === currency) {
    rows.push(kept);
    otcFromBase += 1;
    continue;
  }
  const csv = otcCsv.get(ticker);
  if (csv) otcFromCsv += 1;
  else otcNoIsin.push(ticker);
  const name = csv?.name || String(listing.name || ticker).trim();
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: "OTC",
    currency,
    type: "STOCK",
    raw: [ticker, String(listing.name || "").trim(), "OTC", currency].filter(Boolean).join(" "),
    isin: csv?.isin || "",
  });
}

// 3. Crypto Webull Pay lists as tradable for the US.
const tradable = new Map();
for (const order of ["changeRatio", "marketValue", "volume24h"]) {
  for (const direction of [-1, 1]) {
    const answer = await getJson(CRYPTO_URL(order, direction));
    for (const entry of answer.data || []) {
      const t = entry.ticker;
      if (!t || t.template !== "crypto") continue;
      const coin = String(t.coinSymbol || t.disSymbol || "").toUpperCase();
      if (coin) tradable.set(coin, t);
    }
  }
}
if (tradable.size < 30) throw new Error(`crypto list came back with ${tradable.size} coins`);
const knownCoins = cryptoTickers();
const baseCrypto = new Map(base.filter((row) => row.type === "CRYPTO").map((row) => [row.ticker, row]));
const coinsNotInCsv = [];
for (const [coin, listing] of tradable) {
  if (!knownCoins.has(coin)) {
    coinsNotInCsv.push(coin);
    continue;
  }
  const currency = listing.currencyCode || "USD";
  const kept = baseCrypto.get(coin);
  if (kept && kept.currency === currency) {
    rows.push(kept);
    continue;
  }
  const symbol = String(listing.symbol || `${coin}${currency}`);
  rows.push({
    query: coin,
    ticker: coin,
    name: symbol,
    exchange: "CRYPTO",
    currency,
    type: "CRYPTO",
    raw: [symbol, symbol, "CRYPTO", currency].join(" "),
    isin: "",
  });
}
const baseCryptoDropped = [...baseCrypto.keys()].filter((coin) => !tradable.has(coin));

// Every place must be known to spreads/venues.mjs. Crypto is the recognised
// over-the-counter "Crypto" place (no single book), as for every catalogue.
const unresolved = new Set();
for (const row of rows) {
  const answer = resolveVenue({ exchange: row.exchange, currency: row.currency, isin: row.isin });
  if (!answer.venue && !(row.type === "CRYPTO" && answer.unsourced)) {
    unresolved.add(`${row.exchange}|${row.currency}`);
  }
}
if (unresolved.size) throw new Error(`places venues.mjs does not know: ${[...unresolved].join(", ")}`);

rows.sort((left, right) =>
  String(left.type).localeCompare(right.type) ||
  String(left.exchange).localeCompare(String(right.exchange)) ||
  String(left.ticker).localeCompare(String(right.ticker))
);

fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(rows), import.meta.url), null, 2));

const tally = new Map();
for (const row of rows) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  tally.set(key, (tally.get(key) || 0) + 1);
}
console.error(`${rows.length} rows written to ${OUTPUT.pathname}`);
for (const [key, count] of [...tally].sort()) console.error(`  ${key}: ${count}`);
console.error(
  `OTC: ${otcListings.length} on Webull US's list; ${otcFromBase} kept from the base, ` +
    `${otcFromCsv} new with a stocks.csv ISIN, ${otcNoIsin.length} without ISIN` +
    (otcNoIsin.length ? ` (${otcNoIsin.join(" ")})` : "") +
    `; ${[...baseOtc.keys()].filter((ticker) => !otcSeen.has(ticker)).length} base OTC rows dropped`
);
console.error(
  `crypto: ${tradable.size} tradable at Webull US; ${coinsNotInCsv.length} not in assets/cryptos.csv` +
    (coinsNotInCsv.length ? ` (${coinsNotInCsv.sort().join(" ")})` : "") +
    (baseCryptoDropped.length ? `; base coins no longer tradable: ${baseCryptoDropped.join(" ")}` : "")
);
console.error(
  `left out: ${base.filter((row) => row.exchange === "HKEX").length} HKEX and ` +
    `${base.filter((row) => row.exchange === "Shanghai" || row.exchange === "Shenzhen").length} China Connect base rows`
);
