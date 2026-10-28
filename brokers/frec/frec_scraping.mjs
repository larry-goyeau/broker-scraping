// What Frec (Frec Markets, Inc.) sells in a self-managed portfolio, with no
// login. Its help centre names the universe, not a list:
// "We offer trading of most mega-cap, large-cap, and mid-cap stocks, along
// with ETFs, ETNs, and ADRs traded on major U.S. exchanges", "Frec doesn't
// currently support trading OTC securities in self-managed portfolios" and
// "Symbols priced under $1 aren't supported for new trades". The ADR page
// adds "Frec supports trading a subset of ADRs" and that OTC ADRs cannot be
// bought. So the book is the US exchange book of the day, read by
// ../wellstrade/usBook.mjs (Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe
// BZX, Texas Stock Exchange; warrants, rights, units, when-issued lines,
// listed notes and halted lines are left out there), cut to that sentence:
//
// - Shares: only mega-, large- and mid-cap companies, read as a market
//   value of $2 billion or more (the usual floor of mid caps) in Nasdaq's
//   stock screener, which gives the market value and last sale of every
//   US-listed share. A share the screener gives no market value is left
//   out, since its size cannot be told. "Most" cannot be checked from
//   outside, so every line over the floor stays.
// - ADRs: kept at any size ("ADRs traded on major U.S. exchanges"), when
//   the name says American Depositary Shares/Receipts. Which ADRs make
//   Frec's "subset" is not published, so all listed ones stay.
// - ETFs and ETNs: kept.
// - Preferreds and closed-end funds: out. The sentence lists stocks by
//   size, ETFs, ETNs and ADRs, and neither is one of those
//   (usBook({ preferreds: false, closedEnd: false })).
// - Any line whose last sale is under $1 (screener price for shares and
//   ETFs): out, as no new trade can be placed in it.
// - OTC lines are not in the book.
// The US is one NBBO market: one row per title on its primary listing, in
// dollars.
//
// Fees: "Commission fee/Markups $0" under Securities transactions in the
// pricing and fee schedule (effective 1 October 2026).
//
//   https://help.frec.com/en-us/securities-available-to-trade-on-frec
//   https://help.frec.com/en-us/american-depositary-receipts-adrs
//   https://help.frec.com/en-us/exchange-traded-funds-etfs
//   https://docs.frec.com/pricing-fee-schedule.pdf   (fees)
//   https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true
//   https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true
//
//   node brokers/frec/frec_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const UNIVERSE = "https://help.frec.com/en-us/securities-available-to-trade-on-frec";
const STOCKS = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true";
const ETFS = "https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true";
const MID_CAP = 2e9;
const ADR = /American Depositary|Depositary Receipt|\bADS\b|\bADRs?\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function text(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

const money = (value) => Number(String(value || "").replace(/[$,]/g, "")) || 0;
// Screener codes write BRK/B and a preferred NLY^G; the book writes BRK.B.
const bookTicker = (symbol) => String(symbol || "").trim().toUpperCase().replace(/\//g, ".");

// The page still says what the header quotes, or the run stops.
const page = (await text(UNIVERSE, "text/html")).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").replace(/[‘’]/g, "'");
for (const pattern of [
  /most mega-cap, large-cap, and mid-cap stocks, along with ETFs, ETNs, and ADRs traded on major U\.S\. exchanges/i,
  /doesn't currently support trading OTC securities in self-managed portfolios/i,
  /Symbols priced under \$1 aren't supported for new trades/i,
]) {
  if (!pattern.test(page)) throw new Error(`${UNIVERSE} no longer says ${pattern}`);
}

await sleep(1000);
const stockRows = JSON.parse(await text(STOCKS, "application/json")).data?.rows || [];
await sleep(1000);
const etfBody = JSON.parse(await text(ETFS, "application/json")).data;
const etfRows = etfBody?.rows || etfBody?.data?.rows || [];
if (stockRows.length < 5000 || etfRows.length < 3000) throw new Error(`short screener: ${stockRows.length} shares, ${etfRows.length} ETFs`);

const screen = new Map();
for (const line of stockRows) screen.set(bookTicker(line.symbol), { cap: money(line.marketCap), price: money(line.lastsale), name: line.name });
for (const line of etfRows) {
  const ticker = bookTicker(line.symbol);
  if (!screen.has(ticker)) screen.set(ticker, { cap: 0, price: money(line.lastSalePrice), name: line.companyName });
}

const book = await usBook({ preferreds: false, closedEnd: false });
const left = { small: [], noCap: [], under1: [] };
const kept = [];
for (const row of book) {
  const quote = screen.get(row.ticker);
  if (quote && quote.price > 0 && quote.price < 1) {
    left.under1.push(row.ticker);
    continue;
  }
  if (row.type !== "STOCK") {
    kept.push(row);
    continue;
  }
  if (ADR.test(row.name) || ADR.test(quote?.name || "")) {
    kept.push(row);
  } else if (!quote || !quote.cap) {
    left.noCap.push(row.ticker);
  } else if (quote.cap < MID_CAP) {
    left.small.push(row.ticker);
  } else {
    kept.push(row);
  }
}

const shares = kept.filter((row) => row.type === "STOCK").length;
if (shares < 1500 || kept.length - shares < 4000) throw new Error(`short book: ${shares} shares, ${kept.length - shares} ETFs/ETNs`);
for (const ticker of ["AAPL", "BRK.B", "SPY", "TSM"]) if (!kept.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);

const rows = stampRows(withoutObligations(kept));
fs.writeFileSync(new URL("frec-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
console.error(`left out ${left.small.length} shares under $2bn, ${left.noCap.length} shares with no market value (${left.noCap.slice(0, 30).join(" ")}), ${left.under1.length} lines under $1`);
