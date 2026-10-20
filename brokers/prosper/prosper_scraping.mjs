// What Prosper sells, with no login. Prosper sells funds, ETFs, ETCs and
// a few investment trusts, and no other single shares.
//
// "Our full fund list" is a paged list of cards, 25 to a page, read until
// the page has no Next link. Each card carries the short name, the fund
// manager, a ticker (exchange-traded lines only), the ISIN and the full
// name of the share class.
//
// A full name that says ETC is an ETC, ETN an ETN, ETF an ETF. Any other
// line with a ticker is a listed investment trust, so a stock. The rest
// have no ticker and are open-ended funds, dealt with the fund manager; a
// fund line has no ticker, its ISIN is the ticker.
//
// Prosper names no exchange or dealing currency per line. Its custodian,
// Seccl, sends every exchange-traded order to Winterflood, whose only
// execution venue is the London Stock Exchange (broker-list.json gives
// Prosper that place). So a listed line becomes one row per LSE main-market
// line of its ISIN, each with its own TIDM and currency, read from the LSE.
// Only lines the sterling-only Prosper Wallet can hold are kept (GBP, and
// GBX pence). A listed line with none of those keeps the card as printed.
//
//   https://www.prosper.co.uk/products/funds
//   https://seccl.tech/order-execution/
//
//   node brokers/prosper/prosper_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { depositHas } from "../../deposits.mjs";
import { lseLine, lseLines, heldAs } from "../../lseListings.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST = "https://www.prosper.co.uk/products/funds";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function page(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
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

function field(card, name) {
  return [...card.matchAll(new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([^<]*)<`, "g"))].map((match) => decode(match[1]));
}

function kindOf(full, ticker) {
  if (/\bETC\b/i.test(full)) return "ETC";
  if (/\bETN\b/i.test(full)) return "ETN";
  if (/\bETF\b/i.test(full)) return "ETF";
  return ticker ? "STOCK" : "FUND";
}

// The list's own pagination key, from the first page's Next link.
const first = await page(LIST);
const key = (first.match(/href="\?([a-z0-9]+)_page=2"/) || [])[1];
if (!key) throw new Error("no pagination on the fund list");

const cards = [];
let html = first;
for (let number = 1; ; number += 1) {
  if (number > 1) {
    await sleep(400);
    html = await page(`${LIST}?${key}_page=${number}`);
  }
  const batch = html.split('<div class="fund-card">').slice(1);
  if (!batch.length) throw new Error(`page ${number} has no cards`);
  cards.push(...batch);
  if (!new RegExp(`href="\\?${key}_page=${number + 1}"`).test(html)) break;
  if (number > 60) throw new Error("the fund list did not end");
}

const rows = [];
const seen = new Set();
for (const card of cards) {
  const short = decode((card.match(/fs-cmssort-field="name"[^>]*>([^<]*)</) || [])[1]);
  const manager = field(card, "Fund Manager")[0] || "";
  const ticker = field(card, "Ticker")[0] || "";
  // Asset class, then the ISIN, then the full share-class name.
  const asset = field(card, "Asset Class");
  const isin = asset.find((value) => ISIN.test(value)) || "";
  const full = asset.length ? asset[asset.length - 1] : "";
  const name = full && !ISIN.test(full) ? full : short;
  if (!isin && !ticker) throw new Error(`no ISIN and no ticker on ${short}`);
  const id = `${isin}|${ticker}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const type = kindOf(name, ticker);
  const raw = [ticker, short, name, manager, asset[0], isin].filter(Boolean).join(" ");
  if (ticker) {
    const own = isin ? null : await lseLine(ticker);
    const lines = (isin ? await lseLines(isin) : own ? [own] : []).filter((line) => depositHas("prosper", "", heldAs(line.currency)));
    for (const line of lines) {
      rows.push({
        query: line.ticker,
        ticker: line.ticker,
        name,
        exchange: "London Stock Exchange",
        mic: "XLON",
        currency: line.currency,
        type,
        isin: line.isin,
        raw: `${raw} | XLON ${line.ticker} ${line.currency}`,
      });
    }
    await sleep(150);
    if (lines.length) continue;
  }
  rows.push({ query: ticker || isin, ticker: ticker || isin, name, currency: "", type, isin, raw });
}
if (rows.length < 150) throw new Error(`only ${rows.length} funds`);

rows.sort((left, right) => left.name.localeCompare(right.name) || left.isin.localeCompare(right.isin) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("prosper-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange || "no exchange"} ${row.type} ${row.currency || "-"}`] = (counts[`${row.exchange || "no exchange"} ${row.type} ${row.currency || "-"}`] || 0) + 1;
for (const [kind, count] of Object.entries(counts).sort()) console.error(`${kind}: ${count}`);
console.error(`${rows.length} rows from ${cards.length} cards`);
