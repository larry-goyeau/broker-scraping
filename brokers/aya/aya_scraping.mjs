// AYA Trust Securities brokers "listed and registered shares on the Yangon
// Stock Exchange (YSX)": the Main Board and the Pre-Listing Board (PLB).
// Its equity page names those shares, but it lags the exchange: a PLB
// registration of December 2025 (G.B.S Agricultural Services, ASPGB) is not
// on it. So the list kept is the exchange's own company lists, which the
// broker's statement covers, and the broker page is the check: every share
// it names must be on them.
//
//   https://www.ayatrustsc.com/equity
//   https://ysx-mm.com/main-board/listing/company/
//   https://ysx-mm.com/pre-listing-board/registered-companies/company-list/
//
// Every YSX share is quoted in kyat (MMK). The YSX gives a five-digit
// company code, not an ISIN.
//
//   node brokers/aya/aya_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BROKER = "https://www.ayatrustsc.com/equity";
const BOARDS = [
  { url: "https://ysx-mm.com/main-board/listing/company/", board: "Main Board", floor: 8 },
  { url: "https://ysx-mm.com/pre-listing-board/registered-companies/company-list/", board: "Pre-Listing Board", floor: 1 },
];

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

const rows = [];
for (const { url, board, floor } of BOARDS) {
  const page = await get(url);
  await sleep(500);
  // The site menu names each company "TICKER (code)"; the table may not.
  const tickerOf = new Map([...page.matchAll(/>\s*([A-Za-z]+) \((\d{5})\)\s*</g)].map((m) => [m[2], m[1].toUpperCase()]));
  const table = page.match(/<table[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error(`${board}: no company table`);
  const lines = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => decode(cell[1])));
  if (lines[0]?.[0] !== "Company name" || lines[0]?.[1] !== "Code") throw new Error(`${board}: unexpected header ${lines[0]?.join("|")}`);
  const companies = lines.slice(1).filter((cells) => /^\d{5}$/.test(cells[1]));
  if (companies.length < floor) throw new Error(`${board}: ${companies.length} companies`);
  for (const cells of companies) {
    const inName = cells[0].match(/\(([A-Z]+)\)\s*$/)?.[1];
    const ticker = inName || tickerOf.get(cells[1]);
    if (!ticker) throw new Error(`${board}: no ticker for ${cells[0]} ${cells[1]}`);
    rows.push({
      query: ticker,
      ticker,
      name: cells[0].replace(/\s*\([A-Z]+\)\s*$/, ""),
      exchange: "Yangon Stock Exchange",
      mic: "YSX",
      currency: "MMK",
      type: "STOCK",
      isin: "",
      raw: [board, cells[0], `code ${cells[1]}`, cells[2]].join(" | "),
    });
  }
}

// The broker's page: every "(TICKER)" it names must be on the exchange lists.
const broker = decode(await get(BROKER));
const named = [...broker.matchAll(/\(([A-Z]{2,6})\)/g)].map((m) => m[1]).filter((ticker) => ticker !== "YSX");
if (named.length < 8) throw new Error(`broker page names only ${named.length} shares`);
const tickers = new Set(rows.map((row) => row.ticker));
const unknown = named.filter((ticker) => !tickers.has(ticker));
if (unknown.length) throw new Error(`broker page names shares not on the YSX lists: ${unknown.join(" ")}`);
const extra = [...tickers].filter((ticker) => !named.includes(ticker));
if (extra.length) console.error(`on the YSX lists, not yet on the broker page: ${extra.join(" ")}`);

for (const ticker of ["FMI", "MTSH", "MADPL"]) {
  if (!tickers.has(ticker)) throw new Error(`${ticker} missing`);
}

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("aya-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
