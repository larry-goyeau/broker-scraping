// What PayPay Securities sells online, with no login. Five public lists.
// A row with a code is kept. The section headings are not. Walgreens (WBA)
// is still marked for sale and is left out: it was delisted in August 2025.
//
// Japan has no venue on the row. The code is a Tokyo listing, stored as XTKS.
// America has no venue either. The stock and ETF lists supply it when the
// ticker has one American place, and the ISIN with it. Several places, and
// the line stays US: the page must not be told Nasdaq when PayPay did not
// say so. PayPay prints no ISIN of its own.
//
//   https://www.paypay-sec.co.jp/stock/list/data-stock.json
//   https://www.paypay-sec.co.jp/stock/list/data-etf.json
//   https://www.paypay-sec.co.jp/stock/list/data-reit.json
//   https://www.paypay-sec.co.jp/us-stock/list/data-us_stock.json
//   https://www.paypay-sec.co.jp/us-stock/list/data-us_etf.json
//
//   node brokers/paypay/paypay_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const LISTS = [
  { url: "https://www.paypay-sec.co.jp/stock/list/data-stock.json", market: "JP", type: "STOCK" },
  { url: "https://www.paypay-sec.co.jp/stock/list/data-etf.json", market: "JP", type: "ETF" },
  { url: "https://www.paypay-sec.co.jp/stock/list/data-reit.json", market: "JP", type: "REIT" },
  { url: "https://www.paypay-sec.co.jp/us-stock/list/data-us_stock.json", market: "US", type: "STOCK" },
  { url: "https://www.paypay-sec.co.jp/us-stock/list/data-us_etf.json", market: "US", type: "ETF" },
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// Delisted August 2025, still app_trade on in the US list.
const DELISTED = new Set(["WBA"]);

const CSV_TO_MIC = {
  NASDAQ: "XNAS",
  NYSE: "XNYS",
  AMEX: "ARCX",
  CBOE: "BATS",
};
const US_LISTED = new Set(Object.keys(CSV_TO_MIC));

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH",
  "THE", "CO", "TRUST", "ETF", "SHARES", "CLASS", "COMMON", "STOCK",
]);

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function listTicker(value) {
  return String(value || "").trim().toUpperCase().split(":").pop();
}

function nameTokens(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scraped, candidate) {
  const left = nameTokens(scraped);
  const right = nameTokens(candidate);
  if (left.length === 0 || right.length === 0) return 0;
  const used = new Set();
  let matched = 0;
  for (const token of left) {
    const index = right.findIndex((other, position) => !used.has(position) && tokensMatch(token, other));
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return matched / Math.max(left.length, right.length);
}

function loadIsins(csvPath, into) {
  if (!fs.existsSync(csvPath)) return into;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = listTicker(columns[0]);
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean) || "";
    if (!ticker || !isin) continue;
    const exchange = String(columns[1] || "").trim().toUpperCase();
    const name = columns.slice(3).join(",").trim();
    const bucket = into.get(ticker) || [];
    const existing = bucket.find((row) => row.isin === isin);
    if (existing) {
      if (exchange) existing.exchanges.add(exchange);
      if (name && !existing.names.includes(name)) existing.names.push(name);
    } else {
      bucket.push({
        isin,
        names: name ? [name] : [],
        exchanges: new Set(exchange ? [exchange] : []),
      });
      into.set(ticker, bucket);
    }
  }
  return into;
}

function tokyo(index, ticker) {
  const rows = (index.get(ticker) || []).filter((row) => row.exchanges.has("TSE"));
  const ids = [...new Set(rows.map((row) => row.isin))];
  if (ids.length === 1) return { isin: ids[0], matches: undefined };
  const held = { ticker };
  if (ids.length > 1) stampIsinMatches(held, new Map([["TSE", new Set(ids)]]), ticker);
  return { isin: "", matches: held.matches };
}

function america(index, ticker, name) {
  const rows = (index.get(ticker) || []).filter((row) => [...row.exchanges].some((exchange) => US_LISTED.has(exchange)));
  const isins = [...new Set(rows.map((row) => row.isin))];
  if (isins.length === 1) return { isin: isins[0], place: placeOf(rows) };
  if (isins.length === 0) return { isin: "", place: "US" };
  const groups = new Map();
  for (const row of rows) {
    for (const exchange of row.exchanges) {
      if (!US_LISTED.has(exchange)) continue;
      if (!groups.has(exchange)) groups.set(exchange, new Set());
      groups.get(exchange).add(row.isin);
    }
  }
  const held = { ticker };
  const scored = rows.map((row) => ({
    isin: row.isin,
    venues: row.exchanges.size,
    score: Math.max(0, ...row.names.map((candidate) => nameScore(name, candidate))),
  }));
  const best = Math.max(...scored.map((row) => row.score));
  if (!(best >= 0.5)) {
    stampIsinMatches(held, groups, ticker);
    return { isin: "", place: "US", matches: held.matches };
  }
  const byIsin = new Map();
  for (const row of scored) {
    if (row.score !== best) continue;
    const prev = byIsin.get(row.isin);
    if (!prev || row.venues > prev.venues) byIsin.set(row.isin, row);
  }
  const winners = [...byIsin.values()];
  const most = Math.max(...winners.map((row) => row.venues));
  const popular = winners.filter((row) => row.venues === most);
  if (popular.length !== 1) {
    stampIsinMatches(held, groups, ticker);
    return { isin: "", place: "US", matches: held.matches };
  }
  const kept = rows.filter((row) => row.isin === popular[0].isin);
  return { isin: popular[0].isin, place: placeOf(kept) };
}

function placeOf(rows) {
  const mics = new Set();
  for (const row of rows) {
    for (const exchange of row.exchanges) {
      const mic = CSV_TO_MIC[exchange];
      if (mic) mics.add(mic);
    }
  }
  return mics.size === 1 ? [...mics][0] : "US";
}

async function getJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

const isins = loadIsins(new URL("../../assets/etfs.csv", import.meta.url), new Map());
loadIsins(new URL("../../assets/stocks.csv", import.meta.url), isins);

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];

for (const list of LISTS) {
  const body = await getJson(list.url);
  if (!Array.isArray(body)) throw new Error(`PayPay ${list.url} returned no list`);
  for (const row of body) {
    const ticker = String(row.codenumber ?? "").trim().toUpperCase();
    if (!ticker) {
      skip("heading");
      continue;
    }
    if (DELISTED.has(ticker)) {
      skip("delisted");
      continue;
    }
    if (row.app_trade && row.app_trade !== "on") {
      skip("not for sale");
      continue;
    }
    const name = String(row.brand || "").replace(/\s+/g, " ").trim() || ticker;
    const japan = list.market === "JP";
    const found = japan ? { ...tokyo(isins, ticker), place: "XTKS" } : america(isins, ticker, name);
    const currency = japan ? "JPY" : "USD";
    const id = `${found.isin || ticker}:${found.place}:${currency}:${list.type}`;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({
      query: ticker,
      ticker,
      name,
      exchange: found.place,
      currency,
      type: list.type,
      raw: [ticker, name, found.place, currency, found.isin].filter(Boolean).join(" "),
      isin: found.isin,
      ...(found.matches ? { matches: found.matches } : {}),
    });
  }
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker, "en", { numeric: true });
});

fs.writeFileSync(
  new URL("paypay-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(results)), null, 2)
);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const equities = results.filter((row) => row.type !== "CRYPTO");
const named = equities.filter((row) => row.isin).length;
const unplaced = results.filter((row) => row.exchange === "US").length;
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    `, ISIN on ${named} of ${equities.length}` +
    (unplaced ? `, ${unplaced} US without a place` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
