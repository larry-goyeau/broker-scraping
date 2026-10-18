// Light Horse publishes an A-Z directory of every US-listed stock and ETF it
// trades, refreshed daily, with a "Trade" link on each row. The directory
// gives the name and symbol; the markdown twin of each ticker page gives the
// venue and the class ("ATEN · NYSE · Stock", "VOO · NYSE · Fund").
//
//   https://www.lighthorse.io/tickers/browse/{0-9,a..z}
//   https://www.lighthorse.io/tickers/{symbol}.md
//
// A few markdown twins answer 500; the HTML page is read instead (JSON-LD
// exchange, and a "Fund profile" or "Company profile" section).
//
// "Fund" is how Light Horse labels ETFs and ETPs, so it is stored as ETF;
// closed-end funds are labelled "Stock" by the site and stay STOCK. A fund
// the site places on "NYSE" is stored with the NYSE Arca MIC (ARCX). SPAC
// units, warrants and rights are skipped. Light Horse does not show ISINs.
//
//   node brokers/lighthorse/lighthorse_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://www.lighthorse.io";
const LETTERS = ["0-9", ..."abcdefghijklmnopqrstuvwxyz"];
const WORKERS = 6;

const MIC = {
  NYSE: "XNYS",
  NASDAQ: "XNAS",
  "NYSE ARCA": "ARCX",
  NYSEARCA: "ARCX",
  "NYSE AMERICAN": "XASE",
  NYSEAMERICAN: "XASE",
  AMEX: "XASE",
  CBOE: "BATS",
  "CBOE BZX": "BATS",
  BATS: "BATS",
};

const NOT_SHARE = /\bunits?\b|\bwarrants?\b|\brights?\b/i;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decode(value) {
  return normalize(value)
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, { allow404 = false, tries = 5 } = {}) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,text/markdown,*/*" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      if (response.status === 404 && allow404) return null;
      last = `${response.status} ${url}`;
      if (response.status === 429) await sleep(3000 * (attempt + 1));
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

// The directory.
const listed = [];
for (const letter of LETTERS) {
  const page = await get(`${BASE}/tickers/browse/${letter}`);
  const announced = Number(page.match(/"numberOfItems":(\d+)/)?.[1]);
  const items = [...page.matchAll(/href="\/tickers\/([^"]+)"><span class="[^"]*__name">([^<]*)<\/span><span class="[^"]*__symbol">([^<]*)<\/span>/g)];
  if (!announced || items.length !== announced) throw new Error(`${letter}: announced ${announced}, parsed ${items.length}`);
  for (const [, slug, name, symbol] of items) listed.push({ slug, name: decode(name), symbol: decode(symbol) });
  await sleep(200);
}

const wanted = [];
const seenSlug = new Set();
for (const item of listed) {
  if (seenSlug.has(item.slug)) continue;
  seenSlug.add(item.slug);
  if (NOT_SHARE.test(item.name)) continue;
  wanted.push(item);
}

// The venue and class of one ticker: "ATEN · NYSE · Stock".
async function describe(slug) {
  const text = await get(`${BASE}/tickers/${slug}.md`, { allow404: true, tries: 2 }).catch(() => null);
  const line = text?.split("\n").find((value) => value.includes(" · "));
  if (line) {
    const [, venue, kind] = line.split(" · ").map(normalize);
    if (/^(Stock|Fund)$/.test(kind)) return [venue, kind];
  }
  const page = await get(`${BASE}/tickers/${slug}`, { allow404: true });
  if (!page) return [];
  const venue = page.match(/"@id":"[^"]*#issuer"[^}]*"exchange":"([^"]+)"/)?.[1];
  const profile = page.match(/srOnly">(Fund|Company) profile/)?.[1];
  return [venue, profile === "Fund" ? "Fund" : profile === "Company" ? "Stock" : ""];
}

// The venue and class of each ticker.
const rows = [];
let missing = 0;
let cursor = 0;
let done = 0;
async function worker() {
  while (cursor < wanted.length) {
    const item = wanted[cursor++];
    const [venue, kind] = await describe(item.slug);
    done += 1;
    if (done % 1000 === 0) console.error(`${done}/${wanted.length}`);
    if (!venue || !kind) {
      missing += 1;
      continue;
    }
    const ticker = item.symbol;
    const exchange = venue.toUpperCase();
    // Light Horse prints NYSE for NYSE Arca funds (VOO, SPY, GLD).
    const mic = kind === "Fund" && exchange === "NYSE" ? "ARCX" : MIC[exchange];
    rows.push({
      query: ticker,
      ticker,
      name: item.name,
      exchange,
      ...(mic ? { mic } : {}),
      currency: "USD",
      type: kind === "Fund" ? "ETF" : "STOCK",
      isin: "",
      raw: [ticker, item.name, venue, kind].join(" | "),
    });
    await sleep(60);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
if (missing > wanted.length * 0.02) throw new Error(`${missing} of ${wanted.length} ticker pages had no venue line`);

const unique = [...new Map(rows.map((row) => [`${row.exchange}|${row.ticker}`, row])).values()];
unique.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("lighthorse-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(unique)), null, 2));

const counts = {};
for (const row of unique) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
console.error(`${unique.length} rows from ${listed.length} directory entries (${listed.length - wanted.length} units/warrants/rights skipped, ${missing} pages without a venue)`);
