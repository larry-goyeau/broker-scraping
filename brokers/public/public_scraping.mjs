// What Public.com sells in shares and exchange-traded funds, with no login.
// Three public directories are the book. Each page is a name and a ticker.
// Listed shares and listed funds name no board, so the place is US and the
// currency is dollars. The national quote is one figure per ticker. The
// over-the-counter directory is the other book.
//
// A name that says ETF, ETN or ETC is that type. A fund directory line that
// does not say so stays an ETF. A share directory line stays a share.
// Public prints no ISIN, so the code is the one the other catalogues already
// agree on for that ticker on a US tape.
//
//   https://public.com/directory/stocks
//   https://public.com/directory/etfs
//   https://public.com/directory/otc-stocks
//
//   node brokers/public/public_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const ORIGIN = "https://public.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const US_MICS = ["XNAS", "ARCX", "XNYS", "XASE", "BATS"];

const BOOKS = [
  { path: "/directory/stocks", exchange: "US", type: "STOCK" },
  { path: "/directory/etfs", exchange: "US", type: "ETF" },
  { path: "/directory/otc-stocks", exchange: "OTC", type: "STOCK" },
];

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.status === 404) return "";
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
  if (/\bETNs?\b/i.test(name) || /exchange-traded notes/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name) || /exchange-traded funds/i.test(name)) return "ETF";
  return "";
}

function isinBook() {
  const book = new Map();
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "public") continue;
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

function parsePage(html, url) {
  const links = [...html.matchAll(/<a href="\/stocks\/([^"]+)">([^<]*)<\/a>/g)];
  if (!links.length) throw new Error(`Public directory had no names: ${url}`);
  return links.map((hit) => ({
    ticker: decodeURIComponent(hit[1]).trim().toUpperCase(),
    name: decode(hit[2]),
  }));
}

async function directory(book) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const url = page === 1 ? `${ORIGIN}${book.path}` : `${ORIGIN}${book.path}/${page}`;
    const html = await textOf(url);
    if (!html) break;
    const listed = parsePage(html, url);
    console.error(`${book.path} page ${page}: ${listed.length}`);
    for (const row of listed) rows.push(row);
  }
  if (!rows.length) throw new Error(`Public directory was empty: ${book.path}`);
  return rows;
}

const seen = new Set();
const unique = [];
let dupes = 0;
for (const book of BOOKS) {
  for (const row of await directory(book)) {
    const type = namedType(row.name) || book.type;
    const id = `${row.ticker}|${book.exchange}|${type}`;
    if (seen.has(id)) {
      dupes += 1;
      continue;
    }
    seen.add(id);
    if (!row.ticker) throw new Error(`Public line had no ticker on ${book.path}`);
    unique.push({
      query: row.ticker,
      ticker: row.ticker,
      name: row.name || row.ticker,
      exchange: book.exchange,
      currency: "USD",
      type,
      raw: [row.ticker, row.name, book.exchange, "USD", type].filter(Boolean).join(" "),
      ...joined(row.ticker),
    });
  }
}

unique.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));

const apple = unique.filter((row) => row.ticker === "AAPL");
if (apple.length !== 1 || apple[0].exchange !== "US" || apple[0].type !== "STOCK") {
  throw new Error("Apple was not a listed share");
}
const spy = unique.filter((row) => row.ticker === "SPY");
if (!spy.some((row) => row.exchange === "US" && row.type === "ETF")) throw new Error("SPY was not a listed ETF");
const berkshire = unique.filter((row) => row.ticker === "BRK.B");
if (!berkshire.some((row) => row.exchange === "US")) throw new Error("Berkshire was not a listed share");
const otc = unique.filter((row) => row.exchange === "OTC");
if (otc.length < 1000) throw new Error("the OTC directory was short");
if (unique.filter((row) => row.exchange === "US" && row.type === "STOCK").length < 7000) {
  throw new Error("the listed share directory was short");
}
if (unique.filter((row) => row.exchange === "US" && row.type !== "STOCK").length < 4000) {
  throw new Error("the fund directory was short");
}

const kept = stampRows(withoutObligations(unique));
fs.writeFileSync(new URL("public-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
const byPlace = new Map();
for (const row of kept) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);
}
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${[...byPlace].map(([place, count]) => `${count} ${place}`).join(", ")}); ` +
    `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}; ${withIsin} with an ISIN` +
    (dupes ? `; left out ${dupes} duplicate lines` : "") +
    (kept.length < unique.length ? `; ${unique.length - kept.length} bonds left out` : "")
);
