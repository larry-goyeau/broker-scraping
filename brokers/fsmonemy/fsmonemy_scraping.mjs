// What FSMOne Malaysia (iFAST Capital Sdn. Bhd.) sells in shares and
// exchange-traded funds, with no login. One public list per place the
// trade screen prices: the security-type call. The stock and ETF
// selectors are filters on that list, not a second catalogue. US OTC is
// on the same call and comes back ready to trade, even though the
// selector leaves it out.
//
// A line whose ready flag is not Y stays out. A warrant (WTS) stays out.
// A line whose name says it is not tradable stays out. A Bursa code
// ending MM stays out: it is the structured-warrant board copy of the
// Main board share, the same ISIN, and it has no quote. An ETF whose
// name says ETN or ETC is that type. Anything else on the ETF rows stays
// an ETF. The row prints an ISIN when it has one. A blank ISIN is the
// code the other catalogues already agree on for the same venue and ticker.
//
//   https://www.fsmone.com.my/stocks/tools/stocks-screener
//   https://www.fsmone.com.my/rest/stock/stock-data/security-type/read
//
//   node brokers/fsmonemy/fsmonemy_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const ORIGIN = "https://www.fsmone.com.my";
const LIST = `${ORIGIN}/rest/stock/stock-data/security-type/read`;
const REFERER = `${ORIGIN}/stocks/tools/stocks-screener`;
// The server returns at most 2000 rows, and the page number is the start
// index of a stock-code sort. Page 0 is a different slice, so the walk
// starts at 1 and steps by the rows just received.
const PAGE = 2000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Places the app itself prices. USOTC is absent from the selector and
// present on a factsheet whose ready flag is Y.
const EXCHANGES = ["KLSE", "SGX", "HKEX", "NASDAQ", "NYSE", "AMEX", "BATS", "SSE", "SZSE", "LSE", "USOTC"];

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.slice("--limit=".length)) : 0;

async function post(url) {
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
          Referer: REFERER,
          Origin: ORIGIN,
        },
        body: "{}",
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok || !text.startsWith("{")) throw new Error(`${response.status} ${url}`);
      const payload = JSON.parse(text);
      if (payload.status && payload.status !== "SUCCESS") throw new Error(`${payload.status} ${url}`);
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

async function loadExchange(exchange) {
  const rows = [];
  const seen = new Set();
  let page = 1;
  let total = 0;
  while (true) {
    const payload = await post(
      `${LIST}?page=${page}&size=${PAGE}&exchange=${exchange}&lastPrice=false&sort=stockCode,asc`
    );
    const data = payload.data || {};
    const batch = data.result;
    total = Number(data.totalCounts);
    if (!Array.isArray(batch)) throw new Error(`${exchange} page ${page} returned no list`);
    if (!Number.isFinite(total) || total <= 0) throw new Error(`${exchange} did not say how many rows it has`);
    let fresh = 0;
    for (const row of batch) {
      const id = row.tickerNo;
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      fresh += 1;
    }
    if (batch.length === 0 || batch.length < PAGE) break;
    if (fresh === 0) throw new Error(`${exchange} page ${page} repeated rows already kept`);
    page += batch.length;
    if (LIMIT && rows.length >= LIMIT) break;
  }
  if (!LIMIT && rows.length < total - 25) {
    throw new Error(`${exchange} announced ${total} rows and returned ${rows.length}`);
  }
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
    if (path.basename(path.dirname(file)) === "fsmonemy") continue;
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

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const fetched = [];
for (const exchange of EXCHANGES) {
  const rows = await loadExchange(exchange);
  console.error(`${exchange}: ${rows.length}`);
  fetched.push(...rows);
}

const etfKeys = new Set();
const results = [];

const ordered = [
  ...fetched.filter((row) => row.securityType === "ETF"),
  ...fetched.filter((row) => row.securityType !== "ETF"),
];

for (const row of ordered) {
  const exchange = clean(row.exchange).toUpperCase();
  const ticker = clean(row.stockCode).toUpperCase();
  const name = clean(row.stockFullName || row.stockName);
  if (!exchange || !ticker) throw new Error(`unread row ${row.stockCode} @ ${row.exchange}`);
  if (row.readyMarket !== "Y") {
    skip("not ready");
    continue;
  }
  if (row.securityType === "WTS") {
    skip("warrant");
    continue;
  }
  if (row.securityType !== "COMMON_STOCK" && row.securityType !== "ETF") {
    skip(`type ${row.securityType || "blank"}`);
    continue;
  }
  // The name is FSM's own: these lines stay on the list with readyMarket Y
  // and are not traded. A Bursa code ending MM is the structured-warrant
  // board copy of the Main board share: same ISIN, and the quote is empty.
  if (/non[- ]?trade?able/i.test(name)) {
    skip("not tradable");
    continue;
  }
  if (exchange === "KLSE" && ticker.endsWith("MM")) {
    skip("Bursa MM duplicate");
    continue;
  }
  const currency = clean(row.stockCurrency).toUpperCase();
  if (!currency) {
    skip("no currency");
    continue;
  }
  const type = row.securityType === "ETF" ? listingType(name) : "STOCK";
  const key = `${exchange}:${ticker}`;
  if (type !== "STOCK") etfKeys.add(key);
  else if (etfKeys.has(key)) {
    skip("also an ETF");
    continue;
  }
  const printed = isinOf(row.isin);
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

if (!LIMIT) {
  const apple = unique.find((row) => row.exchange === "NASDAQ" && row.ticker === "AAPL");
  const motorola = unique.find((row) => row.exchange === "NYSE" && row.ticker === "MSI");
  const maybank = unique.find((row) => row.exchange === "KLSE" && row.ticker === "1155");
  const otc = unique.find((row) => row.exchange === "USOTC" && row.ticker === "MSIU");
  if (!apple || apple.isin !== "US0378331005") throw new Error("Apple was not on Nasdaq");
  if (!motorola || motorola.isin !== "US6200763075") throw new Error("Motorola was not on NYSE");
  if (!maybank) throw new Error("Maybank was not on Bursa");
  if (!otc) throw new Error("the OTC factsheet was not on the list");
  if (unique.length < 20000) throw new Error(`only ${unique.length} listings, the list looks truncated`);
}

fs.writeFileSync(
  new URL("fsmonemy-parsed.json", import.meta.url),
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
