// What Pearler sells on the ASX and on Wall St. The product pages are
// /invest/asx/asset and /invest/us/asset. A compare page is not a listing.
// Keep a row only when active is true. A closeOnly row is sell-only and stays
// out. The page has no ISIN. An ASX code is joined to ../../assets/stocks.csv and
// ../../assets/etfs.csv on ASX. A Wall St code is joined when exactly one ISIN matches
// NASDAQ, NYSE, AMEX, Cboe or OTC. An ETN is filed as EQUITY. There is no ETC
// kind.
//
//   https://pearler.com/invest/asx/asset/BHP
//   https://pearler.com/sitemap.xml
//
//   node brokers/pearler/pearler_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const US_PLACES = ["NASDAQ", "NYSE", "AMEX", "CBOE"];
const JOBS = 20;
const CACHE = new URL("pearler-cache.jsonl", import.meta.url);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    if (!fs.existsSync(file)) throw new Error(`missing ${file.pathname}`);
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    const header = table[0]?.map((cell) => cell.trim().toLowerCase());
    if (header?.[0] !== "ticker" || header?.[1] !== "exchange" || header?.[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${(header || []).join(",")}`);
    }
    for (const line of table.slice(1)) {
      const code = normalize(line[0]).toUpperCase().split(":").pop();
      const exchange = normalize(line[1]).toUpperCase();
      const isin = normalize(line[2]).toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

function attachIsins(rows) {
  const index = loadIsinIndex();
  const tally = { one: 0, none: 0, several: 0 };
  for (const row of rows) {
    const book = index.get(row.ticker);
    const places = row.exchange === "ASX" ? ["ASX"] : row.otc ? ["OTC"] : US_PLACES;
    const found = new Map();
    for (const place of places) {
      for (const isin of book?.get(place) || []) {
        if (!found.has(isin)) found.set(isin, new Set());
        found.get(isin).add(place);
      }
    }
    if (found.size === 1) {
      const [isin, where] = [...found][0];
      row.isin = isin;
      row.query = isin;
      if (row.exchange !== "ASX" && where.size === 1) row.exchange = [...where][0];
      tally.one += 1;
    } else tally[found.size === 0 ? "none" : "several"] += 1;
  }
  return tally;
}

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json,text/html", Referer: "https://pearler.com/" },
        signal: controller.signal,
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

async function assetPages() {
  const index = await textOf("https://pearler.com/sitemap.xml");
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const urls = [];
  for (const map of maps) {
    const xml = await textOf(map);
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = match[1];
      if (/\/invest\/(?:asx|us)\/asset\/[^/]+$/.test(url)) urls.push(url);
    }
  }
  if (!urls.length) throw new Error("Pearler sitemap listed no asset page");
  return urls;
}

async function pageOf(url, buildId) {
  const path = new URL(url).pathname;
  const dataUrl = `https://pearler.com/_next/data/${buildId}${path}.json`;
  const body = JSON.parse(await textOf(dataUrl));
  const asset = body?.pageProps?.shareDetails?.getAssetDetailsV3?.asset;
  if (!asset?.ticker) throw new Error(`unread asset page ${url}`);
  return asset;
}

const pages = await assetPages();
fs.writeFileSync(new URL("pearler-scrape.log", import.meta.url), `${pages.length} asset pages\n`);
const home = await textOf(pages[0]);
const buildId = home.match(/"buildId":"([^"]+)"/)?.[1];
if (!buildId) throw new Error("Pearler page did not name a build id");

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const cache = new Map();
if (fs.existsSync(CACHE)) {
  for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) {
    if (!line) continue;
    const saved = JSON.parse(line);
    cache.set(saved.url, saved);
  }
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < pages.length) {
    const index = cursor;
    cursor += 1;
    const url = pages[index];
    const saved = cache.get(url);
    const full = saved ? null : await pageOf(url, buildId);
    const asset = saved
      ? saved
      : {
          ticker: full.ticker,
          name: full.name,
          type: full.type,
          active: full.active,
          closeOnly: full.closeOnly,
          __typename: full.__typename,
          market: full.market,
          isOTC: full.isOTC,
        };
    if (!saved) fs.appendFileSync(CACHE, `${JSON.stringify({ url, ...asset })}\n`);
    if (asset.active !== true) {
      skip("inactive");
      continue;
    }
    if (asset.closeOnly === true) {
      skip("close only");
      continue;
    }
    if (asset.closeOnly !== false) throw new Error(`unread closeOnly ${asset.ticker} ${asset.closeOnly}`);
    const kind = normalize(asset.type).toUpperCase();
    const name = normalize(asset.name);
    // EQUITY is a US share. A listed investment company is a share. An ETN
    // arrives as EQUITY. A blank type is a share unless the name says otherwise.
    const type =
      kind === "ETF" || (!kind && /\bETF\b/i.test(name))
        ? "ETF"
        : !kind && /\bETN\b/i.test(name)
          ? "ETN"
          : !kind && /\bETC\b/i.test(name)
            ? "ETC"
            : kind === "STOCK" || kind === "EQUITY" || kind === "LIC" || !kind
              ? "STOCK"
              : kind;
    const book = asset.__typename === "AsxAsset" ? "ASX" : asset.__typename === "UsAsset" ? "US" : "";
    if (!book) throw new Error(`unread book ${asset.__typename} ${asset.ticker}`);
    const ticker = normalize(asset.ticker).toUpperCase();
    if (!ticker || /\s/.test(ticker)) throw new Error(`unread ticker ${asset.ticker}`);
    const label = name || ticker;
    results.push({
      query: ticker,
      ticker,
      name: label,
      exchange: book === "ASX" ? "ASX" : asset.isOTC === true ? "OTC" : "US",
      currency: book === "ASX" ? "AUD" : "USD",
      type,
      otc: asset.isOTC === true,
      raw: [ticker, name, asset.market || book, kind].filter(Boolean).join(" "),
      isin: "",
    });
    if ((index + 1) % 200 === 0) {
      fs.appendFileSync(new URL("pearler-scrape.log", import.meta.url), `${index + 1}/${pages.length}\n`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, pages.length) }, worker));

const seen = new Set();
const unique = [];
for (const row of results) {
  const key = `${row.ticker}:${row.exchange}:${row.type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}

const isins = attachIsins(unique);
for (const row of unique) delete row.otc;
unique.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("pearler-parsed.json", import.meta.url), JSON.stringify(stampRows(unique), null, 2));

const byBook = new Map();
for (const row of unique) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(unique.map((row) => row.isin || `${row.type}:${row.ticker}:${row.exchange}`)).size;
console.error(
  `${unique.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
console.error(`ISIN ${isins.one}. ${isins.several} codes match several. ${isins.none} match none.`);
