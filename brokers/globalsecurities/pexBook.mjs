// The Palestine Exchange (PEX) book, for a broker that deals in all of it
// (../globalsecurities). Every listed share open to trade, each in its own
// trading currency (US dollars or Jordanian dinars), from the exchange's own
// public site (pex.ps), with no login.
//
// The market watch of pex.ps loads one call, MarketWatchTableInit, which
// prints every listed security with its symbol, English name, sector,
// currency, market (Class 1 first market, 2 second market; 3 sell-out,
// 4 tender and 5 debt are not regular trading), product type and trading
// state (0 active, 1 suspended, 2 halted, as the site's own code labels
// them). The listed-companies call, GetCompaniesList, names the companies
// of the General index: each one must be on the market watch.
//
//   https://www.pex.ps/
//   https://webapi.pex.ps/api/MarketWatchTableInit
//   https://webapi.pex.ps/api/GetCompaniesList
//
// Kept: active lines of the first and second markets, all shares (PEX
// lists no ETF). Left out: suspended and halted lines (a halt on PEX can
// last a year: PALAQAR since May 2025, The Arab Hotels since August 2025).
// PEX prints no ISIN and the shared lists hold no PEX line, so the rows have
// none.
//
// Row: { query, ticker, name, exchange "Palestine Exchange", mic "XPAE",
// currency USD|JOD, type "STOCK", isin "", raw }. venues.mjs has no
// Palestine book yet.
//
//   import { pexBook } from "../globalsecurities/pexBook.mjs";
//   const { rows, leftOut, asOf } = await pexBook();
//
//   node brokers/globalsecurities/pexBook.mjs      (prints the counts)

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "Palestine Exchange";
export const MIC = "XPAE";
const API = "https://webapi.pex.ps/api";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const STATES = { 0: "active", 1: "suspended", 2: "halted" };
const MARKETS = { 1: "First Market", 2: "Second Market" };
const MUST = ["BOP", "PALTEL", "PADICO", "QUDS", "JCC"];

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function getJson(path) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${API}${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://www.pex.ps", Referer: "https://www.pex.ps/" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return await response.json();
      last = `${response.status} ${API}${path}`;
    } catch (error) {
      last = `${API}${path}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(last);
}

export async function pexBook() {
  const watch = await getJson("/MarketWatchTableInit");
  const lines = watch?.marketWatchTable;
  if (!Array.isArray(lines) || lines.length < 40) throw new Error(`the PEX market watch has ${lines?.length ?? "no"} lines`);
  const companies = await getJson("/GetCompaniesList");
  const general = (companies || []).find((sector) => sector?.Sector?.En === "General")?.Companies || [];
  if (general.length < 40) throw new Error(`the PEX General index names ${general.length} companies`);

  const rows = [];
  const leftOut = [];
  const seen = new Set();
  for (const line of lines) {
    const ticker = clean(line.Symbol).toUpperCase();
    const name = clean(line.CompanyName?.En);
    const currency = clean(line.Currency).toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(ticker) || !name) throw new Error(`unreadable PEX line ${JSON.stringify(line).slice(0, 200)}`);
    if (seen.has(ticker)) throw new Error(`${ticker} repeats on the PEX market watch`);
    seen.add(ticker);
    if (line.ProductType !== 0) throw new Error(`${ticker} is product type ${line.ProductType}, not a share`);
    if (currency !== "USD" && currency !== "JOD") throw new Error(`${ticker} trades in ${currency || "no currency"}`);
    const state = STATES[line.TradingState];
    if (!state) throw new Error(`${ticker} has trading state ${line.TradingState}`);
    if (state !== "active") {
      leftOut.push(`${ticker} ${state} (last trade ${clean(line.Date).slice(0, 10)})`);
      continue;
    }
    const market = MARKETS[line.Class];
    if (!market) {
      leftOut.push(`${ticker} market class ${line.Class} (sell-out, tender or debt)`);
      continue;
    }
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency,
      type: "STOCK",
      isin: "",
      raw: [ticker, name, clean(line.Sector?.Name?.En), market, currency].filter(Boolean).join(" | "),
    });
  }
  for (const company of general) {
    if (!seen.has(clean(company.Symbol).toUpperCase())) throw new Error(`${company.Symbol} is listed but not on the PEX market watch`);
  }
  for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the PEX book`);
  if (rows.length < 35) throw new Error(`only ${rows.length} PEX shares open`);
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return { rows, leftOut, asOf: clean(watch.sharedAttributes?.LastUpdatedOn?.UtcTime) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { rows, leftOut, asOf } = await pexBook();
  const count = {};
  for (const row of rows) count[row.currency] = (count[row.currency] || 0) + 1;
  console.log(`${rows.length} PEX shares`, count, `as of ${asOf}`);
  console.log(`left out: ${leftOut.join("; ") || "none"}`);
}
