// The Saudi Exchange (Tadawul) Main Market book, for the brokers that sell
// Saudi shares with no list of their own (../investsky,
// ../globalsecurities). Every Main Market share and REIT and every ETF the
// exchange quotes, in riyals, less the suspended lines. Read from the
// exchange's own public pages (saudiexchange.sa), with no login.
//
// Shares and REITs: the Main Market watch (all sectors) loads its table
// from one portal call, NJgetMainNomucMarketDetails, that prints every
// Main Market line of the session with its symbol, English name, sector,
// last trade, bid, ask and volume. The REITs sector is the listed real
// estate funds; a REIT trades like a share and is written as STOCK, as in
// ../sahm. The colour flag (companyStatus 1, 2, 3) marks accumulated
// losses of 20-35%, 35-50% and 50% or more of the capital: those lines
// trade and stay; the flag is kept in raw.
//
//   https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/main-market-watch?locale=en
//
// ETFs: the ETF market watch prints every ETF of the session by name; the
// historical-reports page gives each ETF's symbol (NJpopulateEntity,
// market ETFS). A name the two do not share stops the run.
//
//   https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/funds-market-watch/Etfsv2/etf-market-watch?locale=en
//   https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/reports-publications/historical-reports?locale=en
//
// Suspended lines: the issuers-trading-information page lists every
// suspension of a company or a fund (NJgetSuspendedDelistedComp, form
// types Suspension and Suspension_Funds), each with its start and, once
// lifted, its end date. The list does not always close a suspension that
// was lifted (Tihama Advertising, 4070, is open there since July 2024 and
// trades every day), so a line is left out when its latest suspension is
// open and the session shows no trade, no bid and no ask on it (on 25
// October 2026: 2210 Nama Chemicals, suspended 30 April 2026, and 8190
// United Cooperative Assurance, 13 September 2026). Before the session
// opens (fewer than 100 lines traded), a line is left out when its latest
// suspension is open and began less than a year ago.
//
//   https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/main-market-watch/issuers-trading-information?locale=en
//
// Not in the book: the Nomu parallel market (open to qualified investors
// only; a broker that names it adds it itself), closed-end funds (CEFs),
// sukuk and bonds, mutual funds, tradable rights and derivatives.
//
// The exchange prints no ISIN here; stampRows (../../accepted.mjs) copies
// it from the TADAWUL lines of the shared lists.
//
// Row: { query, ticker, name, exchange "Tadawul", mic "XSAU", currency
// "SAR", type STOCK|ETF, isin "", raw }, as ../sahm writes them.
//
// saudiExchange's site refuses curl (Akamai) but answers Node's fetch.
//
//   import { tadawulBook } from "../investsky/tadawulBook.mjs";
//   const { rows, suspended, session } = await tadawulBook();
//
//   node brokers/investsky/tadawulBook.mjs      (prints the counts)

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "Tadawul";
export const MIC = "XSAU";
const SITE = "https://www.saudiexchange.sa";
const PAGES = {
  main: `${SITE}/wps/portal/saudiexchange/ourmarkets/main-market-watch?locale=en`,
  etf: `${SITE}/wps/portal/saudiexchange/ourmarkets/funds-market-watch/Etfsv2/etf-market-watch?locale=en`,
  history: `${SITE}/wps/portal/saudiexchange/newsandreports/reports-publications/historical-reports?locale=en`,
  issuers: `${SITE}/wps/portal/saudiexchange/ourmarkets/main-market-watch/issuers-trading-information?locale=en`,
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const FLOOR = { STOCK: 240, ETF: 10 };
const MUST = ["2222", "1120", "2010", "4330", "9405"];
const DAY = 86_400_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*", "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// A portal page and the absolute URL of one of its resource calls
// ('p0/IZ7_...=NJ<name>=/', relative to the page's <base href>).
async function portal(page, name) {
  const html = await get(page);
  const base = html.match(/<base href="([^"]+)"/)?.[1];
  const call = html.match(new RegExp(`['"](p0/[^'"]*=NJ${name}=/)['"]`))?.[1];
  if (!base || !call) throw new Error(`${page} no longer calls NJ${name}`);
  return { html, url: new URL(call, base).href };
}

async function getJson(url) {
  const text = await get(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url.slice(0, 120)}... is not JSON: ${text.slice(0, 120)}`);
  }
}

// "2026-09-13" or "13-09-2026" -> ms, "-" or "" -> null.
function day(text) {
  const value = clean(text);
  let found = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (found) return Date.UTC(+found[1], +found[2] - 1, +found[3]);
  found = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (found) return Date.UTC(+found[3], +found[2] - 1, +found[1]);
  if (!value || value === "-") return null;
  throw new Error(`suspension date ${value}`);
}

// symbol -> latest suspension { from, to, name } of the given form type.
async function suspensions(url, formType) {
  const query = new URLSearchParams({ renderType: "onload", fromDate: "", toDate: "", formType, requestLocale: "en" });
  const list = (await getJson(`${url}?${query}`))?.data;
  if (!Array.isArray(list) || (formType === "Suspension" && list.length < 50)) throw new Error(`the ${formType} list has ${list?.length ?? "no"} lines`);
  const latest = new Map();
  for (const item of list) {
    const symbol = clean(item.symbol);
    const from = day(item.fromDate);
    if (!symbol || from === null) throw new Error(`unreadable suspension ${JSON.stringify(item).slice(0, 160)}`);
    const entry = { symbol, name: clean(item.name), from, to: day(item.toDate) };
    if (!latest.has(symbol) || latest.get(symbol).from < from) latest.set(symbol, entry);
  }
  return latest;
}

export async function tadawulBook() {
  const main = await portal(PAGES.main, "getMainNomucMarketDetails");
  const query = new URLSearchParams({ sectorParameter: "all", tableViewParameter: "1", iswatchListSelected: "NO", requestLocale: "en" });
  const lines = (await getJson(`${main.url}?${query}`))?.data;
  if (!Array.isArray(lines) || lines.length < FLOOR.STOCK) throw new Error(`the Main Market watch has ${lines?.length ?? "no"} lines`);
  await sleep(800);

  const etfPage = await get(PAGES.etf);
  const etfs = [...etfPage.matchAll(/<tr>\s*<td>\s*<a href="[^"]*company-profile-etf[^"]*"[^>]*>([^<]+)<\/a>([\s\S]*?)<\/tr>/g)].map((match) => {
    const cells = [...match[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => clean(cell[1].replace(/<[^>]+>/g, " ")));
    const number = (text) => Number(String(text).replace(/,/g, "")) || 0;
    return { name: clean(match[1]), trades: number(cells[8]), bid: number(cells[10]), ask: number(cells[12]), cells };
  });
  if (etfs.length < FLOOR.ETF) throw new Error(`the ETF market watch prints ${etfs.length} ETFs`);
  await sleep(800);

  const history = await portal(PAGES.history, "populateEntity");
  const entities = await getJson(`${history.url}?${new URLSearchParams({ selectedMarket: "ETFS", selectedSector: "0" })}`);
  const etfSymbol = new Map((entities || []).map((item) => [clean(item.entityName).toUpperCase(), clean(item.entitySymbol)]));
  if (etfSymbol.size < FLOOR.ETF) throw new Error(`the ETF entity list has ${etfSymbol.size} lines`);
  await sleep(800);

  const issuers = await portal(PAGES.issuers, "getSuspendedDelistedComp");
  const suspendedCompanies = await suspensions(issuers.url, "Suspension");
  await sleep(800);
  const suspendedFunds = await suspensions(issuers.url, "Suspension_Funds");

  const traded = lines.filter((line) => Number(line.volumeTraded) > 0).length;
  const inSession = traded >= 100;
  const stamp = (line) => Date.parse(clean(line.transactionDate)) || 0;
  const session = clean(lines.reduce((best, line) => (stamp(line) > stamp(best) ? line : best)).transactionDate);
  const now = Date.now();
  const isSuspended = (latest, quiet) => {
    if (!latest || (latest.to !== null && latest.to < now - DAY)) return false;
    return inSession ? quiet : now - latest.from < 365 * DAY;
  };

  const rows = [];
  const suspended = [];
  const seen = new Set();
  for (const line of lines) {
    const ticker = clean(line.companySymbol);
    const name = clean(line.companyName);
    const sector = clean(line.sectorName);
    if (!/^\d{4}$/.test(ticker) || !name || !sector) throw new Error(`unreadable Main Market line ${JSON.stringify(line).slice(0, 200)}`);
    if (seen.has(ticker)) throw new Error(`${ticker} repeats on the Main Market`);
    seen.add(ticker);
    const quiet = !(Number(line.volumeTraded) > 0) && !(Number(line.bidPrice) > 0) && !(Number(line.askPrice) > 0);
    const latest = suspendedCompanies.get(ticker);
    if (isSuspended(latest, quiet)) {
      suspended.push(`${ticker} ${name} (suspended ${new Date(latest.from).toISOString().slice(0, 10)})`);
      continue;
    }
    const flag = { 1: "accumulated losses 20-35%", 2: "accumulated losses 35-50%", 3: "accumulated losses 50% or more" }[line.companyStatus] || "";
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "SAR",
      type: "STOCK",
      isin: "",
      raw: [ticker, clean(line.acrynomName), name, sector === "REITs" ? "REIT" : sector, "Main Market", "SAR", flag].filter(Boolean).join(" | "),
    });
  }

  for (const etf of etfs) {
    const ticker = etfSymbol.get(etf.name.toUpperCase());
    if (!ticker || !/^\d{4}$/.test(ticker)) throw new Error(`the ETF ${etf.name} has no symbol in the entity list`);
    if (seen.has(ticker)) throw new Error(`${ticker} repeats`);
    seen.add(ticker);
    const latest = suspendedFunds.get(ticker);
    if (isSuspended(latest, !etf.trades && !etf.bid && !etf.ask)) {
      suspended.push(`${ticker} ${etf.name} (suspended ${new Date(latest.from).toISOString().slice(0, 10)})`);
      continue;
    }
    rows.push({
      query: ticker,
      ticker,
      name: etf.name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "SAR",
      type: "ETF",
      isin: "",
      raw: [ticker, etf.name, "ETF", "SAR"].join(" | "),
    });
  }
  for (const [name, ticker] of etfSymbol) {
    if (!etfs.some((etf) => etf.name.toUpperCase() === name)) suspended.push(`${ticker} ${name} (in the ETF entity list, not on the ETF market watch)`);
  }

  const count = { STOCK: 0, ETF: 0 };
  for (const row of rows) count[row.type] += 1;
  for (const [type, floor] of Object.entries(FLOOR)) if (count[type] < floor) throw new Error(`only ${count[type]} Tadawul ${type} lines`);
  for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Tadawul book`);
  if (suspended.length > 15) throw new Error(`${suspended.length} Tadawul lines read as suspended`);
  rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  return { rows, suspended, session, inSession };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { rows, suspended, session, inSession } = await tadawulBook();
  const count = {};
  for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
  console.log(`${rows.length} rows`, count, `REITs ${rows.filter((row) => / \| REIT \| /.test(row.raw)).length}; session ${session}${inSession ? "" : " (not open yet)"}`);
  console.log(`left out ${suspended.length} suspended: ${suspended.join("; ")}`);
}
