// Zad (The Securities House, Kuwait) trades US stocks and ETFs. Its public
// "Assets" page is fed by an open API that pages through every symbol Zad
// carries, with the company name, a Shari'a flag and a tradable flag.
// No login.
//
//   https://www.joinzad.com/assets/
//   https://api.joinzad.com/api/v1/asset/asset-exports?page=0&size=2000
//
// Rows with tradable=false are skipped, and so are units, warrants and
// rights. Zad prints no venue, type or ISIN, so these come from
// assets/stocks.csv and assets/etfs.csv when the symbol is listed there on
// NYSE, Nasdaq, AMEX or Cboe; a symbol found in etfs.csv is an ETF. The
// catalogue writes AMEX for NYSE Arca as well as NYSE American: an ETF there
// is stored as ARCX, a share as XASE. A symbol the catalogue only knows over
// the counter (mostly ADRs) is stored as OTC. Any other tradable symbol (new
// listings, and names the API still carries after a delisting) is stored as
// "US" without a MIC, and is an ETF only when its name says so.
//
//   node brokers/zad/zad_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv } from "../../indianCash.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const API = "https://api.joinzad.com/api/v1/asset/asset-exports";
const PAGE = 2000;
const VENUES = { NYSE: "XNYS", NASDAQ: "XNAS", AMEX: "XASE", CBOE: "BATS" };
const NOT_SHARE = /\b(units?|warrants?|rights?)\b/i;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://www.joinzad.com" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

// Catalogue spelling of a Zad symbol: ABR.PRD -> ABR/PD, BF.B stays BF.B.
function spellings(symbol) {
  const out = [symbol];
  const preferred = symbol.match(/^([A-Z]+)\.PR([A-Z]?)$/);
  if (preferred) out.push(`${preferred[1]}/P${preferred[2]}`);
  if (symbol.includes(".")) out.push(symbol.replace(".", "/"));
  return out;
}

function catalogue() {
  const byTicker = new Map();
  for (const [file, type] of [["../../assets/stocks.csv", "STOCK"], ["../../assets/etfs.csv", "ETF"]]) {
    for (const row of parseCsv(fs.readFileSync(new URL(file, import.meta.url), "utf8"))) {
      const venue = normalize(row.exchange).toUpperCase();
      if (!VENUES[venue] && venue !== "OTC") continue;
      const ticker = normalize(row.ticker).split(":").pop().toUpperCase();
      const isin = normalize(row.isin).toUpperCase();
      if (!byTicker.has(ticker)) byTicker.set(ticker, []);
      byTicker.get(ticker).push({ venue, type, isin: /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) ? isin : "" });
    }
  }
  return byTicker;
}

const assets = [];
let total = 0;
for (let page = 0; ; page += 1) {
  if (page > 50) throw new Error("asset export did not end");
  const body = await getJson(`${API}?page=${page}&size=${PAGE}`);
  if (!total) total = body.paginationMeta.totalElements;
  assets.push(...body.content);
  if (page + 1 >= body.paginationMeta.totalPages) break;
  await sleep(300);
}
if (assets.length !== total) throw new Error(`export announced ${total}, returned ${assets.length}`);

const book = catalogue();
const rows = [];
const seen = new Set();
const tally = { untradable: 0, notShare: 0, otcOnly: 0, noVenue: 0 };
for (const asset of assets) {
  const symbol = normalize(asset.symbol).toUpperCase();
  const name = normalize(asset.companyName);
  if (!asset.tradable) {
    tally.untradable += 1;
    continue;
  }
  if (NOT_SHARE.test(name) || /\.(U|WS|RT)$/.test(symbol)) {
    tally.notShare += 1;
    continue;
  }
  const all = spellings(symbol).flatMap((spelling) => book.get(spelling) || []);
  const hits = all.filter((hit) => VENUES[hit.venue]);
  let venue = hits[0]?.venue;
  if (!venue) {
    venue = all.some((hit) => hit.venue === "OTC") ? "OTC" : "US";
    tally[venue === "OTC" ? "otcOnly" : "noVenue"] += 1;
  }
  const etfName = /\b(ETF|ETN)\b|exchange traded/i.test(name);
  const type = hits.some((hit) => hit.type === "ETF") || (!hits.length && etfName) ? "ETF" : "STOCK";
  const isins = [...new Set(all.filter((hit) => hit.venue === venue).map((hit) => hit.isin).filter(Boolean))];
  const key = `${venue}|${symbol}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push({
    query: symbol,
    ticker: symbol,
    name,
    exchange: venue,
    ...(VENUES[venue] ? { mic: venue === "AMEX" && type === "ETF" ? "ARCX" : VENUES[venue] } : {}),
    currency: "USD",
    type,
    isin: isins.length === 1 ? isins[0] : "",
    raw: [symbol, name, asset.sector, asset.shariahFlag ? "shariah" : ""].filter(Boolean).join(" | "),
  });
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("zad-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
console.error(`${rows.length} rows from ${assets.length} exported symbols`, tally);
