// Nxchange is its own Dutch trading venue. The public "Investeren" page
// lists every share and depositary receipt on its secondary market, each
// row with a buy (K) and sell (V) button into the order book. There are
// no ETFs. Bonds sit on a separate page (/nl/investeer/obligaties) and are
// not read. Trading is in euro. The page prints no ISIN, so it stays empty;
// the order-book code (data-listing-id) is the ticker.
//
//   https://account.nxchange.com/nl/investeer
//
//   node brokers/nxchange/nxchange_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://account.nxchange.com/nl/investeer";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "nl-NL,nl;q=0.9" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const html = await get(PAGE);
if (!/Secundaire markt - aandelen/.test(html)) throw new Error("the shares table is not on the page");

const rows = [];
const seen = new Set();
for (const block of html.split(/(?=<tr data-plugin="order-book-summary")/).slice(1)) {
  const row = block.slice(0, block.indexOf("</tr>"));
  const ticker = (row.match(/data-listing-id=["']?([^"'\s>]+)/) || [])[1]?.trim().toUpperCase();
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
  if (!ticker || cells.length < 2) throw new Error(`unreadable row ${text(row).slice(0, 80)}`);
  // Only rows with a live buy button are tradable.
  if (!/handel\/exchange"/.test(row)) continue;
  const name = text(cells[0]);
  const product = text(cells[1]);
  if (!name) throw new Error(`${ticker} has no name`);
  if (seen.has(ticker)) continue;
  seen.add(ticker);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: "Nxchange",
    currency: "EUR",
    type: "STOCK",
    isin: "",
    raw: [ticker, name, product, "Nxchange", "EUR"].join(" "),
  });
}

if (rows.length < 5) throw new Error(`only ${rows.length} listings`);
if (!rows.some((row) => row.ticker === "FAST")) throw new Error("Fastned is missing");

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("nxchange-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = new Map();
for (const row of kept) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(`${kept.length} listings (${[...counts].map(([key, count]) => `${count} ${key}`).join(", ")})`);
