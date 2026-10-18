// United Securities publishes a stock screener of every Dhaka Stock
// Exchange security it lets clients invest in, with no login.
//
// https://www.unitedsecurities.com.bd/invest-stocks/screener
//   "Stock Screener - All Stocks". The page is rendered by Next.js; the
//   whole table (ticker, company name, sector) is in the React payload of
//   that one page, ids 1..N with no gap. Each row links to an Invest page.
//   Shares are kept as STOCK and the "Mutual Fund" sector (listed
//   closed-end funds) as FUND. There are no bonds in this list and no ISIN.
//
//   node brokers/unitedsecurities/unitedsecurities_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.unitedsecurities.com.bd/invest-stocks/screener";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// The React payload is a list of JS string chunks pushed to self.__next_f.
function flightPayload(html) {
  let payload = "";
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    payload += JSON.parse(match[1]);
  }
  return payload;
}

// The array that follows `"rows":`, cut at its closing bracket.
function rowsArray(payload) {
  const start = payload.indexOf('{"rows":[');
  if (start < 0) throw new Error("screener rows not found");
  let depth = 0;
  let quoted = false;
  const from = start + '{"rows":'.length;
  for (let i = from; i < payload.length; i += 1) {
    const char = payload[i];
    if (quoted) {
      if (char === "\\") i += 1;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(payload.slice(from, i + 1));
    }
  }
  throw new Error("screener rows are cut");
}

const rows = rowsArray(flightPayload(await text(PAGE)));
const ids = rows.map((row) => Number(row.id)).sort((a, b) => a - b);
if (!rows.length || ids[0] !== 1 || ids.at(-1) !== rows.length) {
  throw new Error(`screener ids run ${ids[0]}..${ids.at(-1)} over ${rows.length} rows`);
}

const listings = [];
const seen = new Set();
for (const row of rows) {
  const ticker = String(row.ticker || "").trim().toUpperCase();
  if (!ticker || seen.has(ticker)) continue;
  seen.add(ticker);
  const name = String(row.name || ticker).replace(/\s+/g, " ").trim();
  const sector = String(row.sectorName || "").replace(/\s+/g, " ").trim();
  listings.push({
    query: ticker,
    ticker,
    name,
    exchange: "Dhaka Stock Exchange",
    mic: "XDHA",
    currency: "BDT",
    type: /^mutual fund$/i.test(sector) ? "FUND" : "STOCK",
    isin: "",
    raw: [ticker, name, "DSE", sector].filter(Boolean).join(" "),
  });
}

listings.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("unitedsecurities-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const written = withoutObligations(listings);
const counts = {};
for (const row of written) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${written.length} listings`, counts);
