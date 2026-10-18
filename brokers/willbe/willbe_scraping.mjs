// What willbe (LLB, Liechtenstein) sells in ETFselect, with no login.
// willbe sells no single shares. The ETF page ends with a table that it
// calls the list of all its ETF and funds: title, ISIN, TER, share class
// and currency. The "Active Fonds" table on the same page names the LLB
// and UBS funds; the iNdx lines are LLB index funds too. Those are funds.
// A line whose name says ETC or ETP, or a physical bitcoin or ether line,
// is an ETC; ETN when the name says ETN. The rest are ETFs.
//
// Orders are pooled once a day and placed "in various global trading
// venues", so no exchange is stored. The table prints no ticker, so the
// ISIN is the ticker. The currency is the one the table prints.
//
//   https://willbe-invest.com/en/invest/etf-savings-plan/our-etf-and-fonds
//   https://willbe-invest.com/en/invest/etf-savings-plan/etf-tables/active-fonds-table?iframe=1
//   https://mobilep.willbe-invest.com/en/about-willbe/faq
//
//   node brokers/willbe/willbe_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST = "https://willbe-invest.com/en/invest/etf-savings-plan/our-etf-and-fonds";
const ACTIVE = "https://willbe-invest.com/en/invest/etf-savings-plan/etf-tables/active-fonds-table?iframe=1";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

function normalize(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function page(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
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

// Every table row with the header Title | ISIN | TER | Type | Currency.
function tableRows(html) {
  const rows = [];
  for (const [row] of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => normalize(match[1]));
    if (cells.length < 5 || !ISIN.test(cells[1])) continue;
    const [title, isin, ter, share, currency] = cells;
    rows.push({ title, isin, ter, share, currency });
  }
  return rows;
}

function kindOf(name, funds, isin) {
  if (funds.has(isin) || /^(iNdx|LLB)\b/i.test(name)) return "FUND";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\b(ETC|ETP)\b/i.test(name) || /\bPhysical (Bitcoin|Ethereum)\b/i.test(name)) return "ETC";
  return "ETF";
}

const all = tableRows(await page(LIST));
const funds = new Set(tableRows(await page(ACTIVE)).map((row) => row.isin));
if (all.length < 80) throw new Error(`the full table has only ${all.length} lines`);
if (funds.size < 5) throw new Error(`the active-fund table has only ${funds.size} lines`);

const rows = [];
const seen = new Set();
for (const line of all) {
  if (seen.has(line.isin)) continue;
  seen.add(line.isin);
  rows.push({
    query: line.isin,
    ticker: line.isin,
    name: line.title,
    currency: line.currency.toUpperCase(),
    type: kindOf(line.title, funds, line.isin),
    isin: line.isin,
    raw: [line.title, line.isin, line.ter, line.share, line.currency].filter(Boolean).join(" "),
  });
}
for (const isin of funds) if (!seen.has(isin)) throw new Error(`active fund ${isin} is not in the full table`);

rows.sort((left, right) => left.name.localeCompare(right.name) || left.isin.localeCompare(right.isin));
fs.writeFileSync(new URL("willbe-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const counts = {};
for (const row of rows) counts[`${row.type} ${row.currency}`] = (counts[`${row.type} ${row.currency}`] || 0) + 1;
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${rows.length} rows`);
