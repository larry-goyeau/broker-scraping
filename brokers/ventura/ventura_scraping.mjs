// What Ventura Securities (India) sells in shares and ETFs, with no login.
// The "All Stocks" screener on venturasecurities.com is the book: one tab
// for the NSE (segment=0) and one for the BSE (segment=1), 15 lines a
// page. The page is read in its short React form (RSC header); each line
// carries the symbol, the NSE and BSE tokens, the ISIN, the market cap and
// a sector. ETFs are in the same screener, in the ETF sector, with an INF
// ISIN; a few are filed under "Others" (Motilal Oswal Midcap 150 ETF, HDFC
// Nifty Bank ETF). The separate ETF list (/invest/all-etfs-list) pages in
// the browser only and is not needed.
//
// The screener sorts by price, and its order is not the same from one
// page to the next: a plain walk through the pages shows a few lines
// twice and never shows others (Repco Home Finance in October 2026). The
// total it prints is right. When the walk falls short, the list is read
// again in market cap bands (the mcap=min,max filter), a band that is
// still short is split, and the zero band (ETFs, SME lines) is split by
// sector. Every line must be found, or nothing is written.
//
// A line is checked against the exchange before it is written:
// - NSE: the symbol must be in today's NSE cash book (NSE EQUITY_L and the
//   Upstox instrument file, ../../indianCash.mjs). That drops rights
//   entitlements (-RE) and dead lines the screener still shows at price 0
//   (SDL26BEES, SECL). A symbol the NSE has changed is found by its ISIN
//   (ICICIPRULI, now ICICILIFE). The ISIN is the exchange's: Ventura
//   keeps the old one for a few names (Azad India Mobility, on both
//   exchanges).
// - BSE: a line with no ISIN is a long-dead scrip at price 0 (Scindia
//   Steam Navigation), a -RE line is a rights entitlement (about 500,
//   most long expired), and a line the BSE's own scrip status list has as
//   Suspended or Delisted and on no Active scrip (../lemonn/bseStatus.mjs)
//   is closed (about 460 in October 2026); all are left out. So is a fund
//   line the exchange no longer trades (Bharat Bond ETF April 2023 and
//   2025, matured).
// - An INF ISIN in the ETF sector, or named ETF/BeES, is an ETF. Other INF
//   lines are fixed maturity plans and specialised investment fund units
//   on the BSE (HDFC FMP, Kotak and ICICI SIF lines), not ETFs, and stay
//   out. Every other line is a STOCK: shares, REITs, InvITs, SME shares,
//   DVRs and partly paid shares (IN9 ISIN).
//
// The exchange book completes the screener. The whole NSE and BSE book is
// read and filtered as for the other Indian brokers (../bajaj/indiaBook.mjs:
// share series and groups, ETFs by the NSE ETF list, the BSE's ETF group
// or name; debt lines, other fund units, iNAV lines, rights entitlements,
// BSE scrips the BSE lists as Suspended or Delisted and NSE lines listed
// after today left out), and every title of it the screener lacks is
// added, marked "exchange book" in raw. The screener lags new listings
// (in October 2026 it lacked BONFIG, SMT, TONBO, ZETWERK and JPL on the
// NSE for a few days) and leaves some BSE lines out: on 2026-10-28, 62 BSE
// shares (56 in group P, shares listed elsewhere and only permitted on the
// BSE) and 7 BSE Sensex ETFs (SENSEXBEES, SETFBSE100...), 69 rows added.
// Ventura is a full-service NSE and BSE member that trades every
// listed security. Owner's rule (2026-10-28): a title whose availability
// is uncertain is kept, since a catalogue with more titles than reality
// beats one with fewer. Far more missing stops the run: it means the
// screener or the join went wrong.
//
// Fees: delivery and intraday cost Rs 9 an order or 0.05%, whichever is
// lower (exclusive pricing plan page). Everything is in rupees.
//
//   https://www.venturasecurities.com/invest/stocks/filter?segment=0&page=0
//   https://www.venturasecurities.com/invest/stocks/filter?segment=1&page=0
//   https://www.venturasecurities.com/invest/stocks/filter?segment=0&page=0&mcap=1500%2C2500
//   https://www.venturasecurities.com/exclusive-pricing-plan/
//   https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
//   https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz
//   https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Suspended
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Active
//
//   node brokers/ventura/ventura_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { indiaLists, wholeIndia } from "../bajaj/indiaBook.mjs";
import fs from "node:fs";

const SCREENER = "https://www.venturasecurities.com/invest/stocks/filter";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const PAGE_SIZE = 15;
const WORKERS = 6;
const PLACES = [
  { segment: 0, exchange: "NSE", mic: "XNSE", token: "nse_token" },
  { segment: 1, exchange: "BSE", mic: "XBOM", token: "bse_token" },
];
// About 85% of the lines kept on 2026-10-23 (NSE 3,575 with 355
// ETFs, BSE 5,075 with 273 ETFs).
const FLOOR = { NSE: { all: 3000, etf: 300 }, BSE: { all: 4300, etf: 230 } };
// Market caps are whole crores; the largest was 1,633,783.
// Exchange titles a screener may lack, added from the book. Far more
// means the screener or the join went wrong.
const MISSING_CEILING = { NSE: 60, BSE: 400 };
const BANDS = [[0, 0], [1, 25], [26, 100], [101, 300], [301, 800], [801, 2000], [2001, 5000], [5001, 15000], [15001, 60000], [60001, 3000000]];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, RSC: "1" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await pause(1_500 * (attempt + 1));
  }
  throw new Error(last);
}

// The JSON object that starts at the "{" of `key` in the React payload.
function objectAt(text, key) {
  const at = text.indexOf(key);
  if (at < 0) return null;
  const start = at + key.indexOf("{");
  let depth = 0;
  let quoted = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === "\\") i += 1;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}

async function screenerPage(segment, page, filter) {
  const query = new URLSearchParams({ segment: String(segment), page: String(page), ...filter });
  const url = `${SCREENER}?${query}`;
  const text = await getText(url);
  const data = objectAt(text, '"data":{"ttl"');
  if (!data || !Number.isInteger(data.ttl) || !Array.isArray(data.stocks)) throw new Error(`${url} has no stock table`);
  return { data, text };
}

// Every page of one screener query. `unique` is the number of distinct
// lines the walk found; it is short of `ttl` when the shifting order hid
// some.
async function readQuery(place, filter = {}) {
  const { data } = await screenerPage(place.segment, 0, filter);
  const pages = Math.ceil(data.ttl / PAGE_SIZE);
  const lines = [...data.stocks];
  let next = 1;
  async function worker() {
    while (next < pages) {
      const page = next++;
      const { data: more } = await screenerPage(place.segment, page, filter);
      const expected = page === pages - 1 ? data.ttl - page * PAGE_SIZE : PAGE_SIZE;
      if (more.stocks.length !== expected) throw new Error(`${place.exchange} ${JSON.stringify(filter)} page ${page} has ${more.stocks.length} lines, not ${expected}`);
      lines.push(...more.stocks);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  const unique = new Set(lines.map((line) => String(line[place.token])));
  return { ttl: data.ttl, lines, unique: unique.size };
}

function checkLine(place, line) {
  for (const field of ["symbol", "name", "isin", "sector", "market_cap", "nse_token", "bse_token"]) {
    if (!(field in line)) throw new Error(`${place.exchange} line ${JSON.stringify(line).slice(0, 160)} has no ${field}`);
  }
  if (!line.symbol || !line[place.token]) throw new Error(`${place.exchange} line ${line.symbol} has no symbol or token`);
}

// The sector groups of the filter panel, as lists of sector ids. Id 0 (in
// Media & Entertainment) makes the server drop the table, so it is left out.
async function sectorGroups(place) {
  const { text } = await screenerPage(place.segment, 0, {});
  const panel = objectAt(text, '"data":{"nse_index"');
  if (!panel?.sector || Object.keys(panel.sector).length < 30) throw new Error(`${place.exchange} filter panel has no sector list`);
  return Object.entries(panel.sector).map(([group, ids]) => [group, Object.keys(ids).filter((id) => id !== "0").join(",")]);
}

async function readPlace(place) {
  const found = new Map();
  const add = (lines) => {
    for (const line of lines) {
      checkLine(place, line);
      const token = String(line[place.token]);
      const prior = found.get(token);
      if (prior && (prior.symbol !== line.symbol || prior.isin !== line.isin)) throw new Error(`${place.exchange} token ${token} is both ${prior.symbol} and ${line.symbol}`);
      found.set(token, line);
    }
  };
  const full = await readQuery(place);
  add(full.lines);
  const total = full.ttl;
  const reads = { pages: Math.ceil(total / PAGE_SIZE), shortFirst: total - full.unique };
  if (found.size < total) {
    let groups = null;
    const band = async (low, high) => {
      if (found.size >= total) return;
      const result = await readQuery(place, { mcap: `${low},${high}` });
      reads.pages += Math.ceil(result.ttl / PAGE_SIZE);
      add(result.lines);
      if (result.unique >= result.ttl) return;
      if (low < high) {
        const middle = Math.floor((low + high) / 2);
        await band(low, middle);
        await band(middle + 1, high);
        return;
      }
      groups ||= await sectorGroups(place);
      for (const [, ids] of groups) {
        if (found.size >= total) return;
        const part = await readQuery(place, { mcap: `${low},${high}`, sectors: ids });
        reads.pages += Math.ceil(part.ttl / PAGE_SIZE);
        add(part.lines);
      }
    };
    for (const [low, high] of BANDS) await band(low, high);
  }
  if (found.size !== total) throw new Error(`${place.exchange} screener says ${total} lines, ${found.size} found after reading it in bands`);
  return { lines: [...found.values()], total, reads };
}

const isEtf = (line, isin) => isin.startsWith("INF") && (line.sector === "ETF" || /\bETF\b|BEES\b/i.test(line.name));
const cleanName = (name) => String(name || "").replace(/\s+/g, " ").trim().replace(/\s+Share Price$/i, "");

const lists = await indiaLists();
const { book, bse } = lists;
const bseIsins = new Set([...book].filter(([key]) => key.startsWith("BSE|")).map(([, entry]) => entry.isin));
const nseByIsin = new Map([...book].filter(([key]) => key.startsWith("NSE|")).map(([key, entry]) => [entry.isin, key.slice(4)]));
const whole = wholeIndia(lists);
const rows = [];
const report = [];
for (const place of PLACES) {
  const { lines, total, reads } = await readPlace(place);
  const left = { notTraded: 0, noIsin: 0, rights: 0, suspended: 0, delisted: 0, matured: 0, fundUnit: 0 };
  let isinFixed = 0;
  let renamed = 0;
  const seen = new Set();
  for (const line of lines) {
    let ticker = String(line.symbol).trim().toUpperCase();
    let isin = String(line.isin || "").trim().toUpperCase();
    if (place.exchange === "NSE") {
      let entry = book.get(`NSE|${ticker}`);
      // A symbol the NSE has since changed is found by its ISIN and written
      // under the new symbol (ICICIPRULI is now ICICILIFE).
      if (!entry && nseByIsin.has(isin)) {
        ticker = nseByIsin.get(isin);
        entry = book.get(`NSE|${ticker}`);
        renamed += 1;
      }
      if (!entry?.isin) { left.notTraded += 1; continue; }
      if (entry.isin !== isin) isinFixed += 1;
      isin = entry.isin;
    } else {
      if (!/^IN[A-Z0-9]{10}$/.test(isin)) { left.noIsin += 1; continue; }
      if (/-RE\d*$/.test(ticker)) { left.rights += 1; continue; }
      const status = bse.statusOf(isin, ticker);
      if (status) { left[status] += 1; continue; }
      const entry = book.get(`BSE|${ticker}`);
      if (entry?.isin && entry.isin !== isin) {
        isinFixed += 1;
        isin = entry.isin;
      }
    }
    if (isin.startsWith("INF") && !isEtf(line, isin)) { left.fundUnit += 1; continue; }
    if (place.exchange === "BSE" && isin.startsWith("INF") && !bseIsins.has(isin)) { left.matured += 1; continue; }
    const type = isin.startsWith("INF") ? "ETF" : "STOCK";
    const key = `${place.exchange}|${isin}`;
    if (seen.has(key)) throw new Error(`${key} is on two ${place.exchange} lines`);
    seen.add(key);
    const name = cleanName(line.name) || ticker;
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: place.exchange,
      currency: "INR",
      type,
      isin,
      mic: place.mic,
      raw: [ticker, name, place.exchange, line[place.token], isin, type, line.sector].filter(Boolean).join(" "),
    });
  }
  const kept = rows.filter((row) => row.exchange === place.exchange);
  const etfs = kept.filter((row) => row.type === "ETF").length;
  if (kept.length < FLOOR[place.exchange].all || etfs < FLOOR[place.exchange].etf) throw new Error(`${place.exchange}: only ${kept.length} lines kept, ${etfs} ETFs`);
  // About 20 NSE and 1,070 BSE lines were left out in October 2026; far
  // more means a list or the ISINs went wrong.
  const dropped = Object.values(left).reduce((sum, value) => sum + value, 0);
  if (dropped > (place.exchange === "NSE" ? 80 : 1500)) throw new Error(`${place.exchange}: ${dropped} lines left out ${JSON.stringify(left)}`);
  // The exchange book completes the screener: a title of the book it lacks
  // is added, marked in raw.
  const missing = whole.filter((row) => row.exchange === place.exchange && !seen.has(`${row.exchange}|${row.isin}`));
  if (missing.length > MISSING_CEILING[place.exchange]) throw new Error(`${place.exchange}: ${missing.length} titles of the exchange book are not in the screener: ${missing.slice(0, 30).map((row) => row.ticker).join(" ")}`);
  for (const row of missing) rows.push({ ...row, raw: `${row.raw} exchange book` });
  report.push(`${place.exchange} ${kept.length - etfs} STOCK ${etfs} ETF of ${total} screener lines (${reads.pages} pages, ${reads.shortFirst} hidden on the first walk; left out ${Object.entries(left).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}${isinFixed ? `; ${isinFixed} ISINs from the exchange` : ""}${renamed ? `; ${renamed} renamed symbols` : ""}), ${missing.length} added from the exchange book (${missing.slice(0, 15).map((row) => row.ticker).join(" ")}${missing.length > 15 ? " ..." : ""})`);
}

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
const kept = withoutObligations(rows);
fs.writeFileSync(new URL("ventura-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));
const count = (type) => kept.filter((row) => row.type === type).length;
console.error(`${kept.length} listings (${count("STOCK")} STOCK, ${count("ETF")} ETF); ${report.join("; ")}`);
