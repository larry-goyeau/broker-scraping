// What Bamboo sells in shares and listed funds, with no login.
// The catalogue is the book: a US name or a Nigerian Exchange name.
// The public A–Z is that catalogue with browsable=true, a few hundred
// names shorter. This reads the catalogue itself.
//
// A name that says ETF, ETC, ETN or ETP is that type. Anything else
// stays a share. Bamboo prints no ISIN. The shared lists fill it when
// the ticker is already known on that venue.
//
//   https://investbamboo.com/stocks
//   https://investbamboo.com/api/stocks/catalog
//
//   node brokers/bamboo/bamboo_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const ORIGIN = "https://investbamboo.com";
const LETTERS = `${ORIGIN}/api/stocks/catalog/letters?market=All`;
const CATALOG = `${ORIGIN}/api/stocks/catalog`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${url} answered ${response.status}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt === 3) break;
      await sleep(400 * (attempt + 1));
    }
  }
  throw last;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

function listingType(name) {
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETPs?\b/i.test(name)) return "ETP";
  if (/\bETFs?\b/i.test(name)) return "ETF";
  return "STOCK";
}

async function letterOf(letter) {
  const rows = [];
  let cursor = "";
  const seenCursors = new Set();
  for (;;) {
    const url = new URL(CATALOG);
    url.searchParams.set("market", "All");
    url.searchParams.set("letter", letter);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await getJson(url);
    const items = data.items;
    if (!Array.isArray(items)) throw new Error(`letter ${letter} returned no list`);
    rows.push(...items);
    const nextCursor = String(data.nextCursor || "");
    if (!nextCursor || !items.length) return rows;
    if (seenCursors.has(nextCursor)) throw new Error(`letter ${letter} repeated cursor ${nextCursor}`);
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
}

const counts = (await getJson(LETTERS)).counts;
if (!counts || typeof counts !== "object") throw new Error("Bamboo published no letter counts");
const letters = Object.keys(counts).sort();
const expected = letters.reduce((sum, letter) => sum + Number(counts[letter] || 0), 0);
if (expected < 10_000) throw new Error(`Bamboo published only ${expected} names`);

const pages = await pool(letters, 4, async (letter) => {
  const rows = await letterOf(letter);
  if (rows.length !== counts[letter]) {
    throw new Error(`letter ${letter} has ${rows.length} names, the catalogue says ${counts[letter]}`);
  }
  console.error(`${letter}: ${rows.length}`);
  return rows;
});

const seen = new Set();
const results = [];
let skipped = 0;
for (const row of pages.flat()) {
  const ticker = String(row.ticker || "").trim().toUpperCase();
  const exchange = String(row.exchange || "").trim();
  const name = String(row.name || "").replace(/\s+/g, " ").trim();
  const currency = String(row.currency || "").trim().toUpperCase();
  if (!ticker || !exchange || !name || !currency) {
    skipped += 1;
    continue;
  }
  const id = `${ticker}:${exchange}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const type = listingType(name);
  results.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency].join(" "),
    isin: "",
  });
}

if (!results.some((row) => row.ticker === "AAPL" && row.exchange === "NASDAQ")) {
  throw new Error("Apple was not in the Bamboo catalogue");
}
if (!results.some((row) => row.ticker === "NEWGOLD" && row.exchange === "NGX" && row.type === "ETF")) {
  throw new Error("NewGold was not in the Bamboo catalogue");
}

results.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.exchange.localeCompare(right.exchange));

const kept = stampRows(withoutObligations(results));
fs.writeFileSync(new URL("bamboo-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ${withIsin} with an ISIN` +
    (skipped ? `, left out ${skipped} incomplete rows` : "") +
    (results.length !== kept.length ? `, left out ${results.length - kept.length} bonds` : "")
);
