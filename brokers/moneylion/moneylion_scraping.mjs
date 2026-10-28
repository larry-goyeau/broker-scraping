// What MoneyLion sells in its Active Investing account (self-directed
// stocks and ETFs, fractional shares, in the MoneyLion app; advisory by ML
// Wealth LLC, execution and custody by DriveWealth, whose symbol icons the
// pages use). The investing page says "Choose from over 700 stocks and ETFs
// to invest in—all with zero commission fees"; a selection, not the whole
// US book.
//
// The selector is the site's own "Search for Stocks or ETFs" page. It needs
// no login: the page carries the whole list in its Next.js flight data
// (`{"results":[{href, ticker, name, iconUrl}, ...]}`, href /stock/<t>/ or
// /etf/<t>/), and the search box only filters that list in the browser
// (stock/search page chunk: name or ticker includes the query). That list
// is read here.
//
//   https://www.moneylion.com/stock/search
//   https://www.moneylion.com/investing      ("over 700 stocks and ETFs")
//
// The ticker pages are also in the sitemaps (sitemap-stock-1/2.xml and
// sitemap-etf-1.xml from https://www.moneylion.com/sitemap.xml). They are
// read only as a cross-check: the sitemaps keep pages of titles the search
// list has dropped or renamed (ANSS, HES, DFS, JNPR, CDAY -> DAY, ZI -> GTM,
// GPS -> GAP, CCCS -> CCC, MoneyLion's own ML...), so a sitemap ticker
// missing from the search list is reported, not added.
//
// The search list in turn still holds titles delisted long ago (XLNX,
// ZNGA, SPLK, CTXS...). Each search ticker is looked up in the US exchange
// book of the day (../wellstrade/usBook.mjs: Nasdaq Trader directories,
// less open trade halts); one that is not listed today is left out and
// reported, as are CVRs (GENVR), which usBook leaves out. Six search
// entries carry the ticker a still-listed title had before a symbol change
// (same company, same CUSIP); they are read under today's ticker, checked
// against the directory name (RENAMED below). The book gives the
// primary listing, the type (STOCK, ETF, ETN) and the ISIN (assets/stocks.csv
// and etfs.csv). The US is one NBBO market: one row per title, on its
// primary listing, in dollars.
//
// Fees ("No trading fees: ... No hidden fees when buying or selling stocks
// and ETFs"; no minimum, from $5 with fractional shares):
//   https://help.moneylion.com/en_us/what-is-the-active-investing-account-HkzEeeggkx
//
//   node brokers/moneylion/moneylion_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SITE = "https://www.moneylion.com";
const SEARCH = `${SITE}/stock/search`;
const INVESTING = `${SITE}/investing`;
const FEES = "https://help.moneylion.com/en_us/what-is-the-active-investing-account-HkzEeeggkx.md";
// Search ticker -> today's ticker after a symbol change, with the name the
// Nasdaq Trader directory must give the new line.
const RENAMED = {
  BK: ["BNY", /Bank of New York Mellon/i],
  MMC: ["MRSH", /^Marsh\b/i],
  SPLG: ["SPYM", /SPDR Portfolio S&P 500 ETF/i],
  PSTG: ["P", /Everpure/i],
  ATUS: ["OPTU", /Optimum Communications/i],
  MPW: ["MPT", /Medical Properties Trust/i],
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(last);
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&nbsp;|\s+/g, " ");

// The Next.js flight payload of a page: the self.__next_f.push([1,"..."])
// strings, joined.
function flight(html) {
  let text = "";
  for (const [, chunk] of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) text += JSON.parse(`"${chunk}"`);
  return text;
}

// The pages still say what the header quotes, or the run stops.
const investing = plain(await get(INVESTING));
if (!/Active Investing account/i.test(investing) || !/over 700 stocks and ETFs/i.test(investing)) throw new Error(`${INVESTING} no longer says "over 700 stocks and ETFs"`);
await pause();
const fees = (await get(FEES)).replace(/\s+/g, " ");
if (!/No trading fees/i.test(fees) || !/when buying or selling stocks and ETFs/i.test(fees)) throw new Error(`${FEES} no longer says "No trading fees"`);
await pause();

// The search list.
const data = flight(await get(SEARCH));
const start = data.indexOf('{"results":[');
if (start < 0) throw new Error(`${SEARCH}: no results list in the page data`);
let depth = 0;
let end = start;
for (let inString = false; end < data.length; end += 1) {
  const char = data[end];
  if (inString) {
    if (char === "\\") end += 1;
    else if (char === '"') inString = false;
  } else if (char === '"') inString = true;
  else if (char === "{" || char === "[") depth += 1;
  else if ((char === "}" || char === "]") && --depth === 0) break;
}
const results = JSON.parse(data.slice(start, end + 1)).results;
const selector = new Map();
for (const item of results) {
  const match = String(item.href || "").match(/^\/(stock|etf)\/([^/]+)\/$/);
  if (!match || !item.ticker || match[2] !== item.ticker.toLowerCase()) throw new Error(`search entry not read: ${JSON.stringify(item)}`);
  selector.set(item.ticker.toUpperCase(), { kind: match[1], name: String(item.name || "").trim(), href: item.href });
}
if (selector.size < 650) throw new Error(`search list holds only ${selector.size} titles`);

// The sitemaps, for the cross-check.
const index = await get(`${SITE}/sitemap.xml`);
const maps = [...index.matchAll(/<loc>([^<]*sitemap-(?:stock|etf)-\d+\.xml)<\/loc>/g)].map((match) => match[1]);
if (maps.length < 2) throw new Error(`sitemap index lists ${maps.length} stock/ETF sitemaps`);
const sitemap = new Set();
for (const map of maps) {
  await pause();
  for (const [, ticker] of (await get(map)).matchAll(/<loc>https:\/\/www\.moneylion\.com\/(?:stock|etf)\/([^/<]+)\/<\/loc>/g)) sitemap.add(ticker.toUpperCase());
}
const sitemapOnly = [...sitemap].filter((ticker) => !selector.has(ticker) && !selector.has(ticker.replace(/-/g, "."))).sort();

// Listed today, from the US book.
const book = await usBook();
const byTicker = new Map(book.map((row) => [row.ticker, row]));
const rows = [];
const notListed = [];
const kindMismatch = [];
const renamed = [];
for (const [ticker, entry] of selector) {
  let row = byTicker.get(ticker);
  if (!row && RENAMED[ticker]) {
    const [now, name] = RENAMED[ticker];
    row = byTicker.get(now);
    if (!row || !name.test(row.name)) throw new Error(`${ticker} -> ${now} not confirmed by the directory: ${row ? row.name : "not listed"}`);
    if (selector.has(now)) throw new Error(`${now} is in the search list too`);
    renamed.push(`${ticker} -> ${now}`);
  }
  if (!row) {
    notListed.push(`${ticker} (${entry.name})`);
    continue;
  }
  if ((entry.kind === "etf") !== (row.type !== "STOCK")) kindMismatch.push(`${ticker} ${entry.href} is ${row.type}`);
  rows.push({ ...row, raw: `${entry.href} | ${entry.name} | ${row.raw}` });
}
rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
const shares = kept.filter((row) => row.type === "STOCK").length;
if (kept.length < 650 || shares < 550) throw new Error(`only ${kept.length} rows (${shares} shares)`);
fs.writeFileSync(new URL("moneylion-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
const kinds = [...selector.values()].reduce((sum, entry) => ((sum[entry.kind] = (sum[entry.kind] || 0) + 1), sum), {});
console.error(`search list ${selector.size} titles (${kinds.stock} /stock, ${kinds.etf} /etf); stated "over 700"`);
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")}), ${kept.filter((row) => row.isin).length} with an ISIN`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
console.error(`left out ${notListed.length} not listed today: ${notListed.join("; ")}`);
console.error(`read under today's ticker ${renamed.length}: ${renamed.join(", ")}`);
if (kindMismatch.length) console.error(`page kind differs from the book (book kept): ${kindMismatch.join("; ")}`);
console.error(`sitemap pages not in the search list (not added) ${sitemapOnly.length}: ${sitemapOnly.join(", ")}`);
