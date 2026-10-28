// What TIAA Brokerage (TIAA-CREF Individual & Institutional Services,
// carried by Pershing) sells in shares and exchange-traded products, with
// no login. TIAA publishes no list of titles. Its fee summary prices
// "Online equities, ETFs and options: No charge", and its equity notes
// name what it will not buy:
//   "Orders to buy shares priced under $1, restricted shares, non-permitted
//   cannabis-related business (CRB) securities, foreign securities,
//   privately held securities, shares without a market price or both a
//   bid/ask will not be accepted."
// (same wording in the commission schedule of the Brokerage Customer
// Account Agreement). tiaa.org does not answer plain HTTP clients, so the
// pages were read from their Wayback Machine copies:
//
//   https://www.tiaa.org/public/pdf/commissions_and_fees.pdf
//     (web.archive.org/web/20251119052108id_/...)
//   https://www.tiaa.org/public/pdf/BrokerageAccountCustomerAgreement.pdf
//     (web.archive.org/web/20250710035627id_/...)
//   https://www.tiaa.org/public/invest/financial-products/brokerage-accounts-fees
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: every share, ADR, REIT, partnership unit,
// preferred, closed-end fund, ETF and ETN listed on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the lines
// with an open trade halt), less the lines whose last sale is under $1,
// which TIAA will not buy. The last sale is the one of Nasdaq's public
// stock and ETF screeners (every US-listed line, read once each):
//
//   https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true
//   https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true
//
// A line the screeners do not price stays.
// Not applied, as they are not a property of a listed line the sources
// show: "restricted shares" and "privately held securities" (not on the
// tape), "foreign securities" (shares on foreign exchanges, not this place;
// the schedule's foreign-order fee is "not applicable to American
// Depositary Receipts", so ADRs stay), "non-permitted" cannabis-related
// securities (TIAA names no list or test; a remark), and "shares without a
// market price or both a bid/ask" (no free source gives that for every
// line). TIAA's Exchange Traded Products Risk Disclosure tells holders of
// single-stock levered and inverse ETFs "You can continue to hold them or
// choose to sell them" but does not say they cannot be bought, so they
// stay (a remark).
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no TIAA page says
// they can be bought online.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees ($0 online equities and ETFs; $55 through Client Service
// Assistance):
//   https://www.tiaa.org/public/pdf/commissions_and_fees.pdf
//
//   node brokers/tiaa/tiaa_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { houseTicker, usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SCREENERS = [
  ["stocks", "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true", 5000],
  ["etf", "https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true", 3000],
];
const MIN_PRICE = 1;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// Screener symbol -> house ticker: BRK/B is BRK.B, ABR^D is ABR.PRD.
function screenerTicker(symbol) {
  return houseTicker(String(symbol || "").trim().toUpperCase().replace(/\//g, ".").replace(/\^/g, "$"));
}

// House ticker -> last sale in dollars, from both screeners.
async function lastSales() {
  const prices = new Map();
  for (const [label, url, least] of SCREENERS) {
    const body = await getJson(url);
    const list = body?.data?.rows || body?.data?.data?.rows;
    if (!Array.isArray(list) || list.length < least) throw new Error(`Nasdaq ${label} screener: ${Array.isArray(list) ? list.length : "no"} rows`);
    for (const item of list) {
      const price = Number(String(item.lastsale ?? item.lastSalePrice ?? "").replace(/[$,\s]/g, ""));
      if (item.symbol && Number.isFinite(price) && price > 0) prices.set(screenerTicker(item.symbol), price);
    }
    await sleep(2000);
  }
  for (const [ticker, low, high] of [["AAPL", 20, 2000], ["SPY", 100, 2000]]) {
    const price = prices.get(ticker);
    if (!(price > low && price < high)) throw new Error(`Nasdaq screener prices ${ticker} at ${price}`);
  }
  return prices;
}

const rows = await usBook();
const prices = await lastSales();
const cheap = [];
const priced = rows.filter((row) => {
  const price = prices.get(row.ticker);
  if (price !== undefined && price < MIN_PRICE) {
    cheap.push(`${row.ticker} $${price}`);
    return false;
  }
  return true;
});
const kept = stampRows(withoutObligations(priced));
if (kept.length < 10000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL("tiaa-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(rows.report.directories)}; halts: ${rows.report.halts.join(", ")}`);
console.error(`${rows.filter((row) => prices.has(row.ticker)).length} of ${rows.length} book lines priced by the Nasdaq screeners`);
console.error(`left out ${cheap.length} lines under $${MIN_PRICE} (${cheap.slice(0, 12).join(", ")}${cheap.length > 12 ? ", ..." : ""})`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (kept.length < priced.length) console.error(`${priced.length - kept.length} bonds left out`);
