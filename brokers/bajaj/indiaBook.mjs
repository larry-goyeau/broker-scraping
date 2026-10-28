// The NSE and BSE cash book as catalogue rows, for the Indian brokers whose
// home market is the whole exchange (Bajaj Broking, Geojit, Lakshmishree,
// SBI Securities, SMC Global) or whose own instrument master is public
// (Bonanza's Bigul XTS master, JM Financial's BlinkX files). Each line is
// typed and filtered the same way, as ../chola does:
//
// - the whole book is the NSE equity list and the Upstox instrument file
//   (../../indianCash.mjs cashBook), in the NSE series and BSE groups that
//   take orders (keepSold): EQ, BE, BZ, SM, ST, IV, RR on the NSE; A, B, T,
//   XT, X, Z, ZP, M, MT, P, TS, R, E, MS on the BSE. Debt series, iNAV
//   lines and indices are not in those sets;
// - an INE or IN9 ISIN is a STOCK (shares, partly paid shares, REITs and
//   InvITs, SME shares); the BSE files REIT and InvIT units in group IF,
//   which is kept as the NSE's IV and RR series are; an INF ISIN is an ETF when the NSE's ETF list
//   (eq_etfseclist.csv) holds it, when the BSE files it in group E (its
//   ETF group), or when the BSE's own scrip name says ETF, BeES or
//   Exchange Traded. Any other INF line is a fixed maturity plan, an
//   interval fund, a specialised investment fund (long-short) unit or a
//   segregated-portfolio side pocket, not an ETF, and is left out. An ETF
//   the BSE files in group F (liquid and Bharat Bond ETFs) is kept by the
//   same test;
// - left out: a BSE line the BSE's own scrip status list
//   (../lemonn/bseStatus.mjs) has as Suspended or Delisted and on no Active
//   scrip; an NSE rights entitlement (-RE, or security code 20 in the ISIN);
//   an NSE line whose date of listing in EQUITY_L.csv is after today.
//
// Rows: { query, ticker, name, exchange: "NSE" | "BSE", mic: XNSE | XBOM,
// currency: "INR", type: "STOCK" | "ETF", isin, raw }, one per exchange
// for a title on both.
//
//   https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
//   https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv
//   https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Active
//
//   import { indiaLists, wholeIndia, masterIndia, xtsMaster, kiteMaster } from "../bajaj/indiaBook.mjs";

import { cashBook, keepSold, soldSeries, parseCsv, isinOf, debtIsin, isInav, seriesOf, lookup, companyName } from "../../indianCash.mjs";
import { bseClosed } from "../lemonn/bseStatus.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const NSE_EQUITY = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const NSE_ETFS = "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv";
const BSE_ACTIVE = "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active";
const MONTH = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const VENUE = { NSE: "XNSE", BSE: "XBOM" };
const NSE_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST", "IV", "RR"]);
const ETF_NAME = /\bETF\b|BeES|Exchange Traded/i;
// About 85% of the October 2026 book (NSE 3,450 lines with 350 ETFs, BSE
// 4,600 with 250 ETFs).
export const FLOOR = { NSE: { all: 2900, etf: 280 }, BSE: { all: 3900, etf: 180 } };

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getText(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, headers: { "User-Agent": UA, ...options.headers }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await pause(1_500 * (attempt + 1));
  }
  throw new Error(last);
}

// The BSE's scrip names by ISIN (the Upstox file names an ETF "SBI Mutual
// Fund"; the BSE names it "SBI Nifty 50 ETF").
async function bseNames() {
  const list = JSON.parse(await getText(BSE_ACTIVE, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.bseindia.com/",
      Origin: "https://www.bseindia.com",
      "sec-fetch-site": "same-site",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
    },
  }));
  if (!Array.isArray(list) || list.length < 4000 || !("Scrip_Name" in list[0])) throw new Error(`BSE Active list changed: ${Array.isArray(list) ? list.length : typeof list}`);
  const names = new Map();
  for (const scrip of list) {
    const isin = isinOf(scrip.ISIN_NUMBER);
    if (isin) names.set(isin, String(scrip.Scrip_Name || "").replace(/\s+/g, " ").trim());
  }
  return names;
}

// Everything the filters need, read once.
export async function indiaLists() {
  const book = await cashBook();
  const equity = parseCsv(await getText(NSE_EQUITY));
  const etfs = parseCsv(await getText(NSE_ETFS));
  if (equity.length < 2000 || !("DATE OF LISTING" in equity[0]) || !("ISIN NUMBER" in equity[0])) throw new Error(`NSE EQUITY_L changed: ${equity.length} lines`);
  if (etfs.length < 250 || !("ISINNumber" in etfs[0])) throw new Error(`NSE ETF list changed: ${etfs.length} lines`);
  const today = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).replace(/-/g, ""));
  const later = new Set();
  for (const row of equity) {
    const match = String(row["DATE OF LISTING"]).trim().toUpperCase().match(/^(\d{2})-([A-Z]{3})-(\d{4})$/);
    if (!match || !MONTH[match[2]]) throw new Error(`NSE EQUITY_L date ${row["DATE OF LISTING"]} for ${row.SYMBOL}`);
    if (Number(match[3]) * 10000 + MONTH[match[2]] * 100 + Number(match[1]) > today) later.add(isinOf(row["ISIN NUMBER"]));
  }
  const nseEtfs = new Set(etfs.map((row) => isinOf(row.ISINNumber)).filter(Boolean));
  return { book, later, nseEtfs, bse: await bseClosed(), bseNames: await bseNames() };
}

// One line { exchange, ticker, series, isin, name } -> a row, or the reason
// it is left out.
function judge(lists, line) {
  const { exchange, ticker } = line;
  const isin = isinOf(line.isin);
  const series = String(line.series || "").trim().toUpperCase();
  if (!isin) return { reason: "no ISIN" };
  // indianCash reads every IN<digit> ISIN as debt; IN9 is a partly paid share.
  if (isInav(ticker) || (debtIsin(isin) && !isin.startsWith("IN9"))) return { reason: "not a share" };
  // The NSE trades a partly paid share in series E1, E2...
  const partlyPaid = isin.startsWith("IN9") && exchange === "NSE" && /^E\d$/.test(series);
  if (exchange === "NSE" && !NSE_SERIES.has(series) && !partlyPaid) return { reason: "not a share" };
  let type;
  if (isin.startsWith("INF")) {
    const named = lists.bseNames.get(isin) || line.name || "";
    const etf = lists.nseEtfs.has(isin) || (exchange === "BSE" && series === "E") || (exchange === "BSE" && ETF_NAME.test(named));
    if (!etf) return { reason: "fund unit, not an ETF" };
    if (!keepSold(exchange, series, ticker, isin, true)) return { reason: "not a share" };
    type = "ETF";
  } else {
    if (!isin.startsWith("INE") && !isin.startsWith("IN9")) return { reason: "not a share" };
    const sold = partlyPaid || (isin.startsWith("IN9") ? soldSeries(exchange, series) : keepSold(exchange, series, ticker, isin));
    if (!sold && !(exchange === "BSE" && series === "IF")) return { reason: "not a share" };
    type = "STOCK";
  }
  if (exchange === "NSE") {
    if (/-RE\d*$/i.test(ticker) || /^INE.{4}20/.test(isin)) return { reason: "rights entitlement" };
    if (lists.later.has(isin)) return { reason: "listed after today" };
  } else {
    if (/-RE\d*$/i.test(ticker) || /^INE.{4}20/.test(isin)) return { reason: "rights entitlement" };
    const status = lists.bse.statusOf(isin, ticker);
    if (status) return { reason: `BSE ${status}` };
  }
  const name = (exchange === "BSE" && lists.bseNames.get(isin)) || line.name || ticker;
  return {
    row: { query: ticker, ticker, name, exchange, mic: VENUE[exchange], currency: "INR", type, isin, raw: [ticker, name, exchange, series, isin, type].filter(Boolean).join(" ") },
  };
}

function collect(lists, lines) {
  const rows = [];
  const left = {};
  const seen = new Set();
  for (const line of lines) {
    const verdict = judge(lists, line);
    if (!verdict.row) {
      left[verdict.reason] = (left[verdict.reason] || 0) + 1;
      continue;
    }
    const key = `${verdict.row.exchange}|${verdict.row.isin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(verdict.row);
  }
  for (const exchange of ["NSE", "BSE"]) {
    const all = rows.filter((row) => row.exchange === exchange);
    const etfs = all.filter((row) => row.type === "ETF").length;
    if (all.length < FLOOR[exchange].all || etfs < FLOOR[exchange].etf) throw new Error(`${exchange} book is short: ${all.length} lines, ${etfs} ETFs`);
  }
  for (const [exchange, ticker, type] of [["NSE", "RELIANCE", "STOCK"], ["BSE", "RELIANCE", "STOCK"], ["NSE", "NIFTYBEES", "ETF"], ["BSE", "NIFTYBEES", "ETF"]]) {
    if (!rows.some((row) => row.exchange === exchange && row.ticker === ticker && row.type === type)) throw new Error(`${exchange} ${ticker} is missing`);
  }
  rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
  rows.left = left;
  return rows;
}

// The whole NSE and BSE cash book.
export function wholeIndia(lists) {
  const lines = [];
  for (const [key, entry] of lists.book) {
    const [exchange, ticker] = key.split("|");
    if (exchange !== "NSE" && exchange !== "BSE") continue;
    lines.push({ exchange, ticker, series: entry.series, isin: entry.isin, name: entry.name });
  }
  return collect(lists, lines);
}

// A broker's own master, as lines { exchange, ticker, series, isin, name };
// a line with no ISIN or series takes them from the cash book.
export function masterIndia(lists, lines) {
  return collect(lists, lines.map((line) => {
    const entry = lookup(lists.book, line.exchange, line.ticker);
    return {
      ...line,
      isin: isinOf(line.isin) || entry?.isin || "",
      series: line.series || entry?.series || "",
      name: companyName(line.name, line.ticker, entry),
    };
  }));
}

// A Symphony XTS market-data master (POST .../apimarketdata/instruments/master):
// pipe-delimited, segment | id | type | name | description | series | ... |
// ISIN (16th field) | ... | display name (19th field).
export async function xtsMaster(url) {
  const text = await getText(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exchangeSegmentList: ["NSECM", "BSECM"] }),
  });
  const payload = JSON.parse(text);
  if (payload.type !== "success" || typeof payload.result !== "string") throw new Error(`${url}: ${payload.description || "no result"}`);
  const segments = { NSECM: "NSE", BSECM: "BSE" };
  const lines = [];
  for (const raw of payload.result.split("\n")) {
    const cells = raw.split("|");
    const exchange = segments[cells[0]];
    const ticker = String(cells[3] || "").trim().toUpperCase();
    if (!exchange || !ticker) continue;
    const series = String(cells[5] || "").trim().toUpperCase();
    if (/^INAV/i.test(String(cells[18] || "").trim())) continue;
    const name = String(cells[18] || "").trim().replace(new RegExp(`-${series}$`), "");
    lines.push({ exchange, ticker, series, isin: isinOf(cells[15]), name });
  }
  if (lines.length < 15000) throw new Error(`${url} holds only ${lines.length} cash lines`);
  return lines;
}

// Kite-layout instrument CSVs (one per exchange): an NSE trading symbol
// carries its series (RELIANCE-EQ); a BSE one does not, and takes its group
// from the cash book. No ISIN on the row.
export async function kiteMaster(lists, files) {
  const lines = [];
  for (const { url, exchange } of files) {
    for (const row of parseCsv(await getText(url))) {
      if (String(row.exchange || "").trim().toUpperCase() !== exchange) continue;
      if (String(row.instrument_type || "").trim().toUpperCase() !== "EQ") continue;
      const symbol = String(row.tradingsymbol || "").trim().toUpperCase();
      if (!symbol || /^INAV/i.test(String(row.name || "").trim())) continue;
      const entry = lookup(lists.book, exchange, symbol);
      const series = exchange === "NSE" ? seriesOf(symbol) : entry?.series || "";
      const ticker = exchange === "NSE" && series ? symbol.slice(0, -(series.length + 1)) : symbol;
      lines.push({ exchange, ticker, series, isin: entry?.isin || "", name: String(row.name || "").trim() });
    }
  }
  if (lines.length < 6000) throw new Error(`the instrument files hold only ${lines.length} cash lines`);
  return lines;
}
