// Ndovu (Kenya) sells a short, curated list of US shares and US-listed ETFs
// in fractions from USD 50. Its public product pages list every one
// ("Available shares", "Available ETFs"), each card carrying a theme name
// and a link named after the ticker (/ke/products/ivv). No login. The
// commodities page only shows "Gold", the gold ETF already on the ETF page.
//
//   https://ndovu.co/ke/products/shares
//   https://ndovu.co/ke/products/etfs
//
// Ndovu prints no venue or ISIN: both come from assets/stocks.csv and
// assets/etfs.csv (NYSE, Nasdaq, AMEX, Cboe), with the listed fund or
// company name; Ndovu's own label stays in raw. The catalogue writes AMEX
// for NYSE Arca as well as NYSE American: an ETF there is stored as ARCX. The share
// link "brk" is Berkshire Hathaway, read as the B share sold in fractions.
//
//   node brokers/ndovu/ndovu_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv } from "../../indianCash.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGES = [
  { url: "https://ndovu.co/ke/products/shares", type: "STOCK" },
  { url: "https://ndovu.co/ke/products/etfs", type: "ETF" },
];
const VENUES = { NYSE: "XNYS", NASDAQ: "XNAS", AMEX: "XASE", CBOE: "BATS" };
const ALIAS = { BRK: "BRK.B" };

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
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

function catalogue() {
  const byTicker = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const row of parseCsv(fs.readFileSync(new URL(file, import.meta.url), "utf8"))) {
      const venue = normalize(row.exchange).toUpperCase();
      if (!VENUES[venue]) continue;
      const ticker = normalize(row.ticker).split(":").pop().toUpperCase();
      if (!byTicker.has(ticker)) byTicker.set(ticker, []);
      byTicker.get(ticker).push({ venue, isin: normalize(row.isin).toUpperCase(), name: normalize(row.name) });
    }
  }
  return byTicker;
}

// The cards are embedded in the page data as {"id":..,"href":"/ke/products/x","name":..,"meta":..}.
function cards(html) {
  const text = html.replace(/\\"/g, '"').replace(/\\u0026/g, "&");
  return [...text.matchAll(/\{"id":\d+,"href":"\/ke\/products\/([a-z0-9.-]+)"[^{}]*?"name":"([^"]+)","meta":"([^"]*)"/g)].map(
    ([, slug, name, meta]) => ({ slug, name: normalize(name), meta: normalize(meta) }),
  );
}

const book = catalogue();
const rows = [];
const seen = new Set();
for (const page of PAGES) {
  const found = cards(await get(page.url));
  if (!found.length) throw new Error(`no product cards on ${page.url}`);
  for (const card of found) {
    const slug = card.slug.toUpperCase();
    const ticker = ALIAS[slug] || slug;
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    const hits = book.get(ticker) || [];
    if (!hits.length) throw new Error(`${ticker} is not on a US venue in the catalogue`);
    const venue = hits[0].venue;
    const isins = [...new Set(hits.filter((hit) => hit.venue === venue).map((hit) => hit.isin).filter((isin) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)))];
    rows.push({
      query: ticker,
      ticker,
      name: hits[0].name || card.name,
      exchange: venue,
      mic: venue === "AMEX" && page.type === "ETF" ? "ARCX" : VENUES[venue],
      currency: "USD",
      type: page.type,
      isin: isins.length === 1 ? isins[0] : "",
      raw: [ticker, card.name, card.meta].join(" | "),
    });
  }
  await sleep(300);
}

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("ndovu-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
