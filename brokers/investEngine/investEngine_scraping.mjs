// InvestEngine's public range, with no login. The investments page carries the
// whole list: every line is visible and, unless flagged sell-only, for sale.
// A sell-only line stays out.
//
// The type field is the asset class (STOCK, BOND, ALTERNATIVE), not the
// product. InvestEngine sells no shares. A bond line is still a UCITS ETF.
// A line titled ETC is an ETC. WisdomTree's physical metals omit that word;
// a UCITS ETF that merely says Physical stays an ETF.
//
// The execution policy sends every order to Winterflood Securities Ltd.
// InvestEngine trades only ETFs listed on the London Stock Exchange, and
// the account deals in sterling, so the book is XLON in GBP.
// base_currency on the page is the fund currency, not the listing.
//
//   https://investengine.com/etfs/all/
//   https://investengine.com/order-execution-policy/
//
//   node brokers/investEngine/investEngine_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const PAGE = "https://investengine.com/etfs/all/";
const EXCHANGE = "XLON";
const CURRENCY = "GBP";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function tickerOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{1,12}$/.test(text) ? text : "";
}

function listingType(name) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETPs?\b/i.test(name)) return "ETP";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (
    !/\bETFs?\b/i.test(name) &&
    /\bphysical\b/i.test(name) &&
    /\b(gold|silver|platinum|palladium|precious metals)\b/i.test(name)
  ) {
    return "ETC";
  }
  return "ETF";
}

async function loadPage() {
  const response = await fetch(PAGE, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`InvestEngine answered ${response.status}`);
  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
  if (!match) throw new Error("InvestEngine page had no catalogue");
  const securities = JSON.parse(match[1])?.props?.pageProps?.defaultSecurities;
  if (!Array.isArray(securities)) throw new Error("InvestEngine catalogue was empty");
  return securities;
}

const securities = await loadPage();
const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];
for (const row of securities) {
  if (row?.is_sell_only === true) {
    skip("sell only");
    continue;
  }
  const isin = toIsin(row?.isin);
  if (!isin) {
    skip("no ISIN");
    continue;
  }
  const ticker = tickerOf(row?.ticker);
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  const name = String(row?.title || "").replace(/\s+/g, " ").trim();
  const type = listingType(name);
  const id = `${isin}:${EXCHANGE}:${ticker}:${CURRENCY}:${type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  results.push({
    query: isin,
    ticker,
    name: name || ticker,
    exchange: EXCHANGE,
    currency: CURRENCY,
    type,
    raw: [ticker, name, EXCHANGE, CURRENCY, isin].filter(Boolean).join(" "),
    isin,
  });
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(
  new URL("investEngine-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(results)), null, 2)
);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
