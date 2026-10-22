// What CB Securities sells, with no login. It is a Yangon Stock Exchange
// (YSX) member and brokers the shares traded there. Its home page prints
// the day's book in two tables: "Market Overview for Main Board" and
// "Market Overview for Pre-Listing Board". Those tables are the list kept.
// Each board also has a summary box that counts its companies ("Listed
// Company", "Registered Company"); the table must hold that many shares.
//
// The tables give tickers only. The names and the five-digit YSX company
// codes come from the exchange's own company lists, and the two sides must
// agree share for share. The YSX lists no ETF and no foreign share. Every
// YSX share is quoted in kyat (MMK). The YSX gives no ISIN; the shared
// list fills it from the ticker.
//
//   https://cbsecurities.com.mm/
//   https://cbsecurities.com.mm/stock-brokerage/
//   https://cbsecurities.com.mm/trading-fees/
//   https://ysx-mm.com/main-board/listing/company/
//   https://ysx-mm.com/pre-listing-board/registered-companies/company-list/
//
//   node brokers/cbsecurities/cbsecurities_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HOME = "https://cbsecurities.com.mm/";
const BOARDS = [
  {
    board: "Main Board",
    heading: "Market Overview for Main Board",
    summary: "Listed Company",
    ysx: "https://ysx-mm.com/main-board/listing/company/",
    floor: 8,
  },
  {
    board: "Pre-Listing Board",
    heading: "Market Overview for Pre-Listing Board",
    summary: "Registered Company",
    ysx: "https://ysx-mm.com/pre-listing-board/registered-companies/company-list/",
    floor: 1,
  },
];

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&#8217;/g, "'")
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

function cellsOf(table) {
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => decode(cell[1])),
  );
}

// The first table after the board heading is that board's book.
function brokerBoard(home, { board, heading, summary, floor }) {
  const at = home.indexOf(heading);
  if (at < 0) throw new Error(`${board}: no "${heading}" on the home page`);
  const table = home.slice(at).match(/<table[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error(`${board}: no table after the heading`);
  const lines = cellsOf(table);
  if (lines[0]?.[0] !== "Stock Name" || lines[0]?.[1] !== "Base Price") throw new Error(`${board}: unexpected header ${lines[0]?.join("|")}`);
  const tickers = lines.slice(1).map((cells) => {
    const ticker = cells[0].replace(/\s*\(PLB\)\s*$/, "");
    if (!/^[A-Z]{2,6}$/.test(ticker)) throw new Error(`${board}: unreadable stock name ${JSON.stringify(cells[0])}`);
    return ticker;
  });
  if (tickers.length < floor) throw new Error(`${board}: ${tickers.length} shares on the home page`);
  if (new Set(tickers).size !== tickers.length) throw new Error(`${board}: repeated ticker in ${tickers.join(" ")}`);
  // The summary box sits before the heading: the last one that names the count.
  const boxes = [...home.slice(0, at).matchAll(new RegExp(`${summary}\\s*</td>\\s*<td[^>]*>\\s*(\\d+)\\s*<`, "g"))];
  const count = Number(boxes.at(-1)?.[1]);
  if (!count) throw new Error(`${board}: no "${summary}" count on the home page`);
  if (count !== tickers.length) throw new Error(`${board}: the box counts ${count} companies, the table holds ${tickers.length}`);
  return tickers;
}

// The YSX company table: "Company name (TICKER)", five-digit code, date.
async function ysxBoard({ board, ysx }) {
  const page = await get(ysx);
  const tickerOf = new Map([...page.matchAll(/>\s*([A-Za-z]+) \((\d{5})\)\s*</g)].map((m) => [m[2], m[1].toUpperCase()]));
  const table = page.match(/<table[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error(`YSX ${board}: no company table`);
  const lines = cellsOf(table);
  if (lines[0]?.[0] !== "Company name" || lines[0]?.[1] !== "Code") throw new Error(`YSX ${board}: unexpected header ${lines[0]?.join("|")}`);
  const companies = new Map();
  for (const cells of lines.slice(1).filter((cells) => /^\d{5}$/.test(cells[1]))) {
    const ticker = cells[0].match(/\(([A-Z]+)\)\s*$/)?.[1] || tickerOf.get(cells[1]);
    if (!ticker) throw new Error(`YSX ${board}: no ticker for ${cells[0]} ${cells[1]}`);
    companies.set(ticker, { name: cells[0].replace(/\s*\([A-Z]+\)\s*$/, ""), code: cells[1], since: cells[2] || "" });
  }
  return companies;
}

const home = await get(HOME);
const rows = [];
for (const spec of BOARDS) {
  const tickers = brokerBoard(home, spec);
  await sleep(500);
  const companies = await ysxBoard(spec);
  const missing = tickers.filter((ticker) => !companies.has(ticker));
  if (missing.length) throw new Error(`${spec.board}: on the broker page, not on the YSX list: ${missing.join(" ")}`);
  const extra = [...companies.keys()].filter((ticker) => !tickers.includes(ticker));
  if (extra.length) throw new Error(`${spec.board}: on the YSX list, not on the broker page: ${extra.join(" ")}`);
  for (const ticker of tickers) {
    const { name, code, since } = companies.get(ticker);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "Yangon Stock Exchange",
      mic: "YSX",
      currency: "MMK",
      type: "STOCK",
      isin: "",
      raw: [spec.board, ticker, name, `code ${code}`, since].join(" | "),
    });
  }
}

for (const ticker of ["FMI", "MTSH", "MADPL"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
}

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("cbsecurities-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} listings`, counts);
