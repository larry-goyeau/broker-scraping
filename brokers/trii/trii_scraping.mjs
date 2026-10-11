// What Trii Peru sells in shares and exchange-traded funds, with no login.
// Two public pages are the book. Every card is already in the page. The
// pager only hides some of them. Mutual funds stay out. The FAQ still
// names the ETF ETFPERUD, and neither page lists it, so it stays out.
//
// A Lima card is the ticker, the name and BVL. The card names no
// currency, so a Lima line is soles. A Nasdaq, NYSE or NYSE American
// card names that board. Those three are one national quote, so the
// place is US and the currency is dollars. GDX is on both pages, once
// as AMEX and once as NYSE, and one row is kept.
//
// A name that says ETF is that type. A name that says SPDR, iShares,
// VanEck, Vanguard, Global X, Direxion, US Global or Invesco's QQQ or
// Bitcoin fund is an ETF. Anything else stays a share. Trii prints no
// ISIN, so on a US line the code is the one the other catalogues
// already agree on for that ticker. A Lima line keeps none.
//
//   https://trii.pe/stock-list
//   https://trii.pe/stock-list-global
//
//   node brokers/trii/trii_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const ORIGIN = "https://trii.pe";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const US_MICS = ["XNAS", "ARCX", "XNYS", "XASE", "BATS"];
const US_BOARDS = new Set(["NASDAQ", "NYSE", "AMEX", "NYSEARCA", "ARCA"]);

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function decode(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function forms(ticker) {
  const text = String(ticker || "").trim().toUpperCase();
  const out = new Set([text]);
  if (text.includes(".")) out.add(text.replace(/\./g, "-"));
  if (text.includes("-")) out.add(text.replace(/-/g, "."));
  return [...out];
}

function namedType(name) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name)) return "ETF";
  if (/\b(SPDR|iShares|VanEck|Vanguard|Global X|Direxion|US Global)\b/i.test(name)) return "ETF";
  if (/Invesco (QQQ|Bitcoin)/i.test(name)) return "ETF";
  if (/Oil Fund|Bitcoin Trust/i.test(name)) return "ETF";
  return "";
}

function placeOf(board) {
  const text = String(board || "").trim().toUpperCase();
  if (text === "BVL") return { exchange: "BVL", currency: "PEN", board: text };
  if (US_BOARDS.has(text)) return { exchange: "US", currency: "USD", board: text };
  throw new Error(`Trii named an unread board: ${board}`);
}

function localRows(html) {
  const cards = [...html.matchAll(/class="local-stock-name">([^<]*)<\/div>\s*<div class="local-stock-ticker">([^<]*)<\/div>/g)];
  if (cards.length < 30) throw new Error("the Lima list was short");
  return cards.map((hit) => {
    const name = decode(hit[1]);
    const tickerLine = decode(hit[2]);
    const parts = tickerLine.split("·").map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`unread Lima card: ${tickerLine}`);
    return { ticker: parts[0].toUpperCase(), name, ...placeOf(parts[1]) };
  });
}

function globalRows(html) {
  const cards = [...html.matchAll(/<li class="local-stock-card">([\s\S]*?)<\/li>/g)];
  if (cards.length < 50) throw new Error("the global list was short");
  return cards.map((hit) => {
    const card = hit[1];
    const name = decode((card.match(/alt="([^"]*)"/) || [])[1]);
    const symbol = decode((card.match(/data-symbol="([^"]*)"/) || [])[1]);
    const parts = symbol.split(":");
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`unread global card: ${symbol || name}`);
    return { ticker: parts[1].toUpperCase(), name: name || parts[1], ...placeOf(parts[0]) };
  });
}

function isinBook() {
  const book = new Map();
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "trii") continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const isin = isinOf(row.isin);
      const ticker = String(row.ticker || "").trim().toUpperCase();
      if (!isin || !ticker) continue;
      const { venue } = resolveVenue(row);
      if (!venue || !US_MICS.includes(venue.mic)) continue;
      for (const key of forms(ticker)) {
        const id = `${venue.mic}|${key}`;
        if (!book.has(id)) book.set(id, new Set());
        book.get(id).add(isin);
      }
    }
  }
  return book;
}

function joined(ticker, isins) {
  const groups = new Map();
  const all = new Set();
  const keys = forms(ticker);
  for (const mic of US_MICS) {
    const ids = new Set();
    for (const key of keys) {
      for (const isin of isins.get(`${mic}|${key}`) || []) ids.add(isin);
    }
    if (!ids.size) continue;
    groups.set(mic, ids);
    for (const isin of ids) all.add(isin);
  }
  if (all.size === 1) return { isin: [...all][0] };
  if (all.size < 2) return { isin: "" };
  const held = { ticker };
  stampIsinMatches(held, groups, ticker);
  return { isin: "", matches: held.matches };
}

const lima = localRows(await textOf(`${ORIGIN}/stock-list`));
const global = globalRows(await textOf(`${ORIGIN}/stock-list-global`));
console.error(`Lima page: ${lima.length}`);
console.error(`global page: ${global.length}`);

const seen = new Set();
const unique = [];
let dupes = 0;
for (const row of [...lima, ...global]) {
  const type = namedType(row.name) || "STOCK";
  const id = `${row.ticker}|${row.exchange}|${type}`;
  if (seen.has(id)) {
    dupes += 1;
    continue;
  }
  seen.add(id);
  unique.push({
    query: row.ticker,
    ticker: row.ticker,
    name: row.name || row.ticker,
    exchange: row.exchange,
    currency: row.currency,
    type,
    raw: [row.ticker, row.name, row.board, row.exchange, row.currency, type].filter(Boolean).join(" "),
  });
}

unique.sort(
  (left, right) =>
    left.exchange.localeCompare(right.exchange) ||
    left.ticker.localeCompare(right.ticker) ||
    left.type.localeCompare(right.type)
);

function expect(ticker, exchange, currency, type) {
  const found = unique.filter((row) => row.ticker === ticker && row.exchange === exchange);
  if (found.length !== 1) throw new Error(`${ticker} on ${exchange} was ${found.length} lines`);
  if (found[0].currency !== currency) throw new Error(`${ticker} on ${exchange} was ${found[0].currency}`);
  if (found[0].type !== type) throw new Error(`${ticker} on ${exchange} was ${found[0].type}`);
}

expect("AAPL", "US", "USD", "STOCK");
expect("SPY", "US", "USD", "ETF");
expect("GDX", "US", "USD", "ETF");
expect("HODL", "US", "USD", "ETF");
expect("CREDITC1", "BVL", "PEN", "STOCK");
expect("PESOV", "BVL", "PEN", "ETF");
if (unique.filter((row) => row.exchange === "BVL" && row.type === "STOCK").length < 35) {
  throw new Error("the Lima share list was short");
}
if (unique.filter((row) => row.exchange === "US").length < 60) throw new Error("the US list was short");
if (unique.filter((row) => row.exchange === "US" && row.type === "ETF").length < 20) {
  throw new Error("the US fund list was short");
}
if (unique.some((row) => row.ticker === "ETFPERUD")) throw new Error("ETFPERUD was on a list");

const isins = isinBook();
for (const row of unique) {
  if (row.exchange === "US") Object.assign(row, joined(row.ticker, isins));
  else row.isin = "";
}
const apple = unique.find((row) => row.ticker === "AAPL");
if (!apple.isin) throw new Error("Apple had no ISIN");

const kept = stampRows(withoutObligations(unique));
fs.writeFileSync(new URL("trii-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
const byPlace = new Map();
for (const row of kept) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  const place = `${row.exchange} ${row.currency}`;
  byPlace.set(place, (byPlace.get(place) || 0) + 1);
}
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${[...byPlace].map(([place, count]) => `${count} ${place}`).join(", ")}); ` +
    `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}; ${withIsin} with an ISIN` +
    (dupes ? `; left out ${dupes} duplicate lines` : "") +
    (kept.length < unique.length ? `; ${unique.length - kept.length} bonds left out` : "")
);
