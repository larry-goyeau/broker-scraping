// What Willis Owen sells in shares and exchange-traded products, with no
// login. Two public lists. Funds and investment trusts are other lists
// and are not here.
//
// Each line is one ISIN and one sterling price. The page names the
// London Stock Exchange for the whole list, not on the row, and it does
// not say main market or AIM. The place stored is LSE. Willis Owen
// prints no ticker, so the ISIN is the ticker.
//
// A share is a stock. An exchange-traded line is an ETF unless its name
// says ETC or ETN. The coin is not sold. A bitcoin line already in the
// exchange-traded list stays, as an ETC or an ETN, whichever the name says.
//
//   https://www.willisowen.co.uk/explore/find-shares
//   https://www.willisowen.co.uk/explore/find-etfs
//   https://www.willisowen.co.uk/help/fees-and-charges
//
//   node brokers/willisowen/willisowen_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const ORIGIN = "https://www.willisowen.co.uk";
const SCREENER = `${ORIGIN}/explore/screener_fetch_data`;
const OUTPUT = new URL("willisowen-parsed.json", import.meta.url);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

const SHELVES = [
  { product: "4", priceClass: "QuantitativeClosePrice", kind: "share" },
  { product: "2", priceClass: "ClosePrice", kind: "etf" },
];

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function listingType(kind, name) {
  if (kind === "share") return "STOCK";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

function currencyOf(priceText) {
  const text = String(priceText || "").toUpperCase();
  if (text.includes("GBX")) return "GBX";
  if (text.includes("USD")) return "USD";
  if (text.includes("EUR")) return "EUR";
  return "GBP";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postPage(product, page) {
  const body = new URLSearchParams({ product, page: String(page), tab: "1" });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(SCREENER, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        Referer: `${ORIGIN}/explore/find-shares`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(40_000),
    });
    const html = await response.text();
    // A 429 page can still carry the table, and then it also prints
    // "IP Address Blocked". The table is the answer. A block page with
    // no "N Found" is a refusal.
    if (/\d+\s+Found/.test(html)) return html;
    if (response.status === 429 || /IP Address Blocked|Security Check/i.test(html)) {
      await sleep(3000 + attempt * 2000);
      continue;
    }
    if (!response.ok) throw new Error(`Willis Owen screener answered ${response.status}`);
    return html;
  }
  throw new Error("Willis Owen is refusing the screener. Wait and run it again.");
}

function foundCount(html) {
  const match = html.match(/(\d+)\s+Found/);
  return match ? Number(match[1]) : 0;
}

function pageRows(html, priceClass) {
  const rows = [];
  for (const block of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = block[1];
    if (!row.includes(`${priceClass}-data`)) continue;
    const isin = toIsin(row.match(/ISIN=([A-Z0-9]{12})/)?.[1]);
    const name = String(row.match(/open-in-new-tab">([^<]+)/)?.[1] || "")
      .replace(/\s+/g, " ")
      .trim();
    const price = String(row.match(new RegExp(`${priceClass}-data"[^>]*>([\\s\\S]*?)</td>`))?.[1] || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!isin || !name) continue;
    rows.push({ isin, name, price });
  }
  return rows;
}

async function loadShelf(shelf) {
  const first = await postPage(shelf.product, 1);
  const found = foundCount(first);
  if (!found) throw new Error(`Willis Owen ${shelf.kind} list did not say how many rows it has`);
  const pages = Math.ceil(found / 10);
  const rows = pageRows(first, shelf.priceClass);
  for (let page = 2; page <= pages; page += 1) {
    await sleep(350);
    const html = await postPage(shelf.product, page);
    rows.push(...pageRows(html, shelf.priceClass));
  }
  console.error(`${found} ${shelf.kind} rows announced, ${rows.length} read`);
  return rows.map((row) => ({ ...row, kind: shelf.kind }));
}

const collected = [];
for (const shelf of SHELVES) collected.push(...(await loadShelf(shelf)));

const seen = new Set();
const results = [];
for (const row of collected) {
  const type = listingType(row.kind, row.name);
  const key = `${row.isin}:${type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const currency = currencyOf(row.price);
  results.push({
    query: row.isin,
    ticker: row.isin,
    name: row.name,
    exchange: "LSE",
    currency,
    type,
    isin: row.isin,
    raw: [row.name, "LSE", currency, row.isin, row.price].filter(Boolean).join(" "),
  });
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.name.localeCompare(right.name);
});

fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(results), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})`
);
