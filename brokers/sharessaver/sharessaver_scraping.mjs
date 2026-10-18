// Shares Saver publishes an A-Z directory of the Nigerian Exchange (NGX)
// companies it buys for clients, each row with a "Buy shares" button, and a
// separate ETF page with "Buy monthly" buttons. No login.
//
//   https://sharessaver.com/buy-nigerian-shares
//   https://sharessaver.com/etfs
//
// Rows in the "ETFs" sector are ETFs, rows in "Funds" (listed infrastructure
// funds) are FUND, the rest are STOCK. The Dangote Refinery IPO application
// row is not a listed share and is skipped. The site does not show ISINs.
//
//   node brokers/sharessaver/sharessaver_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SHARES = "https://sharessaver.com/buy-nigerian-shares";
const ETFS = "https://sharessaver.com/etfs";

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
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

// One table row: logo, name + ticker, sector, profile link, buy button.
function tableRows(page) {
  const rows = [];
  for (const [, row] of page.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cell = row.match(/<a class="font-semibold[^"]*" href="[^"]*">([^<]*)<\/a><p[^>]*font-mono">([^<]*)<\/p>/);
    if (!cell) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => decode(match[1]));
    const buy = row.match(/href="\/buy-shares\?ticker=([^"&]+)"[^>]*>(Buy [a-z]+)/);
    rows.push({ name: decode(cell[1]), ticker: decode(cell[2]), sector: cells[2] || "", buy: buy?.[2] || "" });
  }
  return rows;
}

const shares = await get(SHARES);
const announced = Number(shares.match(/(\d+) companies by name or ticker/)?.[1]);
const directory = tableRows(shares);
if (!announced || directory.length !== announced) throw new Error(`directory announced ${announced}, parsed ${directory.length}`);
await sleep(300);
const etfs = tableRows(await get(ETFS));
if (etfs.length < 5) throw new Error(`ETF page parsed ${etfs.length} rows`);

const rows = [];
const seen = new Set();
for (const item of [...directory.map((row) => ({ ...row, from: "directory" })), ...etfs.map((row) => ({ ...row, sector: "ETFs", from: "etfs" }))]) {
  if (!item.buy || !item.ticker) continue;
  if (/\bIPO\b/.test(item.name) || /IPO$/.test(item.ticker)) continue;
  if (seen.has(item.ticker)) continue;
  seen.add(item.ticker);
  const type = item.sector === "ETFs" ? "ETF" : item.sector === "Funds" ? "FUND" : "STOCK";
  rows.push({
    query: item.ticker,
    ticker: item.ticker,
    name: item.name,
    exchange: "NGX",
    mic: "XNSA",
    currency: "NGN",
    type,
    isin: "",
    raw: [item.ticker, item.name, item.sector, item.buy].join(" | "),
  });
}

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("sharessaver-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
