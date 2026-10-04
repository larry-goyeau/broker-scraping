// What Vanguard UK sells in exchange-traded products, with no
// login. The public product list is the full range. A mutual fund is
// product type mf and is not here. There are no shares.
//
// Each row is one share class. The SEDOL printed on that row is the
// line to keep when London lists the class in two currencies. It is not
// always a London SEDOL: the FTSE 250 accumulating class carries the
// Mexican one, and then the single London line is kept. Quote and Deal
// and the bulk window both trade on the London Stock Exchange. The
// London TIDM is the ticker and the London currency is the trading
// currency.
//
// A line is an ETF unless its name says ETC or ETN.
//
//   https://www.vanguardinvestor.co.uk/what-we-offer/all-products
//   https://www.vanguardinvestor.co.uk/need-help/answer/what-price-will-i-get-when-i-buy-or-sell-a-fund
//
//   node brokers/vanguarduk/vanguarduk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const LIST = "https://www.vanguardinvestor.co.uk/api/productList";
const GRAPH = "https://www.vanguardinvestor.co.uk/gpx/graphql";
const OUTPUT = new URL("vanguarduk-parsed.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

const PROFILE = `
  portId
  fundFullName
  closedToAllPurchases
  listings {
    stockExchangeMarketIdentifierCode
    fundCurrency
    identifiers(altIds: ["SEDOL", "TIDM"]) { altId altIdValue }
  }
  identifiers(altIds: ["ISIN"]) { altId altIdValue }
`;

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function listingType(name) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

function idOf(list, name) {
  const hit = (list || []).find((item) => item?.altId === name && item.altIdValue);
  return hit ? String(hit.altIdValue).trim() : "";
}

async function productList() {
  const response = await fetch(LIST, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`Vanguard product list answered ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error("Vanguard product list is not a list");
  return body;
}

async function profiles(sedols) {
  const query = `query ($sedols: [String!]) { funds(sedols: $sedols) { profile { ${PROFILE} } } }`;
  const response = await fetch(GRAPH, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": UA,
      "X-Consumer-ID": "UKD",
    },
    body: JSON.stringify({ query, variables: { sedols } }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`Vanguard fund profiles answered ${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
  const funds = body.data?.funds;
  if (!Array.isArray(funds)) throw new Error("Vanguard fund profiles are missing");
  return funds.map((fund) => fund.profile);
}

const catalogue = await productList();
const classes = catalogue.filter((row) => row.productType === "etf");
const leftOut = catalogue.length - classes.length;
const sedols = classes.map((row) => String(row.sedol || "").trim()).filter(Boolean);
if (sedols.length !== classes.length) throw new Error("an ETF row has no SEDOL");

const byPort = new Map();
for (const profile of await profiles(sedols)) {
  if (!profile?.portId) throw new Error("a fund profile has no port id");
  if (byPort.has(profile.portId)) throw new Error(`port ${profile.portId} came back twice`);
  byPort.set(profile.portId, profile);
}

const seen = new Set();
const results = [];

for (const row of classes) {
  const profile = byPort.get(String(row.portId));
  const label = row.name || row.sedol;
  if (!profile) throw new Error(`${label} has no fund profile`);
  if (profile.closedToAllPurchases !== "Open") {
    throw new Error(`${label} is ${profile.closedToAllPurchases || "not open"}`);
  }
  const sedol = String(row.sedol || "").trim().toUpperCase();
  const london = (profile.listings || []).filter((listing) => listing.stockExchangeMarketIdentifierCode === "XLON");
  const named = london.filter((listing) => idOf(listing.identifiers, "SEDOL").toUpperCase() === sedol);
  const listing = named.length === 1 ? named[0] : london.length === 1 ? london[0] : null;
  if (!listing) throw new Error(`${label} has ${london.length} London listings and the list SEDOL is not one of them`);
  const name = String(profile.fundFullName || row.name || "").replace(/\s+/g, " ").trim();
  const isin = toIsin(idOf(profile.identifiers, "ISIN"));
  const ticker = idOf(listing.identifiers, "TIDM").toUpperCase();
  const currency = String(listing.fundCurrency || "").trim().toUpperCase();
  if (!name || !isin || !ticker || !currency) {
    throw new Error(`${label} is missing a name, an ISIN, a ticker or a currency`);
  }
  const type = listingType(name);
  const key = `${isin}:XLON:${ticker}:${currency}:${type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push({
    query: isin,
    ticker,
    name,
    exchange: "XLON",
    currency,
    type,
    isin,
    raw: [ticker, name, "XLON", currency, isin].filter(Boolean).join(" "),
  });
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(results)), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (leftOut ? `, left out ${leftOut} funds` : "")
);
