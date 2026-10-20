// Coinbase sells American shares and ETFs (NYSE, Nasdaq, NYSE American,
// NYSE Arca, Cboe BZX) in US dollars. Every stock it carries has a public
// page, /stock/{ticker}, and the equities sitemap lists all of them. The
// "explore" screener stops at 1,000 rows, so the sitemap is the list.
//
// Each sitemap ticker is then checked with the GraphQL query the stock page
// itself runs (EquityPageQuery): it returns the product, its short name and
// two flags, isDisabled and isTradingDisabled. Only products with both flags
// off are kept. Cloudflare answers plain HTTP with 403, so everything goes
// through a tab of a Chrome that must already be listening on port 9222
// (started with --remote-debugging-port=9222); no sign-in is needed.
//
// Coinbase does not say where a ticker is listed or whether it is an ETF.
// The Nasdaq Trader symbol directory (as in the freestoxx scraper) gives the
// listing exchange and the ETF flag. A ticker missing from it is an escrow,
// CVR or contra CUSIP placeholder (e.g. "152CVR015") and is left out, as are
// warrants and rights ("GME.WS", "OPENW"). ISINs are not published.
//
//   https://www.coinbase.com/sitemap-equities-index.xml
//   https://www.coinbase.com/sitemap-equities-en.xml
//   https://www.coinbase.com/graphql/query?operationName=EquityPageQuery
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//
//   node brokers/coinbaseus/coinbaseus_scraping.mjs

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const START = "https://www.coinbase.com/stock/explore";
const SITEMAP_INDEX = "/sitemap-equities-index.xml";
const SITEMAP = "https://www.coinbase.com/sitemap-equities-en.xml";
const NASDAQ = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
// Persisted query id of EquityPageQuery in the site's bundle; a stale id
// answers PersistedQueryNotFound and the run stops.
const EQUITY_PAGE_QUERY = "9953738aba666ce341915a68cae2c0a12e1b2631f2690cc6a1e16eb7cea8271f";
const WORKERS = 4;

// otherlisted.txt exchange codes.
const VENUES = {
  Q: ["Nasdaq", "XNAS"],
  N: ["NYSE", "XNYS"],
  A: ["NYSE American", "XASE"],
  P: ["NYSE Arca", "ARCX"],
  Z: ["Cboe BZX", "BATS"],
  V: ["IEX", "IEXG"],
  F: ["NYSE Texas", "XCHI"],
};

const DERIVED = /\b(warrants?|rights?)\b/i;
// "American Depositary Shares, each representing the right to receive ..."
const ADS = /\bdepositary shares\b.*\bright to receive\b/i;
const ETN = /\bETNs?\b|exchange[- ]traded notes?\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

function directory(textBody, file) {
  const lines = textBody.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split("|");
  const column = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`${file} has no ${name} column`);
    return index;
  };
  const out = [];
  if (file === "nasdaq") {
    const [symbol, name, etf, test] = ["Symbol", "Security Name", "ETF", "Test Issue"].map(column);
    for (const line of lines) {
      const cells = line.split("|");
      if (cells.length < header.length || cells[test] === "Y") continue;
      out.push({ keys: [cells[symbol]], code: "Q", name: cells[name], etf: cells[etf] === "Y" });
    }
  } else {
    const [act, name, exchange, cqs, etf, test, nasdaq] = ["ACT Symbol", "Security Name", "Exchange", "CQS Symbol", "ETF", "Test Issue", "NASDAQ Symbol"].map(column);
    for (const line of lines) {
      const cells = line.split("|");
      if (cells.length < header.length || cells[test] === "Y") continue;
      out.push({ keys: [cells[cqs], cells[act], cells[nasdaq]], code: cells[exchange], name: cells[name], etf: cells[etf] === "Y" });
    }
  }
  if (out.length < 3000) throw new Error(`${file} directory has only ${out.length} lines`);
  return out;
}

// Runs in the page: same-origin fetch, so Cloudflare's cookies apply.
async function pageGet(page, url, json) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [status, body] = await page
      .evaluate(async (target, asJson) => {
        try {
          const headers = asJson ? { accept: "application/json", "content-type": "application/json" } : {};
          const response = await fetch(target, { headers });
          return [response.status, await response.text()];
        } catch (error) {
          return [0, String(error)];
        }
      }, url, json)
      .catch((error) => [0, String(error.message || error)]);
    if (status === 200) return body;
    last = `${status} ${url} ${body.slice(0, 120)}`;
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

async function product(page, symbol) {
  const extensions = JSON.stringify({ persistedQuery: { version: 1, sha256Hash: EQUITY_PAGE_QUERY } });
  const variables = JSON.stringify({ equitySymbol: symbol, locale: "en", countryCode: "US" });
  const url = `/graphql/query?&operationName=EquityPageQuery&extensions=${encodeURIComponent(extensions)}&variables=${encodeURIComponent(variables)}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const body = JSON.parse(await pageGet(page, url, true));
    const errors = (body.errors || []).map((error) => error.message);
    if (errors.includes("PersistedQueryNotFound")) {
      // Also seen now and then on a valid id; give up only when it repeats.
      if (attempt === 3) throw new Error("EquityPageQuery id is no longer known to the site");
      await sleep(3000 * (attempt + 1));
      continue;
    }
    const item = body.data?.retailBrokerage?.productBySymbol;
    if (item) return item;
    // An unknown ticker answers null with "An internal error has occurred".
    if (attempt === 3) return null;
    await sleep(2000 * (attempt + 1));
  }
  return null;
}

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = await browser.newPage();
let kept;
try {
  await page.goto(START, { waitUntil: "domcontentloaded", timeout: 90_000 });
  for (let wait = 0; /just a moment|attention required/i.test(await page.title()); wait += 1) {
    if (wait > 30) throw new Error("Cloudflare challenge did not clear");
    await sleep(2000);
  }

  const index = await pageGet(page, SITEMAP_INDEX, false);
  if (!index.includes(SITEMAP)) throw new Error(`${SITEMAP} is no longer in the sitemap index`);
  const sitemap = await pageGet(page, new URL(SITEMAP).pathname, false);
  const symbols = [
    ...new Set(
      [...sitemap.matchAll(/<loc>https:\/\/www\.coinbase\.com\/stock\/([^<\/]+)<\/loc>/g)]
        .map((match) => decodeURIComponent(match[1]))
        .filter((symbol) => symbol !== "explore")
    ),
  ];
  if (symbols.length < 8000) throw new Error(`only ${symbols.length} tickers in the equities sitemap`);

  const [nasdaqText, otherText] = await Promise.all([get(NASDAQ), get(OTHER)]);
  const listings = new Map();
  for (const entry of [...directory(nasdaqText, "nasdaq"), ...directory(otherText, "other")]) {
    for (const key of entry.keys) if (key && !listings.has(key)) listings.set(key, entry);
  }

  const products = new Map();
  let next = 0;
  async function worker() {
    while (next < symbols.length) {
      const symbol = symbols[next++];
      products.set(symbol, await product(page, symbol));
      if (products.size % 500 === 0) console.error(`${products.size}/${symbols.length} checked`);
      await sleep(150);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));

  const rows = [];
  const seen = new Set();
  const skipped = new Map();
  const unknownVenue = new Set();
  const skip = (reason, symbol) => {
    if (!skipped.has(reason)) skipped.set(reason, []);
    skipped.get(reason).push(symbol);
  };

  for (const symbol of symbols) {
    const item = products.get(symbol);
    if (!item) { skip("no product", symbol); continue; }
    if (item.isDisabled || item.isTradingDisabled) { skip("not tradable", symbol); continue; }
    if (item.productType && item.productType !== "EQUITY") { skip(`type ${item.productType}`, symbol); continue; }
    const entry = listings.get(symbol);
    if (!entry) { skip("not in the US directory", symbol); continue; }
    if (DERIVED.test(entry.name) && !ADS.test(entry.name) && !entry.etf) { skip("warrant/right", symbol); continue; }
    const venue = VENUES[entry.code];
    if (!venue) {
      unknownVenue.add(`${entry.code} (${symbol})`);
      continue;
    }
    const [exchange, mic] = venue;
    const key = `${symbol}|${mic}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const details = item.equityProductDetails || {};
    const name = normalize(details.shortName) || normalize(entry.name);
    const type = ETN.test(entry.name) ? "ETN" : entry.etf ? "ETF" : "STOCK";
    rows.push({
      query: symbol,
      ticker: symbol,
      name,
      exchange,
      mic,
      currency: "USD",
      type,
      isin: "",
      raw: [symbol, name, normalize(details.companyDescription).slice(0, 80), exchange, entry.etf ? "ETF" : "", item.productId]
        .filter(Boolean)
        .join(" "),
    });
  }

  if (unknownVenue.size) throw new Error(`unmapped exchange codes: ${[...unknownVenue].slice(0, 10).join(", ")}`);
  const missing = (skipped.get("no product") || []).length + (skipped.get("not in the US directory") || []).length;
  if (missing > symbols.length * 0.02) throw new Error(`${missing} sitemap tickers have no product or listing`);

  const count = (test) => rows.filter(test).length;
  if (count((row) => row.mic === "XNAS" && row.type === "STOCK") < 1500 || count((row) => row.mic === "XNYS") < 1500) {
    throw new Error(`Nasdaq ${count((row) => row.mic === "XNAS")}, NYSE ${count((row) => row.mic === "XNYS")}`);
  }
  if (count((row) => row.type === "ETF") < 3000) throw new Error(`only ${count((row) => row.type === "ETF")} ETFs`);
  for (const [ticker, mic] of [["AAPL", "XNAS"], ["KO", "XNYS"], ["BRK.B", "XNYS"], ["SPY", "ARCX"]]) {
    if (!rows.some((row) => row.ticker === ticker && row.mic === mic)) throw new Error(`${ticker} is not on ${mic}`);
  }

  rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
  kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL("coinbaseus-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

  const counts = new Map();
  for (const row of kept) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
  console.error(`${kept.length} listings from ${symbols.length} sitemap tickers (${[...counts].map(([label, n]) => `${n} ${label}`).join(", ")})`);
  console.error(`left out ${[...skipped].map(([reason, list]) => `${list.length} ${reason} (${list.slice(0, 8).join(" ")})`).join(", ") || "nothing"}`);
  if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
} finally {
  await page.close().catch(() => {});
  browser.disconnect();
}
