// The BX Swiss book, for the Swiss banks whose pages name BX Swiss (the
// former Berner Börse) as a place next to SIX: every share, ETF and ETP
// line on BX Swiss's own public instrument list, one row per ISIN and
// trading currency.
//
// Source, public, no login: the instrument list of bxswiss.com, 500 cards a
// page (the same list ../../spreads/bxswiss-touch.mjs reads for the touch).
// Each card gives the ISIN, BX's short code, the product label ("Share",
// "ETF", "ETP", "Fund", "Bond", "AMC / wikifolio", "deriBX"), the name, and
// the bid and ask with their currency:
//   https://www.bxswiss.com/instruments/az
//   https://www.bxswiss.com/instruments/az/-/-/-/-/-/-/-/-/<page>/500
//
// Kept (exchange "BX Swiss", MIC XBRN, as neon and spreads/venues.mjs write
// it):
// - "Share": Swiss and foreign shares, listed on BX Swiss or admitted to
//   trading there (most foreign shares trade in CHF, some in EUR or USD).
//   Type STOCK.
// - "ETF": every exchange-traded fund line. Type ETF.
// - "ETP": exchange-traded products. A product on a metal, oil or other
//   commodity is ETC; the crypto, index and overnight-rate trackers are ETN
//   (the rule ../migros/sixBook.mjs applies to SIX's EP segment).
// - Currency: the currency the card prints next to the bid.
// Left out:
// - "AMC / wikifolio" (actively managed certificates) and "deriBX"
//   (warrants and structured products): certificates, not shares or ETFs.
// - "Bond" and "Fund" (open-ended funds a market maker quotes; not ETFs).
// - A line with neither a bid nor an ask on the list: no market on BX.
//   Delisted lines are no longer on the list.
//
// Use:
//   import { bxBook } from "../zurcherkantonalb/bxBook.mjs";
//   const { rows, dropped } = await bxBook();
//
//   node brokers/zurcherkantonalb/bxBook.mjs      (prints the counts)
//
// The read is kept for 12 hours in the system temp folder, so the scrapers
// run back to back read BX once.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "BX Swiss";
export const MIC = "XBRN";

const LIST = (page) => `https://www.bxswiss.com/instruments/az/-/-/-/-/-/-/-/-/${page}/500`;
const CACHE = path.join(os.tmpdir(), "bxswiss-book.json");
const MAX_AGE = 12 * 3600 * 1000;
const COMMODITY = /\b(gold|silver|platinum|palladium|copper|nickel|zinc|aluminium|oil|crude|brent|wti|natural gas|commodit\w*|metals?|rare earth)\b/i;
const CRYPTO = /bitcoin|ethereum|crypto|btc|eth\b|solana|xrp|cardano|polkadot|litecoin|staking|blockchain/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (text) =>
  String(text || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
const number = (text) => {
  const cleaned = String(text || "").replace(/[’'′\s]/g, "");
  return /^\d+(\.\d+)?$/.test(cleaned) && Number(cleaned) > 0 ? Number(cleaned) : null;
};

function cardsOf(html) {
  const out = [];
  for (const card of html.split('class="box box--minimal js-box"').slice(1)) {
    const isin = card.match(/data-id="([A-Z]{2}[A-Z0-9]{9}\d)"/)?.[1];
    if (!isin) continue;
    out.push({
      isin,
      label: decode(card.match(/<span class="label">([^<]*)<\/span>/)?.[1]),
      code: decode(card.match(/heading--compact">([^<]*)<\/span>/)?.[1]).split(" ")[0],
      listed: /listed on BX Swiss/.test(card),
      name: decode(card.match(/heading--large">([^<]*)</)?.[1]),
      currency: card.match(/heading--small">Bid<\/span>\s*<span class="small">([A-Z]{3})<\/span>/)?.[1] || "",
      bid: number(card.match(/js-bid">([^<]*)</)?.[1]),
      ask: number(card.match(/js-ask">([^<]*)</)?.[1]),
    });
  }
  return out;
}

async function readList() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < MAX_AGE && cached.cards.length > 5000) return { ...cached, fromCache: true };
  } catch {}
  const cards = [];
  for (let page = 1; page < 60; page++) {
    let html = "";
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch(LIST(page), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(90000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        html = await response.text();
        break;
      } catch (error) {
        if (attempt >= 4) throw new Error(`BX Swiss list page ${page}: ${error.message}`);
        await sleep(3000 * attempt);
      }
    }
    const found = cardsOf(html);
    cards.push(...found);
    if (found.length < 500) break;
    await sleep(500);
  }
  const at = Date.now();
  fs.writeFileSync(CACHE, JSON.stringify({ at, cards }));
  return { at, cards, fromCache: false };
}

function typeOf(card) {
  if (card.label === "Share") return "STOCK";
  if (card.label === "ETF") return "ETF";
  if (card.label === "ETP") {
    if (/\bETC\b/.test(card.name)) return "ETC";
    if (/\bETN\b/.test(card.name) || CRYPTO.test(card.name)) return "ETN";
    return COMMODITY.test(card.name) ? "ETC" : "ETN";
  }
  return "";
}

// { rows, dropped, counts, fromCache }. rows: the house shape plus
// `listed` (true when the card says "listed on BX Swiss").
export async function bxBook() {
  const { cards, fromCache } = await readList();
  const rows = [];
  const dropped = [];
  const counts = {};
  const seen = new Set();
  const drop = (card, reason) => {
    dropped.push(`${card.code} ${card.currency} ${card.isin}: ${reason}`);
    counts[reason] = (counts[reason] || 0) + 1;
  };
  for (const card of cards) {
    const type = typeOf(card);
    if (!type) { drop(card, card.label || "no label"); continue; }
    if (!/^[A-Z]{3}$/.test(card.currency)) { drop(card, "no currency"); continue; }
    const key = `${card.isin}|${card.currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!card.bid && !card.ask) { drop(card, "no quote"); continue; }
    const ticker = card.code || card.isin;
    rows.push({
      query: ticker,
      ticker,
      name: card.name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: card.currency,
      type,
      isin: card.isin,
      raw: ["BX Swiss", ticker, card.name, card.currency, card.isin, card.label, card.listed ? "listed on BX Swiss" : "traded on BX Swiss"].join(" | "),
      listed: card.listed,
    });
  }
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));

  // A broken read fails here: the big names in their shape, and the size.
  for (const [isin, type] of [["CH0038863350", "STOCK"], ["CH0012005267", "STOCK"], ["US0378331005", "STOCK"]]) {
    if (!rows.some((row) => row.isin === isin && row.type === type)) throw new Error(`${isin} ${type} is missing from the BX Swiss book`);
  }
  const byType = (type) => rows.filter((row) => row.type === type).length;
  if (byType("STOCK") < 1500 || byType("ETF") < 500 || byType("ETN") + byType("ETC") < 50) {
    throw new Error(`BX Swiss book is short: ${byType("STOCK")} STOCK, ${byType("ETF")} ETF, ${byType("ETN")} ETN, ${byType("ETC")} ETC`);
  }
  return { rows, dropped, counts, fromCache };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { rows, counts, fromCache } = await bxBook();
  const tally = {};
  for (const row of rows) tally[`${row.type} ${row.currency}`] = (tally[`${row.type} ${row.currency}`] || 0) + 1;
  console.log(`${rows.length} lines on BX Swiss${fromCache ? " (cache)" : ""}`, tally);
  console.log("left out:", counts);
}
