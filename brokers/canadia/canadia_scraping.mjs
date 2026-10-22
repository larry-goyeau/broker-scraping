// Canadia Securities is a member of the Cambodia Securities Exchange
// (CSX) and trades its listed shares. Its home page has a "Listed
// Companies" card with three tabs: Main Board, Growth Board and Bond. The
// two share tabs print only the symbol and the price, so the name and the
// ISIN come from the CSX's own list of listed companies. Every share-tab
// symbol must be on that list, and every CSX company must be on a share
// tab, or the run stops. The Bond tab stays out. The CSX lists no ETF.
//
// The securities-trading page states the trading currency is the Khmer riel.
// Clients can deposit KHR or USD (FAQ), but a share is quoted only in KHR,
// so each title has one KHR row.
//
//   https://canasecurities.com.kh/
//   https://canasecurities.com.kh/securities-trading/
//   https://canasecurities.com.kh/brokerage-fee/
//   https://canasecurities.com.kh/faqs/
//   https://csx.com.kh/api/v1/website/company/stock/list-companies
//
//   node brokers/canadia/canadia_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BROKER = "https://canasecurities.com.kh/";
const CSX = "https://csx.com.kh/api/v1/website/company/stock/list-companies";
const BOARDS = { main: "Main Board", growth: "Growth Board" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

// The symbols of one tab of the card: the first cell of each body row.
function boardSymbols(html, board) {
  const start = html.indexOf(`id="cana-market-1-panel-${board}"`);
  if (start < 0) throw new Error(`broker page has no ${board} tab`);
  const end = html.indexOf("</tbody>", start);
  if (end < 0) throw new Error(`broker ${board} tab has no table`);
  const body = html.slice(start, end);
  return [...body.matchAll(/<tr>\s*<td[^>]*>\s*([A-Z0-9]{2,8})\s*<\/td>/g)].map((m) => m[1]);
}

const page = await get(BROKER, "text/html");
const boardOf = new Map();
for (const [board, label] of Object.entries(BOARDS)) {
  const symbols = boardSymbols(page, board);
  if (!symbols.length) throw new Error(`broker ${label} tab is empty`);
  for (const symbol of symbols) {
    if (boardOf.has(symbol)) throw new Error(`${symbol} is on two broker tabs`);
    boardOf.set(symbol, label);
  }
}
if (boardOf.size < 11) throw new Error(`broker card shows only ${boardOf.size} shares`);

await sleep(400);
const listing = JSON.parse(await get(CSX, "application/json"));
const companies = listing.data || [];
if (companies.length !== listing.totalRecords) throw new Error(`CSX announced ${listing.totalRecords}, sent ${companies.length}`);
if (companies.length < 11) throw new Error(`CSX list has ${companies.length} companies`);

const bySymbol = new Map(companies.map((company) => [String(company.symbolEn || "").trim(), company]));
const unknown = [...boardOf.keys()].filter((symbol) => !bySymbol.has(symbol));
if (unknown.length) throw new Error(`broker card shows shares not on the CSX list: ${unknown.join(" ")}`);
const missing = [...bySymbol.keys()].filter((symbol) => !boardOf.has(symbol));
if (missing.length) throw new Error(`CSX lists shares the broker card does not show: ${missing.join(" ")}`);

const rows = [...boardOf].map(([symbol, board]) => {
  const company = bySymbol.get(symbol);
  const name = String(company.nameEn || "").replace(/\s+/g, " ").trim();
  const isin = String(company.icode || "").trim().toUpperCase();
  if (!name) throw new Error(`no name for ${symbol}`);
  if (!/^KH[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`no ISIN for ${symbol}`);
  return {
    query: symbol,
    ticker: symbol,
    name,
    exchange: "Cambodia Securities Exchange",
    mic: "XCSX",
    currency: "KHR",
    type: "STOCK",
    isin,
    raw: [symbol, isin, name, board, `listed ${company.date}`].join(" | "),
  };
});

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("canadia-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} listings`, counts);
