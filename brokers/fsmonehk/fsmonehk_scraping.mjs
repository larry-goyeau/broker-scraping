// What FSMOne HK sells in shares and exchange-traded funds, with no
// login. Two public lists. The stock screener, without the top-volume flag,
// is the share list. The active-ETF call is the ETF list: the selector page
// says it searches every ETF open for subscription on the platform.
//
// A share must be marked cash-tradable. An ETF whose buy flag is N, or whose
// display flag is N, stays out. A buy flag left blank stays: the line is
// still on the active list. A share that is also in the ETF list is the ETF,
// once. A name that says ETN or ETC is that type. Anything else on the ETF
// list stays an ETF.
//
// The ETF row prints an ISIN. A share does not, so the code is the one the
// other catalogues already agree on for the same venue and ticker.
//
//   https://www.fsmglobal.hk/stocks/tools/stocks-selector
//   https://www.fsmglobal.hk/etfs/tools/etfs-selector
//   https://www.fsmglobal.hk/fsmmobilev2/web-api/stock/stock-info/stock-screener-v3
//   https://www.fsmglobal.hk/fsmmobilev2/web-api/etf/find-list-of-active-etfs
//
//   node brokers/fsmonehk/fsmonehk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const ORIGIN = "https://www.fsmglobal.hk";
const STOCKS = `${ORIGIN}/fsmmobilev2/web-api/stock/stock-info/stock-screener-v3`;
const ETFS = `${ORIGIN}/fsmmobilev2/web-api/etf/find-list-of-active-etfs`;
const PAGE = 2000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function post(url, body) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Content-Type": "application/json",
          Referer: `${ORIGIN}/stocks/tools/stocks-selector`,
          Origin: ORIGIN,
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const payload = await response.json();
      if (payload.status && payload.status !== "SUCCESS") {
        throw new Error(`${payload.status} ${url}`);
      }
      return payload;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

async function loadShares() {
  const rows = [];
  let page = 1;
  let total = Infinity;
  while (rows.length < total) {
    const payload = await post(
      `${STOCKS}?page=${page}&size=${PAGE}&sortDesc=false&sortField=stockCode&isTopList=false`,
      {}
    );
    const data = payload.data || {};
    const batch = data.results;
    total = Number(data.count);
    if (!Array.isArray(batch) || batch.length === 0) break;
    if (!Number.isFinite(total) || total <= 0) throw new Error("Hong Kong share list did not say how many rows it has");
    rows.push(...batch);
    page += 1;
  }
  if (rows.length !== total) throw new Error(`Hong Kong announced ${total} shares and returned ${rows.length}`);
  return rows;
}

async function loadEtfs() {
  const payload = await post(ETFS, {});
  const rows = payload.data;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Hong Kong ETF list returned no rows");
  return rows;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function tickerKey(value) {
  const text = String(value || "").trim().toUpperCase().split(/[ .]/)[0];
  return /^\d{1,6}$/.test(text) ? text.padStart(6, "0") : text;
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function isinBook() {
  const book = new Map();
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "fsmonehk") continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const isin = isinOf(row.isin);
      const ticker = tickerKey(row.ticker);
      const { venue } = resolveVenue(row);
      if (!isin || !ticker || !venue) continue;
      const key = `${venue.mic}|${ticker}`;
      if (!book.has(key)) book.set(key, new Set());
      book.get(key).add(isin);
    }
  }
  return book;
}

const isins = isinBook();

function joined(exchange, ticker, currency) {
  const { venue } = resolveVenue({ exchange, currency });
  if (!venue) return { isin: "" };
  const code = tickerKey(ticker);
  const ids = isins.get(`${venue.mic}|${code}`);
  if (!ids || ids.size === 0) return { isin: "" };
  if (ids.size === 1) return { isin: [...ids][0] };
  const held = { ticker: code };
  stampIsinMatches(held, new Map([[venue.mic, ids]]), code);
  return { isin: "", matches: held.matches };
}

function listingType(name) {
  if (/\bETNs?\b/i.test(name) || /exchange-traded notes/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

const shares = await loadShares();
const funds = await loadEtfs();
console.error(`${shares.length} shares announced, ${funds.length} active ETFs`);

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const etfKeys = new Set();
const results = [];

for (const row of funds) {
  const exchange = clean(row.exchange).toUpperCase();
  const ticker = clean(row.stockCode).toUpperCase();
  const name = clean(row.etfName || row.etfFullName);
  if (!exchange || !ticker) throw new Error(`unread ETF ${row.stockCode} @ ${row.exchange}`);
  if (row.display === "N") {
    skip("not displayed");
    continue;
  }
  if (row.buyEnabled === "N") {
    skip("buy closed");
    continue;
  }
  const currency = clean(row.tradingCurrency || row.currency).toUpperCase();
  if (!currency) {
    skip("no currency");
    continue;
  }
  const type = listingType(name);
  const printed = isinOf(row.isinCode);
  etfKeys.add(`${exchange}:${ticker}`);
  results.push({
    query: ticker,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, printed, type].filter(Boolean).join(" "),
    ...(printed ? { isin: printed } : joined(exchange, ticker, currency)),
  });
}

for (const row of shares) {
  const exchange = clean(row.exchange).toUpperCase();
  const ticker = clean(row.stockCode).toUpperCase();
  const name = clean(row.stockFullName || row.stockName);
  if (!exchange || !ticker) throw new Error(`unread share ${row.stockCode} @ ${row.exchange}`);
  if (row.cashEnabled !== "Y") {
    skip("cash disabled");
    continue;
  }
  if (etfKeys.has(`${exchange}:${ticker}`)) {
    skip("also an ETF");
    continue;
  }
  const currency = clean(row.currency).toUpperCase();
  if (!currency) {
    skip("no currency");
    continue;
  }
  results.push({
    query: ticker,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type: "STOCK",
    raw: [ticker, name, exchange, currency, "STOCK"].filter(Boolean).join(" "),
    ...joined(exchange, ticker, currency),
  });
}

const seen = new Set();
const unique = [];
for (const row of results) {
  const key = `${row.ticker}:${row.exchange}:${row.type}`;
  if (seen.has(key)) {
    skip("duplicate");
    continue;
  }
  seen.add(key);
  unique.push(row);
}
unique.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(
  new URL("fsmonehk-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(unique)), null, 2)
);

const byType = new Map();
for (const row of unique) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const instruments = new Set(unique.map((row) => row.isin || `${row.type}:${row.ticker}:${row.exchange}`)).size;
const withIsin = unique.filter((row) => row.isin).length;
console.error(
  `${unique.length} listings over ${instruments} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ${withIsin} with an ISIN` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
