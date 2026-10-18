// What interactive investor sells in shares, investment trusts and
// exchange-traded products, with no login.
//
// The public sitemaps hold one page per share, trust and ETF, on every
// market ii deals in. Each page reads the public instrument API, which
// gives the ISIN, the MIC, the quote currency and the dealing status.
// BUY_SELL and BUY can be bought online. PHONE_ONLY is sold by the
// dealing desk and stays. SELL (sell-only), NOT_TRADEABLE and any other
// status are not for sale and are left out. A page the API no longer
// knows (404) is left out.
//
//   https://www.ii.co.uk/sitemaps/sitemap-shares.xml
//   https://www.ii.co.uk/sitemaps/sitemap-investment-trusts.xml
//   https://www.ii.co.uk/sitemaps/sitemap-etfs.xml
//   https://api-prod.ii.co.uk/api/1/instrument-detail/shares/astrazeneca/LSE:AZN
//
// The exchange is the code ii prints in the address (LSE, NYSE, TSE for
// Toronto, TSX for the TSX Venture, EURONEXT, OMX...). The MIC is the one
// the API returns. A share or a trust is a stock. An exchange-traded line
// is an ETF unless its name says ETC or ETN. Open-ended funds and bonds
// are other pages and are not here.
//
//   node brokers/interactiveinvestor/interactiveinvestor_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://www.ii.co.uk";
const API = "https://api-prod.ii.co.uk/api/1/instrument-detail";
const MAPS = [
  ["shares", "STOCK", 10000],
  ["investment-trusts", "STOCK", 300],
  ["etfs", "ETF", 2000],
];
const WORKERS = 4;
// The API sits behind a rate rule that answers 403 for a few minutes
// after roughly 3,000 quick calls. One call every 220 ms stays under it.
const GAP = 220;
const FOR_SALE = new Set(["BUY_SELL", "BUY", "PHONE_ONLY"]);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextSlot = 0;
async function pace() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + GAP;
  if (slot > now) await sleep(slot - now);
}

async function get(url, headers) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await pace();
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, ...headers },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
      if (response.status === 404) return null;
      if (response.status === 403 || response.status === 429) {
        // Rate rule: hold every worker until the window clears.
        console.error(`${response.status}, waiting`);
        nextSlot = Math.max(nextSlot, Date.now() + 120_000 * (attempt + 1));
        continue;
      }
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

async function sitemap(kind, floor) {
  const response = await get(`${SITE}/sitemaps/sitemap-${kind}.xml`, { Accept: "application/xml" });
  if (!response) throw new Error(`sitemap-${kind} is gone`);
  const paths = [];
  for (const match of (await response.text()).matchAll(/<loc>\s*https:\/\/www\.ii\.co\.uk(\/[^<\s]+)\s*<\/loc>/g)) {
    // An instrument page ends in EXCHANGE:SYMBOL. Guides and lists do not.
    if (/^\/[a-z-]+\/[^/]+\/[A-Z]+:[^/]+$/.test(match[1])) paths.push(match[1]);
  }
  if (paths.length < floor) throw new Error(`sitemap-${kind} has only ${paths.length} instruments`);
  return paths;
}

function kindOf(base, name) {
  if (base !== "ETF") return base;
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  return "ETF";
}

const pages = [];
const seenPath = new Set();
for (const [kind, type, floor] of MAPS) {
  const paths = await sitemap(kind, floor);
  for (const path of paths) {
    if (seenPath.has(path)) continue;
    seenPath.add(path);
    pages.push({ path, type });
  }
  console.error(`sitemap-${kind}: ${paths.length}`);
}

const details = new Array(pages.length);
let cursor = 0;
async function worker() {
  for (;;) {
    const index = cursor;
    cursor += 1;
    if (index >= pages.length) return;
    const response = await get(`${API}${pages[index].path}`, {
      Accept: "application/json;charset=UTF-8",
      "II-Consumer-Type": "web.public",
    });
    details[index] = response ? await response.json() : null;
    if ((index + 1) % 1000 === 0) console.error(`${index + 1}/${pages.length}`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));

const rows = [];
const seen = new Set();
const skipped = {};
for (let index = 0; index < pages.length; index += 1) {
  const detail = details[index];
  if (!detail) {
    skipped.gone = (skipped.gone || 0) + 1;
    continue;
  }
  const status = normalize(detail.trade?.status).toUpperCase();
  if (!FOR_SALE.has(status)) {
    skipped[status || "none"] = (skipped[status || "none"] || 0) + 1;
    continue;
  }
  const [exchange, ticker] = decodeURIComponent(pages[index].path.split("/").pop()).split(":").map(normalize);
  const name = normalize(detail.name);
  const mic = normalize(detail.exchange?.exchangeCode).toUpperCase();
  const currency = normalize(detail.price?.currency?.code || detail.exchange?.currency?.code).toUpperCase();
  const isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(normalize(detail.isin)) ? normalize(detail.isin) : "";
  const type = kindOf(pages[index].type, name);
  const key = `${exchange}|${ticker}`;
  if (!ticker || seen.has(key)) continue;
  seen.add(key);
  const row = { query: ticker, ticker, name, exchange };
  if (/^[A-Z0-9]{4}$/.test(mic)) row.mic = mic;
  Object.assign(row, {
    currency,
    type,
    isin,
    raw: [ticker, name, exchange, mic, currency, isin, normalize(detail.sedol), status].filter(Boolean).join(" "),
  });
  rows.push(row);
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("interactiveinvestor-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.mic || "-"} ${row.type}`] = (counts[`${row.exchange} ${row.mic || "-"} ${row.type}`] || 0) + 1;
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`skipped: ${JSON.stringify(skipped)}`);
console.error(`${rows.length} rows`);
