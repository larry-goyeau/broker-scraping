// The Boursa Kuwait book, for the brokers that sell the whole exchange
// (KFIC Financial Brokerage, Al-Tijari Financial Brokerage). Boursa
// Kuwait's own site reads two public feeds, with no login:
//
//   The "Listed Companies" page builds its table from the market data
//   symbol list (legacy-mix-services, RT=303, source KSE). Each company
//   has a regular-board line (SYMBOL ending `R, market P = Premier Market,
//   M = Main Market) and a buy-in board line (`B, market B), which is the
//   settlement board of the same share and is not written. The list gives
//   the ticker, the English name, the trading currency, the sector code, the
//   Boursa company code and the ISIN. The REIT market (`F, market T) holds
//   KFH Capital REIT (BAITAKREIT), a real estate fund; it is left out unless
//   asked for, as Al Sharq and EFG Hermes leave it out. The fund markets (F,
//   F_USD) list no ETF today: Boursa Kuwait has no exchange-traded fund, so
//   every row is a STOCK. Rights issue markets (RP, RM), fixed income (FI,
//   FI_USD) and the OTC platform (source KSEOTC) are not read.
//
//   The "Suspended Companies" page (client-services RT=3549, T=3) lists the
//   companies whose trading is suspended; their line stays in the symbol
//   list (MASAKEN on 2026-10-25) and is dropped here by ISIN and by ticker.
//   The "Delisted Companies" page (RT=3549, T=2) is read as a check: a
//   delisted company still in the symbol list is dropped and reported.
//
//   https://www.boursakuwait.com.kw/en/participants/participants/listed-companies/
//   https://www.boursakuwait.com.kw/en/securities/company-information/suspended-companies/
//   https://www.boursakuwait.com.kw/en/securities/company-information/delisted-companies/
//   https://www.boursakuwait.com.kw/data-api/legacy-mix-services?UID=3166765&SID=3090B191-7C82-49EE-AC52-706F081F265D&L=EN&UNC=0&UE=KSE&H=1&M=1&RT=303&SRC=KSE&AS=1
//   https://www.boursakuwait.com.kw/data-api/legacy-mix-services?...&RT=306&SRC=KSE&AS=1 (sector and market names)
//   https://www.boursakuwait.com.kw/data-api/client-services?RT=3549&L=E&T=3
//   https://www.boursakuwait.com.kw/data-api/client-services?RT=3549&L=E&T=2
//
// UID and SID are the guest values the public site itself sends. The site
// answers Node's fetch; curl is refused by its CDN.
//
// The name is the one stocks.csv files for that ISIN (the house spelling,
// "A'ayan Leasing & Investment Co."), else Boursa's own. Cross-listed
// foreign shares (GFH, Inovest, Bahrain Kuwaiti Insurance, Umm Al Qaiwain
// General Investment, Valmore) trade here in KWD and keep their home ISIN.
//
//   import { boursaKuwaitBook, writeBoursaKuwaitCatalogue } from "../kfic/boursaKuwaitBook.mjs";
//   await writeBoursaKuwaitCatalogue(import.meta.url, "<folder>-parsed.json");
//
//   node brokers/kfic/boursaKuwaitBook.mjs   (prints the counts, writes nothing)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const SITE = "https://www.boursakuwait.com.kw";
const MIX = `${SITE}/data-api/legacy-mix-services`;
const CLIENT = `${SITE}/data-api/client-services`;
const GUEST = { UID: "3166765", SID: "3090B191-7C82-49EE-AC52-706F081F265D", L: "EN", UNC: "0", UE: "KSE", H: "1", M: "1", SRC: "KSE", AS: "1" };
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
export const EXCHANGE = "Boursa Kuwait";
export const MIC = "XKUW";
const SEGMENT = { P: "Premier Market", M: "Main Market" };
const FLOOR = 125;
const MUST = ["NBK", "KFH", "ZAIN", "MABANEE", "BOUBYAN", "GFH"];
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function getJson(url, params) {
  const target = `${url}?${new URLSearchParams(params)}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(target, {
        headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "en", Referer: `${SITE}/en/` },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return await response.json();
      last = `${response.status} ${target}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// The symbol list: one object per line, keyed by the header names.
async function symbolList() {
  const body = await getJson(MIX, { ...GUEST, RT: "303" });
  const header = String(body?.HED?.TD || "").split("|");
  const lines = body?.DAT?.TD;
  for (const name of ["SYMBOL", "SYMBOL_DESCRIPTION", "MARKET_ID", "CURRENCY", "SHRT_DSC", "COMPANY_CODE", "ISIN_CODE", "SECTOR"]) {
    if (!header.includes(name)) throw new Error(`the Boursa Kuwait symbol list has no ${name} column`);
  }
  if (!Array.isArray(lines)) throw new Error("the Boursa Kuwait symbol list has no lines");
  return lines.map((line) => {
    const cells = String(line).split("|");
    return Object.fromEntries(header.map((name, index) => [name, clean(cells[index])]));
  });
}

async function sectorNames() {
  const body = await getJson(MIX, { ...GUEST, RT: "306" });
  const names = new Map();
  for (const line of body?.DAT?.SRC?.SCTD || []) {
    const [code, name] = String(line).split("|");
    names.set(code, clean(name));
  }
  return names;
}

// RT=3549: T=3 is the Suspended Companies table, T=2 the Delisted one.
async function companyTable(T) {
  const body = await getJson(CLIENT, { RT: "3549", L: "E", T: String(T) });
  if (!Array.isArray(body)) throw new Error(`the Boursa Kuwait RT=3549 T=${T} table is not a list`);
  return body.map((row) => ({
    isin: clean(row.IsinCode).toUpperCase(),
    ticker: clean(row.DisplayTicker).toUpperCase(),
    code: clean(row.Stk),
    name: clean(row.Name),
  }));
}

// stocks.csv name by ISIN; the KSE line wins over a home-exchange line.
function houseNames() {
  const names = new Map();
  const text = fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^,]+),([^,]+),([A-Z]{2}[A-Z0-9]{9}\d),(.*)$/);
    if (!match) continue;
    const name = match[4].replace(/^"|"$/g, "").replace(/""/g, '"').trim();
    if (!name) continue;
    if (match[2] === "KSE" || !names.has(match[3])) names.set(match[3], name);
  }
  return names;
}

let memo = null;

// Every Boursa Kuwait share that trades today, as catalogue rows sorted by
// ticker. `reits: true` also returns the REIT market (BAITAKREIT) as a STOCK.
// Returns { rows, suspended, delisted, leftOut }.
export async function boursaKuwaitBook({ reits = false } = {}) {
  if (!memo) {
    const symbols = await symbolList();
    await sleep(1200);
    const sectors = await sectorNames();
    await sleep(1200);
    const suspendedTable = await companyTable(3);
    await sleep(1200);
    const delistedTable = await companyTable(2);
    memo = { symbols, sectors, suspendedTable, delistedTable };
  }
  const { symbols, sectors, suspendedTable, delistedTable } = memo;
  const names = houseNames();
  const suspendedIsins = new Set(suspendedTable.map((row) => row.isin).filter(Boolean));
  const suspendedTickers = new Set(suspendedTable.map((row) => row.ticker).filter(Boolean));
  const delistedIsins = new Set(delistedTable.map((row) => row.isin).filter(Boolean));

  const rows = [];
  const suspended = [];
  const delisted = [];
  const leftOut = [];
  const seen = new Set();
  for (const line of symbols) {
    const [, board] = line.SYMBOL.split("`");
    if (board === "B") continue; // buy-in board of the same share
    const ticker = line.SHRT_DSC.toUpperCase();
    const isin = line.ISIN_CODE.toUpperCase();
    const isReit = board === "F" && line.MARKET_ID === "T";
    if (isReit && !reits) {
      leftOut.push(`${ticker} REIT`);
      continue;
    }
    if (board !== "R" && !isReit) {
      leftOut.push(`${ticker} board ${board} market ${line.MARKET_ID}`);
      continue;
    }
    if (!isReit && !SEGMENT[line.MARKET_ID]) throw new Error(`${ticker} is on an unknown market ${line.MARKET_ID}`);
    if (!ISIN.test(isin)) {
      leftOut.push(`${ticker} no ISIN`);
      continue;
    }
    if (suspendedIsins.has(isin) || suspendedTickers.has(ticker)) {
      suspended.push(ticker);
      continue;
    }
    if (delistedIsins.has(isin)) {
      delisted.push(ticker);
      continue;
    }
    if (line.CURRENCY !== "KWD") throw new Error(`${ticker} trades in ${line.CURRENCY || "no currency"}`);
    if (seen.has(isin)) throw new Error(`${isin} is listed twice`);
    seen.add(isin);
    const name = names.get(isin) || line.SYMBOL_DESCRIPTION || ticker;
    const segment = isReit ? "REIT Market" : SEGMENT[line.MARKET_ID];
    rows.push({
      query: isin,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "KWD",
      type: "STOCK",
      isin,
      raw: [ticker, line.COMPANY_CODE, segment, sectors.get(line.SECTOR) || "", EXCHANGE].filter(Boolean).join(" "),
    });
  }
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));

  for (const ticker of MUST) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`Boursa Kuwait book misses ${ticker}`);
  }
  if (rows.length < FLOOR) throw new Error(`only ${rows.length} Boursa Kuwait shares`);
  if (delisted.length) console.error(`delisted but still in the symbol list, left out: ${delisted.join(" ")}`);
  return { rows, suspended, delisted, leftOut };
}

// Writes <file> next to the calling scraper and returns the kept rows.
export async function writeBoursaKuwaitCatalogue(here, file, options = {}) {
  const { rows, suspended, delisted, leftOut } = await boursaKuwaitBook(options);
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const premier = kept.filter((row) => row.raw.includes("Premier Market")).length;
  console.error(
    `${kept.length} listings: ${EXCHANGE} STOCK ${kept.length} (Premier ${premier}, Main ${kept.length - premier - kept.filter((row) => row.raw.includes("REIT Market")).length}); ` +
      `suspended left out: ${suspended.join(" ") || "none"}; delisted: ${delisted.join(" ") || "none"}; other: ${leftOut.join(", ") || "none"}.`
  );
  return kept;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { rows, suspended, delisted, leftOut } = await boursaKuwaitBook();
  const count = (segment) => rows.filter((row) => row.raw.includes(segment)).length;
  console.log(
    `${rows.length} rows (STOCK ${rows.length}; Premier ${count("Premier Market")}, Main ${count("Main Market")}), ` +
      `${new Set(rows.map((row) => row.isin)).size} ISINs; suspended: ${suspended.join(" ") || "none"}; ` +
      `delisted: ${delisted.join(" ") || "none"}; left out: ${leftOut.join(", ") || "none"}`
  );
}
