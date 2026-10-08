// What Bestinvest sells online in shares and ETFs, with no login.
// The investment search is the full range the dealing page names.
// Funds and investment trusts are other types and are not here.
//
//   https://www.bestinvest.co.uk/v2/investment-search
//   https://www.bestinvest.co.uk/help/dealing
//
// A UK line is on the LSE platform, in pounds: the main market, AIM or
// Aquis. The row does not say which. The ticker is matched to the stock
// and ETF lists, and the place is kept only when that match is one board.
// A US line is a sterling CDI. The code says Nasdaq or NYSE when the
// ISIN has one American listing, and "CDI US" when it has several. The
// foreign book and the NBBO are not this quote.
//
//   node brokers/bestinvest/bestinvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SEARCH = "https://api.bi-digital.co.uk/search-assets/GetInvestmentAssetsResults";
// The key the public search page sends. It is not an account credential.
const CODE = "a1b2c3d4e5f6g7h8i9j0k";
const OUTPUT = new URL("bestinvest-parsed.json", import.meta.url);
const PAGE = 500;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

const LONDON = new Set(["LSE", "AQUIS", "LSE_SETS", "LSE_SEAQ"]);
const US = {
  NASDAQ: "XNAS",
  NYSE: "XNYS",
  AMEX: "XASE",
  ARCA: "ARCX",
  NYSEARCA: "ARCX",
  BATS: "BATS",
};

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function loadBooks() {
  const london = new Map();
  const america = new Map();
  for (const file of [new URL("../../assets/stocks.csv", import.meta.url), new URL("../../assets/etfs.csv", import.meta.url)]) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const cells = line.split(",");
      const ticker = String(cells[0] || "").trim().toUpperCase().split(":").pop();
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = toIsin(cells[2]);
      if (!ticker || !exchange || !isin) continue;
      if (LONDON.has(exchange)) {
        if (!london.has(ticker)) london.set(ticker, new Map());
        const book = london.get(ticker);
        if (!book.has(exchange)) book.set(exchange, new Set());
        book.get(exchange).add(isin);
      }
      const mic = US[exchange];
      if (mic) {
        if (!america.has(isin)) america.set(isin, new Set());
        america.get(isin).add(mic);
      }
    }
  }
  return { london, america };
}

function londonPlace(ticker, isin, london) {
  const book = london.get(ticker);
  if (!book) return "";
  const places = [...book.entries()]
    .filter(([, ids]) => ids.has(isin))
    .map(([exchange]) => (exchange === "AQUIS" ? "AQUIS" : "LSE"));
  const unique = [...new Set(places)];
  if (unique.length === 1) return unique[0];
  return "";
}

function listingType(kind, name) {
  if (kind === "share") return "STOCK";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

function tickerOf(code, american) {
  const text = String(code || "").trim().toUpperCase();
  if (american && text.endsWith("CDIUS")) return text.slice(0, -5);
  return text;
}

async function loadShelf(filter) {
  const rows = [];
  let total = null;
  for (let page = 1; page < 20; page += 1) {
    const url = new URL(SEARCH);
    url.searchParams.set("code", CODE);
    url.searchParams.set("query", "");
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE));
    url.searchParams.set("sortBy", "Name");
    url.searchParams.set("sortOrder", "asc");
    url.searchParams.set("filter", filter);
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Origin: "https://www.bestinvest.co.uk",
        Referer: "https://www.bestinvest.co.uk/v2/investment-search",
      },
      signal: AbortSignal.timeout(40_000),
    });
    if (!response.ok) throw new Error(`Bestinvest search answered ${response.status} for ${filter}`);
    const body = await response.json();
    total = body.totalHitsCount;
    const batch = Array.isArray(body.assets) ? body.assets : [];
    rows.push(...batch);
    if (!batch.length || rows.length >= total) break;
  }
  if (rows.length !== total) throw new Error(`${filter}: ${rows.length} rows, search says ${total}`);
  return rows;
}

const { london, america } = loadBooks();
const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}
const assumed = new Map();
function assume(reason) {
  assumed.set(reason, (assumed.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];

const shelves = [
  { filter: "InvestmentType eq 'Shares'", kind: "share", floor: 1100 },
  { filter: "InvestmentType eq 'ETFs'", kind: "etf", floor: 500 },
];

for (const shelf of shelves) {
  const batch = await loadShelf(shelf.filter);
  console.error(`${batch.length} rows in ${shelf.kind}`);
  const tradeable = batch.filter((row) => row.tradeable === 1);
  if (tradeable.length < shelf.floor) {
    throw new Error(`${shelf.kind} has ${tradeable.length} tradeable rows, expected at least ${shelf.floor}`);
  }
  for (const row of batch) {
    if (row.tradeable !== 1) {
      skip("not tradeable");
      continue;
    }
    const name = String(row.name || "").replace(/\s+/g, " ").trim();
    const isin = toIsin(row.isin);
    const code = String(row.investmentCodename || "").replace(/\0/g, "").trim().toUpperCase();
    const american = row.foreignStock === "CDI-US" || code.endsWith("CDIUS");
    if (row.foreignStock && row.foreignStock !== "CDI-US") {
      skip(String(row.foreignStock));
      continue;
    }
    const ticker = tickerOf(code, american);
    if (!isin && !ticker) {
      skip("no identifier");
      continue;
    }
    let exchange = "";
    let currency = "GBP";
    if (american) {
      currency = "USD";
      const mics = isin ? [...(america.get(isin) || [])] : [];
      exchange = mics.length === 1 ? `CDI ${mics[0]}` : "CDI US";
    } else {
      // The dealing page puts every pound line on the LSE platform. Aquis
      // is used when the lists name that board. A name the lists omit stays
      // on LSE, which is the board the page names for the rest.
      exchange = londonPlace(ticker, isin, london);
      if (!exchange) {
        exchange = "LSE";
        assume("LSE, board not in the lists");
      }
    }
    const type = listingType(shelf.kind, name);
    const key = `${isin}:${exchange}:${ticker}:${currency}:${type}`;
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

if (!results.some((row) => row.ticker === "AAPL" && row.exchange === "CDI XNAS" && row.type === "STOCK")) {
  throw new Error("Apple is missing from the US CDI lines");
}
if (!results.some((row) => row.ticker === "FOUR" && row.exchange === "LSE" && row.type === "STOCK")) {
  throw new Error("4imprint is missing from the London lines");
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
const byExchange = new Map();
for (const row of kept) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  byExchange.set(row.exchange, (byExchange.get(row.exchange) || 0) + 1);
}
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin).filter(Boolean)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "") +
    (assumed.size ? `; ${[...assumed].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
console.error([...byExchange].sort((a, b) => b[1] - a[1]).map(([exchange, count]) => `${count} ${exchange}`).join(", "));
