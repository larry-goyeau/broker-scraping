// Levler's public shop lists every stock and ETF it sells, with no login.
// The same call also returns funds, leverage certificates and indices; the
// type field keeps those out. Tracker certificates are the Virtune crypto
// ETPs, so they stay. Levler does not sell the coin itself. Each line carries
// the ISIN and the MIC. The ticker is not on the list, so it is read from
// the order-book page.
//
// Stockholm and First North are the whole market. The foreign lines are a
// selection, and that selection is the whole offering: Nasdaq, NYSE, Xetra,
// Amsterdam, Copenhagen and Oslo. isAmountOrderBuyable only says whether an
// order can be placed in kronor, so it is not used. buyable is.
// Paid subscription lines (BTA, BTU) sit in the share list. They are not
// ordinary shares. A bond that is not an ETF is not a share either.
//
//   node brokers/levler/levler_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const SEARCH = "https://levler.se/api/open/search/v2/orderBooks";
const DETAIL = "https://levler.se/api/open/orderbook/orderbook";
const PAGE = 500;
const BATCH = 100;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function listingType(kind, name) {
  if (kind === "EXCHANGE_TRADED_FUND") return /\bETCs?\b/i.test(name) ? "ETC" : "ETF";
  if (kind === "TRACKER_CERTIFICATE") return "ETP";
  if (kind === "SHARE") return "STOCK";
  return "";
}

// A listed bond ETF stays. A bond sitting in the share list does not.
function bondShare(kind, name) {
  return kind === "SHARE" && /\b(obligation|obligationslån|bond|gilt|treasury)s?\b/i.test(name);
}

function keyOf(book) {
  return `${book.isin}|${book.mic}|${book.currency}`;
}

async function post(url, body) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-client-id": "web",
          Origin: "https://levler.se",
        },
        body: JSON.stringify(body),
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

async function loadList() {
  const rows = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const page = await post(SEARCH, {
      orderBookTypes: ["SHARE", "EXCHANGE_TRADED_FUND", "TRACKER_CERTIFICATE"],
      numberOfHits: PAGE,
      offset,
    });
    const batch = Array.isArray(page.results) ? page.results : [];
    total = Number(page.totalHits) || 0;
    if (batch.length === 0) break;
    rows.push(...batch);
    offset += batch.length;
  }
  return rows;
}

async function loadDetails(keys) {
  const found = new Map();
  for (let index = 0; index < keys.length; index += BATCH) {
    const slice = keys.slice(index, index + BATCH);
    const page = await post(DETAIL, { orderBookKeys: slice });
    for (const book of page.orderBooks || []) {
      const id = book.orderBookKey || {};
      const isin = toIsin(id.isin);
      const mic = String(id.mic || "").trim().toUpperCase();
      const currency = String(id.currencyCode || "").trim().toUpperCase();
      if (!isin || !mic) continue;
      found.set(keyOf({ isin, mic, currency }), book);
    }
  }
  return found;
}

const listed = await loadList();
if (listed.length === 0) throw new Error("Levler returned no stocks or ETFs");
console.error(`${listed.length} stocks and ETFs on the Levler list`);

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const wanted = [];
for (const row of listed) {
  const kind = String(row.orderBookType || "");
  const name = String(row.name || "").replace(/\s+/g, " ").trim();
  const segment = String(row.segmentV2?.displayName || row.segment || "").trim();
  const book = row.orderBookKey || {};
  const isin = toIsin(book.isin);
  const mic = String(book.mic || "").trim().toUpperCase();
  const currency = String(book.currencyCode || "").trim().toUpperCase();
  if (segment === "RIGHTS ETC." || /\bBT[AU]( [AB])?$/.test(name)) {
    skip("subscription share");
    continue;
  }
  if (bondShare(kind, name)) {
    skip("bond");
    continue;
  }
  if (!listingType(kind, name)) {
    skip("not a stock or ETF");
    continue;
  }
  if (!isin) {
    skip("no ISIN");
    continue;
  }
  if (!mic) {
    skip("no venue");
    continue;
  }
  wanted.push({ kind, name, isin, mic, currency });
}

const details = await loadDetails(
  wanted.map((row) => ({ isin: row.isin, currencyCode: row.currency, mic: row.mic }))
);

const seen = new Set();
const results = [];
for (const row of wanted) {
  const detail = details.get(keyOf(row));
  if (!detail) {
    skip("no page");
    continue;
  }
  if (detail.buyable === false) {
    skip("not for sale");
    continue;
  }
  const ticker = String(detail.symbol || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  const type = listingType(row.kind, row.name);
  const id = `${row.isin}:${row.mic}:${ticker}:${row.currency}:${type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  results.push({
    query: row.isin,
    ticker,
    name: row.name || ticker,
    exchange: row.mic,
    currency: row.currency || null,
    type,
    raw: [ticker, row.name, row.mic, row.currency, row.isin].filter(Boolean).join(" "),
    isin: row.isin,
  });
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(
  new URL("levler-parsed.json", import.meta.url),
  JSON.stringify(stampRows(results), null, 2)
);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
