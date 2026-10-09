// Avanza publishes every share and every ETF it sells online, with no login.
// The phone book (Japan, Hong Kong, South Africa, Australia, and the Paris
// or Frankfurt names that are not on the site) is not in these two lists.
//
// France, Belgium, the Netherlands and Portugal are quoted with a Euronext
// code. The site only fills those orders on Equiduct, so the row stores
// XEQT. London and Zurich are Cboe CXE (CHIX). Milan and Madrid are Cboe
// DXE (CEUX), which is not the Chi-X book. A listed American name keeps
// the exchange Avanza prints: Nasdaq, the NYSE or NYSE American.
//
//   https://www.avanza.se/_api/market-stock-filter/stocks
//   https://www.avanza.se/_api/market-etf-filter/
//   https://www.avanza.se/kundservice.html/737/vilka-marknader-kan-jag-handla-pa-hos-avanza
//
//   node brokers/avanza/avanza_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS = "https://www.avanza.se/_api/market-stock-filter/stocks";
const ETFS = "https://www.avanza.se/_api/market-etf-filter/";
const GUIDE = "https://www.avanza.se/_api/market-guide/stock/";
const PAGE = 1000;
const WORKERS = 6;

// The list still says Euronext. The order on the website hits Equiduct.
const EQUIDUCT = new Set(["XPAR", "XAMS", "XBRU", "XLIS", "ALXP"]);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(url, body) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
      if (response.status === 429) await sleep(1500 * (attempt + 1));
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

async function loadList(url, key, floor) {
  const rows = [];
  let total = 0;
  for (let offset = 0; rows.length < (total || Infinity); offset += PAGE) {
    if (offset > 40000) throw new Error(`${key} did not end`);
    const body = await post(url, {
      filter: {},
      offset,
      limit: PAGE,
      sortBy: { field: "name", order: "asc" },
    });
    const announced = Number(body.totalNumberOfOrderbooks);
    if (!Number.isInteger(announced) || announced < 1) throw new Error(`${key} announced ${body.totalNumberOfOrderbooks}`);
    if (!total) total = announced;
    if (announced !== total) throw new Error(`${key} changed from ${total} to ${announced}`);
    const page = body[key];
    if (!Array.isArray(page) || !page.length) throw new Error(`${key} returned an empty page at ${offset}`);
    rows.push(...page);
    if (page.length < PAGE && rows.length !== total) throw new Error(`${key} ended at ${rows.length} of ${total}`);
  }
  if (rows.length !== total) throw new Error(`${key} announced ${total} and returned ${rows.length}`);
  if (rows.length < floor) throw new Error(`only ${rows.length} ${key}`);
  return rows;
}

async function guide(id) {
  const url = `${GUIDE}${id}`;
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${id}`;
      if (response.status === 404) return null;
      if (response.status === 429) await sleep(1500 * (attempt + 1));
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(300 * (attempt + 1));
  }
  throw new Error(last);
}

function bookOf(code) {
  const mic = normalize(code).toUpperCase();
  if (!mic) return "";
  if (EQUIDUCT.has(mic)) return "XEQT";
  return mic;
}

function kindOf(type, name) {
  const kind = normalize(type).toUpperCase();
  if (kind === "STOCK") return "STOCK";
  if (kind === "EXCHANGE_TRADED_COMMODITY" || (kind === "EXCHANGE_TRADED_FUND" && /\bETC\b/.test(name))) return "ETC";
  if (kind === "EXCHANGE_TRADED_FUND") return "ETF";
  return "";
}

const stocks = await loadList(STOCKS, "stocks", 10000);
const etfs = await loadList(ETFS, "etfs", 1400);
const ids = [];
const seen = new Set();
for (const row of [...stocks, ...etfs]) {
  const id = normalize(row.orderbookId);
  if (!id || seen.has(id)) continue;
  seen.add(id);
  ids.push(id);
}

const details = new Map();
let cursor = 0;
async function worker() {
  for (;;) {
    const index = cursor;
    cursor += 1;
    if (index >= ids.length) return;
    const id = ids[index];
    details.set(id, await guide(id));
    if ((index + 1) % 500 === 0) console.error(`${index + 1}/${ids.length}`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));

const merged = new Map();
const withheld = new Map();
const unknown = new Map();
function withhold(reason) {
  withheld.set(reason, (withheld.get(reason) || 0) + 1);
}

for (const id of ids) {
  const body = details.get(id);
  if (!body) {
    withhold("no page");
    continue;
  }
  const tradable = normalize(body.tradable).toUpperCase();
  if (tradable !== "BUYABLE_AND_SELLABLE") {
    withhold(tradable || "not tradable");
    continue;
  }
  const listing = body.listing || {};
  const isin = normalize(body.isin).toUpperCase();
  const ticker = normalize(listing.tickerSymbol || listing.shortName).toUpperCase();
  const name = normalize(body.name);
  const currency = normalize(listing.currency).toUpperCase();
  const exchange = bookOf(listing.marketPlaceCode);
  const type = kindOf(body.type, name);
  if (!type) {
    const label = normalize(body.type) || "blank";
    const prior = unknown.get(label) || [];
    if (prior.length < 3) prior.push(ticker || isin || id);
    unknown.set(label, prior);
    continue;
  }
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${ticker || id} has no ISIN`);
  if (!ticker || !name) throw new Error(`${isin} has no ticker or name`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
  if (!exchange) throw new Error(`${ticker} has no book`);
  const key = `${isin}|${exchange}|${currency}`;
  const prior = merged.get(key);
  if (prior) {
    if (prior.ticker !== ticker || prior.type !== type) {
      throw new Error(`${isin} is both ${prior.ticker} ${prior.exchange} ${prior.type} and ${ticker} ${exchange} ${type}`);
    }
    continue;
  }
  merged.set(key, { ticker, name, isin, currency, exchange, type });
}

if (unknown.size) {
  const listed = [...unknown].map(([key, names]) => `${key} (${names.join(", ")})`).join("; ");
  throw new Error(`unmapped types: ${listed}`);
}

const rows = [...merged.values()].map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: row.exchange,
  currency: row.currency,
  type: row.type,
  isin: row.isin,
  raw: [row.ticker, row.name, row.exchange, row.currency, row.isin, row.type].join(" "),
}));

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const apple = rows.find((row) => row.isin === "US0378331005" && row.exchange === "XNAS" && row.currency === "USD");
if (!apple) throw new Error("Apple is not on Nasdaq");
const nokia = rows.find((row) => row.isin === "FI0009000681" && row.exchange === "XHEL");
if (!nokia) throw new Error("Nokia is not on Helsinki");
const investor = rows.find((row) => row.isin === "SE0015811963" && row.exchange === "XSTO" && row.currency === "SEK");
if (!investor) throw new Error("Investor B is not on Stockholm");
const lvmh = rows.find((row) => row.isin === "FR0000121014");
if (!lvmh || lvmh.exchange !== "XEQT") throw new Error(`LVMH is on ${lvmh?.exchange || "nowhere"}, not Equiduct`);
const asml = rows.find((row) => row.isin === "NL0010273215");
if (!asml || asml.exchange !== "XEQT") throw new Error(`ASML is on ${asml?.exchange || "nowhere"}, not Equiduct`);
const nestle = rows.find((row) => row.isin === "CH0038863350");
if (!nestle || nestle.exchange !== "CHIX") throw new Error(`Nestlé is on ${nestle?.exchange || "nowhere"}`);
const leaked = rows.find((row) => EQUIDUCT.has(row.exchange));
if (leaked) throw new Error(`${leaked.ticker} is still on ${leaked.exchange}`);

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("avanza-parsed.json", import.meta.url), `${JSON.stringify(kept, null, 2)}\n`);

const byBook = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  byBook.set(key, (byBook.get(key) || 0) + 1);
}
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
if (withheld.size) console.error(`left out ${[...withheld].map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
