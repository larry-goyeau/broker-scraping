// What mySEM sells in shares and exchange-traded funds, with no login.
// mySEM is the Stock Exchange of Mauritius's own web app. A client gets it
// through a licensed stockbroker, who opens the CDS account and the mySEM
// login. The SEM FAQ says mySEM gives "interactive charting on all listed
// securities" and lets investors "place orders online with their
// stockbroker". It names no market or product that is shut out, so the
// book is every share and ETF on the SEM trading boards.
// The brokerage is the SEM's own schedule: 1.25% on equities up to Rs 3m,
// 0.35% on ETFs with a non-debt underlying, 0.10% on debt ETFs.
//
// The SEM prints, with no login, the quote tables of its two equity
// markets, the Official Market and the Development & Enterprise Market
// (DEM), and a page with its ETFs. Each share line links to a company
// snapshot that gives the SEM security code (MCBG.N0000, MCBG.P0000 for
// the preference share) and the ISIN; those pages are read one by one.
// The ETF lines have no link, so their snapshots are named below and a new
// ETF line stops the run. The currency is the one each line prints (MUR,
// USD, EUR, GBP). Preference shares and depositary receipts are listed
// equity and stay. Debt, structured products and the non-ETF funds are on
// other pages and stay out. The Africa board and the SEM-X segment are
// views of lines already on the Official Market or DEM; the run checks
// that and adds nothing from them.
//
//   https://www.stockexchangeofmauritius.com/education-investor-services/investor-education/investor-education-faqs
//   https://www.stockexchangeofmauritius.com/education-investor-services/investor-education/trade-on-sem-in-2-steps
//   https://www.stockexchangeofmauritius.com/regulations-governance/transaction-fees
//   https://www.stockexchangeofmauritius.com/products-market-data/equities-board/trading-quotes/official
//   https://www.stockexchangeofmauritius.com/products-market-data/equities-board/trading-quotes/dem
//   https://www.stockexchangeofmauritius.com/products-market-data/etfs
//   https://www.stockexchangeofmauritius.com/products-market-data/africa-board/trading-quotes
//   https://www.stockexchangeofmauritius.com/products-market-data/sem-x-segment/trading-quotes
//   https://www.stockexchangeofmauritius.com/company-snapshot/<market>/<company>
//
//   node brokers/mysem/mysem_scraping.mjs

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
const ETF_SNAPSHOTS = {
  "ADBF ETF (USD)": "/company-snapshot/official-market/african-domestic-bond-fund?market=official",
  "NEWGOLD ETF": "/company-snapshot/official-market/newgold-issuer-limited?market=official",
};
const VIEWS = ["/products-market-data/africa-board/trading-quotes", "/products-market-data/sem-x-segment/trading-quotes"];

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
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
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

// Every quote table: a header row, then one row per security whose first
// cell may link to the company snapshot.
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

let securityNames = null;
async function snapshot(link) {
  await sleep(250);
  const page = await get(BASE + link);
  // The company search box lists every security code with its full name.
  if (!securityNames) {
    securityNames = new Map([...page.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], decode(m[2])]));
    if (securityNames.size < 80) throw new Error(`company search box lists ${securityNames.size} securities`);
  }
  const code = page.match(/<div class="title">Latest share price<\/div>\s*<div class="sub">\s*([A-Z0-9]+\.[A-Z0-9]+)/)?.[1];
  const isin = page.match(/<strong>ISIN :<\/strong>\s*([A-Z]{2}[A-Z0-9]{9}\d)/)?.[1] || "";
  const title = decode(page.match(/<div class="title"><strong>[^<]*:<\/strong>([^<]*)<\/div>/)?.[1]);
  if (!code) throw new Error(`no security code on ${link}`);
  return { code, isin, title };
}

function row(line, market, type, { code, isin, title }) {
  const currency = line.cells[1];
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`bad currency on ${line.cells[0]}: ${currency}`);
  return {
    query: code,
    ticker: code,
    name: securityNames.get(code) || title || line.cells[0],
    exchange: "Stock Exchange of Mauritius",
    mic: "XMAU",
    currency,
    type,
    isin,
    raw: [market, ...line.header.map((name, index) => `${name}: ${line.cells[index] ?? ""}`), `code: ${code}`, `ISIN: ${isin}`].join(" | "),
  };
}

const rows = [];
const boardNames = new Set();
for (const { path, market, floor } of MARKETS) {
  const lines = quoteRows(await get(BASE + path));
  if (lines.length < floor) throw new Error(`${market}: ${lines.length} lines`);
  for (const line of lines) {
    if (line.header[0] !== "Company" || line.header[1] !== "Currency") throw new Error(`${market}: unexpected header ${line.header.join("|")}`);
    if (!line.link) throw new Error(`${market}: no snapshot link for ${line.cells[0]}`);
    boardNames.add(line.cells[0]);
    rows.push(row(line, market, "STOCK", await snapshot(line.link)));
  }
}

const etfLines = quoteRows(await get(BASE + ETFS));
if (etfLines.length < 2) throw new Error(`ETF page: ${etfLines.length} lines`);
for (const line of etfLines) {
  if (line.header[0] !== "Name" || line.header[1] !== "Currency") throw new Error(`ETF page: unexpected header ${line.header.join("|")}`);
  const link = ETF_SNAPSHOTS[line.cells[0]];
  if (!link) throw new Error(`new ETF line ${line.cells[0]}: name its snapshot in ETF_SNAPSHOTS`);
  boardNames.add(line.cells[0]);
  rows.push(row(line, "ETFs", "ETF", await snapshot(link)));
}

for (const path of VIEWS) {
  await sleep(250);
  // Only the traded-securities table; the Africa board's second table is
  // two non-ETF funds quoted at NAV.
  const lines = quoteRows(await get(BASE + path)).filter((line) => line.header[0] === "Company");
  if (!lines.length) throw new Error(`${path}: no lines`);
  for (const line of lines) {
    if (!boardNames.has(line.cells[0])) throw new Error(`${path}: ${line.cells[0]} is on no equity or ETF board`);
  }
}

const tickers = new Set(rows.map((entry) => entry.ticker));
if (tickers.size !== rows.length) throw new Error("two lines resolved to the same security code");
for (const ticker of ["MCBG.N0000", "SBMH.N0000", "IBLL.N0000", "UNSE.I0000", "NGLD.N0001"]) {
  if (!tickers.has(ticker)) throw new Error(`${ticker} missing`);
}
const noIsin = rows.filter((entry) => !entry.isin).map((entry) => entry.ticker);
if (noIsin.length > 5) throw new Error(`no ISIN on ${noIsin.join(", ")}`);
if (rows.length < 85) throw new Error(`only ${rows.length} rows`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("mysem-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const counts = {};
for (const entry of written) counts[`${entry.type} ${entry.currency}`] = (counts[`${entry.type} ${entry.currency}`] || 0) + 1;
console.error(`${written.length} rows on Stock Exchange of Mauritius: ${Object.entries(counts).map(([key, count]) => `${count} ${key}`).join(", ")}${noIsin.length ? `; no ISIN: ${noIsin.join(", ")}` : ""}`);
