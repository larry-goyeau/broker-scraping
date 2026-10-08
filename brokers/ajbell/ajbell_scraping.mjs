// What the AJ Bell screener lists in shares and exchange-traded products,
// with no login. Funds and investment trusts are other screens and are
// not here.
//
//   Equity    https://www.ajbell.co.uk/market-research/screener/shares
//   ETF       https://www.ajbell.co.uk/market-research/screener/etf
//
// The shares screen is the Equity type. The ETF screen is the ETF type.
// A row there is an ETF unless the name or the legal structure says ETC
// or ETN. London, Aquis and Chi-X keep the MIC: that book is the quote.
// Any other line is stored as "CDI" plus the MIC. The online order is a
// sterling CDI, so the foreign book and the American NBBO are not the
// spread. The currency stays the listing currency.
//
//   node brokers/ajbell/ajbell_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SCREEN = "https://www.ajbell.co.uk/market-research/api/screener";
const OUTPUT = new URL("ajbell-parsed.json", import.meta.url);
const PAGE = 2000;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// Exchange codes the screener prints when the MIC cell is empty.
const PLACE = {
  OSTO: "XSTO",
  OCSE: "XCSE",
  TBSX: "XSTU",
  WBO: "XWBO",
};

const SHELVES = [
  { screenerType: "Equity", floor: 15000 },
  { screenerType: "ETF", floor: 4500 },
];

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

const BOOK = new Set(["XLON", "LSE", "AQSE", "CHIX"]);

function placeOf(row) {
  const mic = String(row.MIC || "").trim().toUpperCase();
  const code = String(row.ExchangeCode || "").trim().toUpperCase();
  const place = mic || PLACE[code] || code;
  if (!place || BOOK.has(place)) return place;
  return `CDI ${place}`;
}

function listingType(shelf, row) {
  if (shelf === "Equity") return "STOCK";
  const name = String(row.name || "");
  const legal = String(row.LegalStructureName || "");
  if (/uncollateral/i.test(legal) || /\bETNs?\b/i.test(name)) return "ETN";
  if (/collateralized debt/i.test(legal) || /\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

async function loadShelf(screenerType) {
  const rows = [];
  let total = null;
  for (let page = 1; page < 30; page += 1) {
    const response = await fetch(SCREEN, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://www.ajbell.co.uk",
        Referer: "https://www.ajbell.co.uk/market-research/screener/shares",
      },
      body: JSON.stringify({
        screenerType,
        rowsPerPage: PAGE,
        currentPage: page,
        search: "",
        sortOrder: "Name asc",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`AJ Bell screener answered ${response.status} for ${screenerType}`);
    const body = await response.json();
    total = body.total;
    const batch = Array.isArray(body.rows) ? body.rows : [];
    rows.push(...batch);
    if (!batch.length || rows.length >= total) break;
  }
  if (rows.length !== total) throw new Error(`${screenerType}: ${rows.length} rows, screener says ${total}`);
  return rows;
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];

for (const shelf of SHELVES) {
  const batch = await loadShelf(shelf.screenerType);
  console.error(`${batch.length} rows in ${shelf.screenerType}`);
  if (batch.length < shelf.floor) throw new Error(`${shelf.screenerType} returned ${batch.length}, expected at least ${shelf.floor}`);
  for (const row of batch) {
    const name = String(row.name || "").replace(/\s+/g, " ").trim();
    const type = listingType(shelf.screenerType, row);
    const exchange = placeOf(row);
    if (!exchange) {
      skip("no venue");
      continue;
    }
    const isin = toIsin(row.isin);
    const ticker = String(row.Symbol || "").trim().toUpperCase();
    if (!isin && !ticker) {
      skip("no identifier");
      continue;
    }
    const currency = String(row.currency || "").trim().toUpperCase() || null;
    const key = `${isin}:${exchange}:${ticker}:${currency || ""}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      query: isin || ticker,
      ticker: ticker || isin,
      name: name || ticker || isin,
      exchange,
      currency,
      type,
      isin: isin || null,
      raw: [ticker, name, exchange, currency, isin].filter(Boolean).join(" "),
    });
  }
}

const listed = new Map();
for (const file of [new URL("../../assets/stocks.csv", import.meta.url), new URL("../../assets/etfs.csv", import.meta.url)]) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const cells = line.split(",");
    const code = String(cells[0] || "").trim().toUpperCase().split(":").pop();
    const exchange = String(cells[1] || "").trim().toUpperCase();
    const isin = toIsin(cells[2]);
    if (!code || !exchange || !isin) continue;
    if (!listed.has(code)) listed.set(code, new Map());
    const book = listed.get(code);
    if (!book.has(exchange)) book.set(exchange, new Set());
    book.get(exchange).add(isin);
  }
}
for (const row of results) {
  if (row.isin) continue;
  const places = row.exchange === "XLON" || row.exchange === "LSE" ? ["LSE", "LSE_SETS", "LSE_SEAQ", "LSIN", "XLON"] : [row.exchange];
  const groups = new Map();
  const book = listed.get(row.ticker);
  for (const place of places) {
    const ids = book?.get(place);
    if (ids?.size) groups.set(place, ids);
  }
  const only = stampIsinMatches(row, groups, row.ticker);
  if (only) {
    row.isin = only;
    if (!row.query || row.query === row.ticker) row.query = only;
  }
}

if (!results.some((row) => row.ticker === "AAPL" && row.exchange === "CDI XNAS" && row.type === "STOCK")) {
  throw new Error("Apple is missing from the share screen");
}
if (!results.some((row) => row.exchange === "XLON" && row.type === "ETF")) {
  throw new Error("the ETF screen has no London fund");
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const kept = stampRows(withoutObligations(results));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin).filter(Boolean)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
