// What Gotrade Global sells. One public page, no login. The A–Z list says
// it is every US stock you can buy there. A line is a name and a ticker.
// The page names no board, so the place is US and the currency is dollars.
// The national quote is one figure per ticker; Nasdaq or NYSE is not on
// the line. OTC is not separated from the listed tape.
//
// A name that says ETF, ETN or ETC is that type. Anything else stays a
// share. Gotrade prints no ISIN, so the code is the one the other
// catalogues already agree on for that ticker on a US tape.
//
//   https://www.heygotrade.com/en/us-stock/
//
//   node brokers/gotradeglobal/gotradeglobal_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const PAGE = "https://www.heygotrade.com/en/us-stock/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
// The US tapes the book treats as one national quote.
const US_MICS = ["XNAS", "ARCX", "XNYS", "XASE", "BATS"];

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
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

function listingType(name) {
  if (/\bETNs?\b/i.test(name) || /exchange-traded notes/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name) || /exchange-traded funds/i.test(name)) return "ETF";
  return "STOCK";
}

function isinBook() {
  const book = new Map();
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "gotradeglobal") continue;
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

function parseList(html) {
  const start = html.indexOf('id="ticker-az-index"');
  const end = html.indexOf("</section>", start);
  if (start < 0 || end < 0) throw new Error("Gotrade A–Z list was not on the page");
  const section = html.slice(start, end);
  const links = [...section.matchAll(/<a href="\/en\/us-stock\/[^"]*">([^<]*)<\/a>/g)];
  if (!links.length) throw new Error("Gotrade A–Z list had no stocks");
  const rows = [];
  for (const hit of links) {
    const text = decode(hit[1]);
    const name = text.match(/^(.*)\(([A-Z0-9][A-Z0-9.-]*)\)\s*$/);
    if (!name) throw new Error(`unread Gotrade line: ${text}`);
    rows.push({ name: name[1].trim(), ticker: name[2].toUpperCase() });
  }
  if (rows.length !== links.length) throw new Error(`parsed ${rows.length} of ${links.length} Gotrade lines`);
  return rows;
}

const html = await textOf(PAGE);
const listed = parseList(html);
console.error(`${listed.length} names on the Gotrade A–Z list`);

const seen = new Set();
const unique = [];
let dupes = 0;
for (const row of listed) {
  if (seen.has(row.ticker)) {
    dupes += 1;
    continue;
  }
  seen.add(row.ticker);
  const type = listingType(row.name);
  unique.push({
    query: row.ticker,
    ticker: row.ticker,
    name: row.name || row.ticker,
    exchange: "US",
    currency: "USD",
    type,
    raw: [row.ticker, row.name, "US", "USD", type].filter(Boolean).join(" "),
    ...joined(row.ticker),
  });
}
unique.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));

fs.writeFileSync(
  new URL("gotradeglobal-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(unique)), null, 2)
);

const byType = new Map();
for (const row of unique) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = unique.filter((row) => row.isin).length;
console.error(
  `${unique.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ${withIsin} with an ISIN` +
    (dupes ? `; left out ${dupes} duplicate tickers` : "")
);
