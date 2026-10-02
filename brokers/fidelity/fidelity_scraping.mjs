// What Fidelity Personal Investing sells in shares and exchange-traded
// products, with no login. The Investment Finder reads two Morningstar
// universes that the public page names itself. Funds and investment trusts
// are other universes and are not here. Gilts and corporate bonds are not
// sold.
//
// A share row is a stock. An exchange-traded row is an ETF unless its name
// says ETC or ETN. The coin is not sold: Personal Investing has said the
// crypto note is not on this platform yet. A bitcoin line that is already
// in the exchange-traded universe stays, as an ETC or an ETF, whichever
// the name says.
//
// The place is the exchange Morningstar prints. An overseas share is dealt
// as a sterling CDI, so the order does not go to that exchange. The
// currency on the row is the listing currency, not the sterling settlement.
// The finder has no flag for a name that has stopped trading, so those
// lines stay. A second place for the same ISIN stays too.
//
//   https://www.fidelity.co.uk/planning-guidance/investment-finder/
//   https://www.fidelity.co.uk/international-shares/
//   https://www.fidelity.co.uk/forwardpricing/
//
//   node brokers/fidelity/fidelity_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const SCREEN = "https://lt.morningstar.com/api/rest.svc/9vehuxllxs/security/screener";
const SHARES = "E0WWE$$ALL_3520";
const LISTED = "ETEXG$XLON_3518|ETALL$$ALL_3518";
const OUTPUT = new URL("fidelity-parsed.json", import.meta.url);
const PAGE = 1000;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// Morningstar's code, then the name this repository already resolves.
// A code that is already an alias is not in here.
const PLACE = {
  OHEL: "XHEL",
  DUB: "XDUB",
  STU: "XSTU",
  TBSX: "XSTU",
  WBO: "XWBO",
};

const POINTS = ["Name", "isin", "ticker", "exchangeCode", "Currency", "HoldingType"].join("|");

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function placeOf(code) {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return "";
  return PLACE[key] || key;
}

function listingType(holding, name) {
  if (holding === "Stock") return "STOCK";
  if (holding !== "ETF") return "";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

async function loadUniverse(universeId) {
  const rows = [];
  for (let page = 1; page < 20; page += 1) {
    const url = new URL(SCREEN);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE));
    url.searchParams.set("sortOrder", "Name asc");
    url.searchParams.set("outputType", "json");
    url.searchParams.set("version", "1");
    url.searchParams.set("languageId", "en-GB");
    url.searchParams.set("currencyId", "GBP");
    url.searchParams.set("securityDataPoints", POINTS);
    url.searchParams.set("universeIds", universeId);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(40_000),
    });
    if (!response.ok) throw new Error(`Fidelity finder answered ${response.status} for ${universeId}`);
    const body = await response.json();
    const batch = Array.isArray(body.rows) ? body.rows : [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const seen = new Set();
const results = [];

for (const universeId of [SHARES, LISTED]) {
  const batch = await loadUniverse(universeId);
  console.error(`${batch.length} rows in ${universeId}`);
  for (const row of batch) {
    const name = String(row.Name || "").replace(/\s+/g, " ").trim();
    const holding = String(row.HoldingType || "");
    const type = listingType(holding, name);
    if (!type) {
      skip(holding ? holding : "no type");
      continue;
    }
    const exchange = placeOf(row.exchangeCode);
    if (!exchange) {
      skip("no venue");
      continue;
    }
    const isin = toIsin(row.isin);
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!isin && !ticker) {
      skip("no identifier");
      continue;
    }
    const currency = String(row.Currency || "").trim().toUpperCase() || null;
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

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(results), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin).filter(Boolean)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
