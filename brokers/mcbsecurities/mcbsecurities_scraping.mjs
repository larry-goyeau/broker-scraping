// MCB Securities, the MCB group's investment dealer, trades every security
// listed on the SEM; its clients order online through mySEM, the SEM's own
// app, which reaches every security on the SEM trading system. The SEM publishes, with no
// login, the trading quotes of every share on its two equity markets, the
// Official Market and the Development & Enterprise Market (DEM), and a page
// with its exchange traded funds.
//
//   https://www.stockexchangeofmauritius.com/products-market-data/equities-board/trading-quotes/official
//   https://www.stockexchangeofmauritius.com/products-market-data/equities-board/trading-quotes/dem
//   https://www.stockexchangeofmauritius.com/products-market-data/etfs
//
// Each share line links to a company snapshot that gives the SEM security
// code (e.g. MCBG.N0000, MCBG.P0000 for the preference share) and the ISIN
// of that class; those pages are read one by one. The currency is the one
// the quote table prints per line (MUR, USD, EUR, GBP). Preference shares
// are listed shares and stay. Debt, specialist debt, structured products,
// funds technical listings, the Africa board and SEM-X are other pages
// and stay out. The ETF lines have no snapshot, so their ticker is the
// first word of the name and their ISIN is left empty.
//
//   node brokers/mcbsecurities/mcbsecurities_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://www.stockexchangeofmauritius.com";
const MARKETS = [
  { path: "/products-market-data/equities-board/trading-quotes/official", market: "Official Market", floor: 50 },
  { path: "/products-market-data/equities-board/trading-quotes/dem", market: "DEM", floor: 25 },
];
const ETFS = "/products-market-data/etfs";

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8226;/g, "•")
    .replace(/\s+/g, " ")
    .trim();
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

// Every quote table: header row, then one row per security whose first cell
// may link to the company snapshot.
function quoteRows(page) {
  const out = [];
  for (const [, table] of page.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => row);
    if (!rows.length) continue;
    const header = [...rows[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => decode(cell[1]));
    for (const row of rows.slice(1)) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => decode(cell[1]));
      if (!cells[0]) continue;
      const link = row.match(/href='(\/company-snapshot\/[^']+)'/)?.[1] || "";
      out.push({ cells, header, link: link.replace(/&amp;/g, "&") });
    }
  }
  return out;
}

const rows = [];
let securityNames = null;
for (const { path, market, floor } of MARKETS) {
  const lines = quoteRows(await get(BASE + path));
  if (lines.length < floor) throw new Error(`${market}: ${lines.length} lines`);
  for (const line of lines) {
    if (line.header[0] !== "Company" || line.header[1] !== "Currency") throw new Error(`${market}: unexpected header ${line.header.join("|")}`);
    if (!line.link) throw new Error(`${market}: no snapshot link for ${line.cells[0]}`);
    await sleep(250);
    const snapshot = await get(BASE + line.link);
    // The company search box lists every security code with its full name.
    if (!securityNames) {
      securityNames = new Map([...snapshot.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], decode(m[2])]));
    }
    const isin = snapshot.match(/<strong>ISIN :<\/strong>\s*([A-Z]{2}[A-Z0-9]{9}\d)/)?.[1] || "";
    const code = snapshot.match(/<div class="title">Latest share price<\/div>\s*<div class="sub">\s*([A-Z0-9]+\.[A-Z0-9]+)/)?.[1];
    const title = decode(snapshot.match(/<div class="title"><strong>[^<]*:<\/strong>([^<]*)<\/div>/)?.[1]);
    if (!code) throw new Error(`no security code on ${line.link}`);
    rows.push({
      query: code,
      ticker: code,
      name: securityNames.get(code) || title || line.cells[0],
      exchange: "Stock Exchange of Mauritius",
      mic: "XMAU",
      currency: line.cells[1],
      type: "STOCK",
      isin,
      raw: [market, ...line.header.map((name, index) => `${name}: ${line.cells[index] ?? ""}`), `code: ${code}`, `ISIN: ${isin}`].join(" | "),
    });
  }
}

await sleep(250);
for (const line of quoteRows(await get(BASE + ETFS))) {
  if (!/\bETF\b/.test(line.cells[0])) continue;
  const ticker = line.cells[0].split(" ")[0];
  rows.push({
    query: ticker,
    ticker,
    name: line.cells[0],
    exchange: "Stock Exchange of Mauritius",
    mic: "XMAU",
    currency: line.cells[1],
    type: "ETF",
    isin: "",
    raw: ["ETFs", ...line.header.map((name, index) => `${name}: ${line.cells[index] ?? ""}`)].join(" | "),
  });
}

for (const row of rows) if (!/^[A-Z]{3}$/.test(row.currency)) throw new Error(`bad currency on ${row.ticker}: ${row.currency}`);
const tickers = new Set(rows.map((row) => row.ticker));
if (tickers.size !== rows.length) throw new Error("two lines resolved to the same security code");
for (const ticker of ["MCBG.N0000", "SBMH.N0000", "IBLL.N0000", "UNSE.I0000"]) {
  if (!tickers.has(ticker)) throw new Error(`${ticker} missing`);
}
if (!rows.some((row) => row.type === "ETF")) throw new Error("no ETF line");
if (rows.length < 85) throw new Error(`only ${rows.length} rows`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("mcbsecurities-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type} ${row.currency}`] = (counts[`${row.exchange} ${row.type} ${row.currency}`] || 0) + 1;
console.error(counts);
