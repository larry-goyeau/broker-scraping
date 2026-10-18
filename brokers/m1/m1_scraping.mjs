// M1 runs one public GraphQL endpoint that answers without a login. Its
// security screener, filtered to ACTIVE, returns every stock and every fund
// M1 lets a client buy. The total matches viewer.activeSecuritySymbols and
// the 5,700 "Invest in X on M1" pages in the public sitemap. Those pages
// also render for OTC and delisted names M1 does not trade, so the page
// alone is not used: only the ACTIVE status is.
//
//   https://lens.m1.com/graphql  (viewer.screenSecurities, viewer.activeSecuritySymbols)
//   https://pages.m1.com/sitemap-securities.xml
//
// EQUITY_SECURITY is kept as STOCK. A FUND_SECURITY is an ETF when its issue
// type is EXCHANGE_TRADED_FUND or OTHER (new ETFs and ETNs carry OTHER) or
// its name says ETF; an ETN when the name says so; else (closed-end funds,
// issue type COMMON_STOCK or CLOSED_END_FUND) a FUND. M1 does not publish ISINs.
//
//   node brokers/m1/m1_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const API = "https://lens.m1.com/graphql";
const PAGE = 100;

const MIC = {
  "New York Stock Exchange": "XNYS",
  "NYSE American": "XASE",
  "NYSE Arca": "ARCX",
  "Nasdaq Global Select": "XNAS",
  "NASDAQ Global Select": "XNAS",
  "NASDAQ Global Market": "XNAS",
  "Nasdaq Global Market": "XNAS",
  "NASDAQ Capital Market": "XNAS",
  "Nasdaq Capital Market": "XNAS",
  "CBOE Global Markets BZX": "BATS",
};

const SCREEN = `query Screen($after: String, $first: Int) {
  viewer {
    screenSecurities(first: $first, after: $after, filterTypes: [EQUITY, FUND], filterStatuses: [ACTIVE]) {
      total
      pageInfo { hasNextPage endCursor }
      edges { node { symbol name status market type profile { issueType } } }
    }
  }
}`;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphql(query, variables = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://pages.m1.com",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
        return body.data;
      }
      last = `${response.status} ${API}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const active = (await graphql("{ viewer { activeSecuritySymbols } }")).viewer.activeSecuritySymbols;
if (!Array.isArray(active) || active.length < 3000) throw new Error(`activeSecuritySymbols returned ${active?.length}`);

const nodes = [];
let after = null;
let total = 0;
for (let page = 0; ; page += 1) {
  if (page > 200) throw new Error("screener did not end");
  const screen = (await graphql(SCREEN, { first: PAGE, after })).viewer.screenSecurities;
  if (!total) total = screen.total;
  for (const edge of screen.edges || []) nodes.push(edge.node);
  if (!screen.pageInfo.hasNextPage) break;
  after = screen.pageInfo.endCursor;
  await sleep(150);
}
if (nodes.length !== total) throw new Error(`screener announced ${total} and returned ${nodes.length}`);

const rows = [];
const seen = new Set();
const unknown = new Set();
for (const node of nodes) {
  if (node.status !== "ACTIVE") continue;
  const ticker = normalize(node.symbol);
  if (!ticker || seen.has(ticker)) continue;
  seen.add(ticker);
  const exchange = normalize(node.market);
  const mic = MIC[exchange];
  if (!mic) unknown.add(exchange);
  const issue = node.profile?.issueType || "";
  let type = "STOCK";
  if (node.type === "FUND_SECURITY") {
    if (/\bETN\b/i.test(node.name)) type = "ETN";
    else if (issue === "EXCHANGE_TRADED_FUND" || issue === "OTHER" || /\bETF\b/i.test(node.name)) type = "ETF";
    else type = "FUND";
  }
  const name = normalize(node.name);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange,
    ...(mic ? { mic } : {}),
    currency: "USD",
    type,
    isin: "",
    raw: [ticker, name, exchange, node.type, issue].filter(Boolean).join(" | "),
  });
}

const missing = active.filter((symbol) => !seen.has(symbol));
if (missing.length > active.length * 0.01) throw new Error(`${missing.length} active symbols are not in the screener`);
if (unknown.size) console.error(`no MIC for: ${[...unknown].join(", ")}`);

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("m1-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
console.error(`${rows.length} rows (${active.length} active symbols, ${missing.length} not in the screener)`);
