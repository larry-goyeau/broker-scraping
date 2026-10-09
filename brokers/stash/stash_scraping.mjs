// What Stash sells in shares and exchange-traded funds, with no login.
// Two public pages are the book: every company, and every fund. A card is
// a name and a ticker. The page names no board, so the place is US and the
// currency is dollars. The national quote is one figure per ticker.
//
// A name that says ETN is that type. A name that says ETC, and not ETF, is
// an ETC. "ETC 6 Meridian" is the issuer of an ETF, so that line stays an
// ETF. Anything else on the fund page stays an ETF, and a company stays a
// share. Stash prints no ISIN, so the code is the one the other catalogues
// already agree on for that ticker on a US tape.
//
//   https://www.stash.com/investments/stocks
//   https://www.stash.com/investments/etfs
//
//   node brokers/stash/stash_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const PAGES = [
  { url: "https://www.stash.com/investments/stocks", type: "STOCK" },
  { url: "https://www.stash.com/investments/etfs", type: "ETF" },
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const US_MICS = ["XNAS", "ARCX", "XNYS", "XASE", "BATS"];

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
  if (/\bETNs?\b/i.test(name) || /exchange-traded notes/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name) || /exchange-traded funds/i.test(name)) return "ETF";
  return "";
}

function isinBook() {
  const book = new Map();
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "stash") continue;
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

const isins = isinBook();

function joined(ticker) {
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

function cardsOf(html, url) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`Stash page had no catalogue: ${url}`);
  const data = JSON.parse(match[1]);
  const groups = data?.props?.pageProps?.initialInstrumentData?.groupCards;
  if (!Array.isArray(groups) || !groups.length) throw new Error(`Stash page had no groups: ${url}`);
  const cards = [];
  for (const group of groups) {
    if (!Array.isArray(group.cards)) throw new Error(`Stash group had no cards: ${group.group?.title || url}`);
    for (const card of group.cards) cards.push(card);
  }
  if (!cards.length) throw new Error(`Stash page had no names: ${url}`);
  return cards;
}

const seen = new Set();
const unique = [];
let dupes = 0;
for (const page of PAGES) {
  const html = await textOf(page.url);
  const cards = cardsOf(html, page.url);
  console.error(`${page.url}: ${cards.length}`);
  for (const card of cards) {
    const ticker = String(card.ticker_symbol || "").trim().toUpperCase();
    const name = String(card.name || "").replace(/\s+/g, " ").trim();
    if (!ticker) throw new Error(`Stash card had no ticker: ${name || page.url}`);
    const type = namedType(name) || (card.investment_type === "ETF" ? "ETF" : page.type);
    const id = `${ticker}|${type}`;
    if (seen.has(id)) {
      dupes += 1;
      continue;
    }
    seen.add(id);
    unique.push({
      query: ticker,
      ticker,
      name: name || ticker,
      exchange: "US",
      currency: "USD",
      type,
      raw: [ticker, name, "US", "USD", type].filter(Boolean).join(" "),
      ...joined(ticker),
    });
  }
}

unique.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));

const apple = unique.filter((row) => row.ticker === "AAPL");
if (apple.length !== 1 || apple[0].type !== "STOCK") throw new Error("Apple was not a share");
const ivv = unique.filter((row) => row.ticker === "IVV");
if (!ivv.some((row) => row.type === "ETF")) throw new Error("IVV was not an ETF");
const vxx = unique.filter((row) => row.ticker === "VXX");
if (!vxx.some((row) => row.type === "ETN")) throw new Error("VXX was not an ETN");
if (unique.filter((row) => row.type === "STOCK").length < 2900) throw new Error("the share list was short");
if (unique.filter((row) => row.type !== "STOCK").length < 900) throw new Error("the fund list was short");

const kept = stampRows(withoutObligations(unique));
fs.writeFileSync(new URL("stash-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ${withIsin} with an ISIN` +
    (dupes ? `; left out ${dupes} duplicate lines` : "") +
    (kept.length < unique.length ? `; ${unique.length - kept.length} bonds left out` : "")
);
