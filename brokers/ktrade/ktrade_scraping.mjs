// KTrade Securities (KASB) publishes the PSX Symbols Directory, every
// security it lists on the Pakistan Stock Exchange, as one public page with
// no login.
//
// https://www.kasb.com/stocks/
//   One table: symbol, company name, market. Shares, preference shares,
//   modarabas, REITs, closed-end funds and ETFs are kept. Term finance
//   certificates (TFC) and sukuk certificates are debt, and a letter of
//   rights (LOR, "- RIGHT") is an entitlement, so these are left out. The
//   page carries no ISIN.
//
//   node brokers/ktrade/ktrade_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { withoutDelisted } from "../../psxStatus.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.kasb.com/stocks/";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function kindOf(name) {
  if (/exchange trade(d)? fund|\bETF\b/i.test(name)) return "ETF";
  if (/\bfund\b/i.test(name)) return "FUND";
  return "STOCK";
}

const html = await text(PAGE);
const start = html.indexOf('id="psx-dir-table"');
if (start < 0) throw new Error("PSX Symbols Directory table not found");
const table = html.slice(start, html.indexOf("</table>", start));
const announced = Number((html.match(/(\d[\d,]*)\s+listed securities/) || [])[1]?.replace(/,/g, ""));

const cells = [...table.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)];
if (!announced || cells.length !== announced) throw new Error(`table has ${cells.length} rows, page announces ${announced}`);

const listings = [];
const seen = new Set();
for (const [, symbolCell, nameCell, marketCell] of cells) {
  const ticker = clean(symbolCell).toUpperCase();
  const name = clean(nameCell);
  const market = clean(marketCell);
  if (!ticker) continue;
  if (/\bTFC\b|SUKUK/i.test(name) || /TFC\d*$/.test(ticker)) continue;
  if (/\bLOR\b|-\s*RIGHT\b/i.test(name)) continue;
  if (seen.has(ticker)) continue;
  seen.add(ticker);
  listings.push({
    query: ticker,
    ticker,
    name,
    exchange: "PSX",
    mic: "XKAR",
    currency: "PKR",
    type: kindOf(name),
    isin: "",
    raw: [ticker, name, "PSX", market].filter(Boolean).join(" "),
  });
}

listings.sort((left, right) => left.ticker.localeCompare(right.ticker));
// Delisted and suspended companies stay in the list but cannot be bought.
const written = withoutDelisted(withoutObligations(listings));
fs.writeFileSync(new URL("ktrade-parsed.json", import.meta.url), JSON.stringify(stampRows(written), null, 2));
const counts = {};
for (const row of written) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${written.length} listings of ${cells.length} directory rows`, counts);
