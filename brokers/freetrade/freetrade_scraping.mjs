// Freetrade's public site lists every instrument it publishes, with no login.
// The deprecated Google Sheet is not this list: Freetrade marked it
// "[Deprecated] … [Formerly Public]" and it still names stocks the site no
// longer has a page for.
//
// https://web.freetrade.io/sitemap.xml is the list (one /universe/CC/SYMBOL
// path per line). The path names the country, not the book, so the venue is
// read off the page itself: exchange.id is the MIC (XNAS, XNYS, XLON, XPAR,
// PINK, …). A mutual fund is tagged MUTUAL_FUND and is not a stock or an ETF.
// basicUniverse false is Freetrade's own flag that the line is not for sale.
// A crypto ETN stays: it is an ETN. Freetrade does not sell the coin itself.
//
//   node brokers/freetrade/freetrade_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const ORIGIN = "https://web.freetrade.io";
const SITEMAP = `${ORIGIN}/sitemap.xml`;
const CONCURRENCY = 8;
const PAGE_CAP = 256_000;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function decodeText(value) {
  return String(value || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The page is a Next.js flight payload: the instrument object is a JS string,
// so its quotes arrive escaped. The venue sits in the first part of that
// object; the rest of the page is the chart.
function parsePage(html) {
  const text = html.replace(/\\"/g, '"');
  const start = text.indexOf("UnauthenticatedInstrument");
  if (start < 0) return null;
  const slice = text.slice(start, start + 16000);
  const asset = slice.match(/"assetClass":"([A-Z_]+)"/)?.[1] || "";
  const basic = slice.match(/"basicUniverse":(true|false)/)?.[1] === "true";
  const exchange = slice.match(/"__typename":"Exchange","id":"([^"]+)"/)?.[1] || "";
  const currency = slice.match(/"currency":"([A-Z]{3})"/)?.[1] || "";
  const symbol = decodeText(slice.match(/"symbol":"([^"]*)"/)?.[1] || "");
  const name = decodeText(slice.match(/"long":"([^"]*)"/)?.[1] || slice.match(/"short":"([^"]*)"/)?.[1] || "");
  const isin = toIsin(slice.match(/"id":"([^"]+)"/)?.[1] || "");
  return { asset, basic, exchange, currency, symbol, name, isin };
}

function listingType(asset, name) {
  if (asset === "MUTUAL_FUND") return "";
  if (asset === "ETN") return "ETN";
  if (asset === "ETF") return /\bETCs?\b/i.test(name) ? "ETC" : "ETF";
  if (asset === "EQUITY" || asset === "ADR" || asset === "TRUST") return "STOCK";
  return "";
}

async function readCapped(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < PAGE_CAP) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.includes("UnauthenticatedInstrument") && text.includes('__typename\\":\\"Exchange\\"')) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text;
}

async function loadPaths() {
  const response = await fetch(SITEMAP, {
    headers: { "User-Agent": UA, Accept: "application/xml" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Freetrade sitemap answered ${response.status}`);
  const xml = await response.text();
  const paths = [];
  for (const loc of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    let url;
    try {
      url = new URL(loc[1]);
    } catch {
      continue;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "universe" || parts.length < 3) continue;
    paths.push(`${parts[1]}/${parts.slice(2).join("/")}`);
  }
  return paths;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

const paths = await loadPaths();
if (paths.length === 0) throw new Error("Freetrade sitemap listed no instruments");
console.error(`${paths.length} instruments on the Freetrade site`);

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

let done = 0;
const parsed = await mapPool(paths, CONCURRENCY, async (path) => {
  const url = `${ORIGIN}/universe/${path}`;
  let html = "";
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      html = await readCapped(url);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  done += 1;
  if (done % 500 === 0) console.error(`${done}/${paths.length}`);
  if (lastError) {
    skip("page failed");
    return null;
  }
  const row = parsePage(html);
  if (!row) {
    skip("no page");
    return null;
  }
  if (!row.basic) {
    skip("not for sale");
    return null;
  }
  const type = listingType(row.asset, row.name);
  if (!type) {
    skip(row.asset === "MUTUAL_FUND" ? "mutual fund" : "not a stock or ETF");
    return null;
  }
  if (!row.isin) {
    skip("no ISIN");
    return null;
  }
  if (!row.exchange || row.exchange === "UNKNOWN" || row.exchange === "MUTUAL_FUND_EXCHANGE") {
    skip("no venue");
    return null;
  }
  const ticker = row.symbol.toUpperCase() || decodeURIComponent(path.split("/").pop() || "").toUpperCase();
  if (!ticker) {
    skip("no ticker");
    return null;
  }
  return {
    query: row.isin,
    ticker,
    name: row.name || ticker,
    exchange: row.exchange,
    currency: row.currency || null,
    type,
    raw: [ticker, row.name, row.exchange, row.currency, row.isin].filter(Boolean).join(" "),
    isin: row.isin,
  };
});

const seen = new Set();
const results = [];
for (const row of parsed) {
  if (!row) continue;
  const key = `${row.isin}:${row.exchange}:${row.ticker}:${row.currency || ""}:${row.type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push(row);
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(
  new URL("freetrade-parsed.json", import.meta.url),
  JSON.stringify(stampRows(results), null, 2)
);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
