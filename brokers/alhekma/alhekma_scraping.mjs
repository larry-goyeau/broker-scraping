// What Al-Hekma Financial Services (Amman) sells, with no login. Its FAQ
// answers "What are the Stocks traded by Al Hekma?" with "All listed
// companies at ASE", so the book is the Amman Stock Exchange's own list of
// listed shares (first and second market), one table on the exchange site:
// name, short name, symbol, ASE code, market, listed shares, status.
//
//   https://hekma-fs.com/page/15/FAQ
//   https://www.exchange.jo/en/products-services/securties-types/shares
//
// The ISIN comes from the Securities Depository Center's ISIN list (the
// Jordanian numbering agency), joined on the ASE security number. Its four
// sector pages are read; bond and sukuk lines there are not used.
//
//   https://sdc.com.jo/en/isinList?cat=900&sub_cat=1&status=active  (to sub_cat=4)
//
// All rows are ASE shares in dinars; the ASE has no ETFs. A line the ASE
// marks "Restricted Trading" stays: it is listed and takes orders under
// conditions. The place is written out in full: "ASE" alone reads as NYSE
// American in the venue table.
//
//   node brokers/alhekma/alhekma_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ASE = "https://www.exchange.jo/en/products-services/securties-types/shares";
const SDC = (sector) => `https://sdc.com.jo/en/isinList?cat=900&sub_cat=${sector}&status=active`;
const MARKETS = { 1: "First Market", 2: "Second Market" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await sleep(1_000 * (attempt + 1));
  }
  throw new Error(last);
}

const clean = (text) =>
  String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tableRows(html) {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map(([row]) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, cell]) => clean(cell)));
}

// ASE security number -> ISIN, shares only.
const isinOf = new Map();
for (const sector of [1, 2, 3, 4]) {
  for (const [, number, isin, , kind] of tableRows(await get(SDC(sector)))) {
    if (kind !== "Share" || !/^JO[A-Z0-9]{9}\d$/.test(isin || "")) continue;
    isinOf.set(number, isin);
  }
}
if (isinOf.size < 150) throw new Error(`the SDC lists only ${isinOf.size} share ISINs`);

const rows = [];
const seen = new Set();
const counts = {};
for (const cells of tableRows(await get(ASE))) {
  if (cells.length !== 8 || cells[0] === "Company's name") continue;
  const [name, short, symbol, code, market, , status, notes] = cells;
  if (!/^[A-Z0-9]{2,6}$/.test(symbol) || !/^\d{6}$/.test(code)) throw new Error(`ASE row ${cells.join(" | ")}`);
  if (seen.has(symbol)) continue;
  seen.add(symbol);
  const marketName = MARKETS[market] || `Market ${market}`;
  rows.push({
    query: symbol,
    ticker: symbol,
    name,
    exchange: "Amman Stock Exchange",
    mic: "XAMM",
    currency: "JOD",
    type: "STOCK",
    isin: isinOf.get(code) || "",
    raw: [symbol, name, short, code, marketName, status, notes].filter(Boolean).join(" | "),
  });
  counts[marketName] = (counts[marketName] || 0) + 1;
}
// 154 listed companies on 2026-10-22.
if (rows.length < 130) throw new Error(`the ASE table gave only ${rows.length} shares`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const kept = withoutObligations(rows);
fs.writeFileSync(new URL("alhekma-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));
console.error(counts);
console.error(`${kept.length} ASE shares, ${kept.filter((row) => row.isin).length} with an ISIN`);
