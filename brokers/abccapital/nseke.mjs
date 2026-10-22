// The Nairobi Securities Exchange board that a Kenyan stockbroker's client
// can buy from: shares, preference shares, REITs and ETFs, as the myStocks
// market watch prints them. Shared by the NSE brokers reached through
// Dosikaa (ABC Capital, AIB-AXYS Africa, Kingdom Securities, Faida
// Investment Bank). Every member of the exchange trades the same board, so
// one read serves them all.
// The board XML gives one line per security code. The myStocks sector
// file names each code and puts it in a sector. Shares, preference shares
// and REITs are written as shares. The "Exchange Traded Funds" sector is
// written as ETFs. A rights line (name ends in "(Rights)", code ends in
// -R) is a short-lived entitlement and stays out. Bonds are not on this
// board.
// The board keeps suspended codes on it with their old last price, and
// the NSE page still prints them too. So each code's myStocks stock page
// (live.mystocks.co.ke/stock=<code>) is read for its last trade date
// ("End of day - Oct 19, 2026"). A code with no trade in the last 180
// days is left out: that catches the long suspensions (ARM, DCON, MSC
// since 2018-19, BAMB, CABL and TCL since mid-2025, per NSE/CMA notices
// and Business Daily, 7 Sep 2026) and dormant lines (HBE, KPLC-P7). The
// six suspended codes are also left out by name whatever the date, and
// the run stops if one of them trades again, so the list gets rechecked.
// LAPR (Laptrust Imara I-REIT) sits on the NSE restricted sub-segment,
// open only to professional investors with a KES 5m minimum trade, so it
// stays out.
// Lines trade in shillings, except the US-dollar REITs ALP (ALP
// Industrial I-REIT, listed 11 Mar 2026 as the NSE's first USD security)
// and TRFC (TRIFIC Green USD I-REIT, listed 29 Jun 2026), written in USD.
// myStocks prints "KES" for both, so they are named here, and the run
// stops if the NSE page names another USD line.
// The board prints no ISIN. It is taken from the NSE listed-companies
// page, joined by trading symbol. The NSE page still says HFCK for
// HFCB, SMWF.E0000 for SMWF and SKL.O0000 for SKL. A few recent or
// preference lines are not on that page and are written without an ISIN.
// The board is read through ABC Capital's myStocks co-brand feed (its
// Market Beat page): the feed answers nothing without that app code.
//
//   https://www.abccapital.co.ke/market-beat/
//   https://live.mystocks.co.ke/cobrand/v1/rmwx/ABC
//   https://tickers.mystocks.co.ke/ticker/RMWX$?app=ABC
//   https://live.mystocks.co.ke/ajax/stocksectors/<yyyymmddhh>
//   https://live.mystocks.co.ke/stock=<code>
//   https://www.nse.co.ke/listed-companies/
//
// `readNseBoard()` returns the rows and what was left out;
// `nseSummary(board)` is the one-line run report.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const BOARD = "https://tickers.mystocks.co.ke/ticker/RMWX$?app=ABC";
export const SECTORS = "https://live.mystocks.co.ke/ajax/stocksectors/";
export const NSE = "https://www.nse.co.ke/listed-companies/";
export const REFERER = "https://www.abccapital.co.ke/market-beat/";
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
export const EXCHANGE = "Nairobi Securities Exchange";
export const MIC = "XNAI";
const ETF_SECTOR = "Exchange Traded Funds";
// NSE page symbol for a board code, where the two differ.
const NSE_SYMBOL = { HFCB: "HFCK", SMWF: "SMWF.E0000", SKL: "SKL.O0000" };
const STOCK_PAGE = "https://live.mystocks.co.ke/stock=";
export const STALE_DAYS = 180;
// Suspended by the NSE and still suspended per Business Daily, 7 Sep 2026.
export const SUSPENDED = new Set(["ARM", "DCON", "MSC", "BAMB", "CABL", "TCL"]);
// NSE restricted sub-segment: professional investors only.
export const RESTRICTED = new Set(["LAPR"]);
// US-dollar units on the NSE (listing notices).
export const USD_LINES = new Set(["ALP", "TRFC"]);
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// nse.co.ke sends a header line that Node's HTTP parser rejects. curl
// reads it.
export async function getText(url, referer) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const args = ["-fsSL", "--compressed", "--max-time", "45", "-A", UA];
      if (referer) args.push("-e", referer);
      const { stdout } = await exec("curl", [...args, url], { maxBuffer: 8_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
}

function decode(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function boardCodes(xml) {
  if (!xml.includes("<mystocks")) throw new Error("myStocks board is not the market watch XML");
  const codes = [...xml.matchAll(/<i a="([^"]+)"/g)].map((match) => match[1].trim().toUpperCase());
  if (codes.length < 60) throw new Error(`myStocks board printed ${codes.length} lines`);
  if (new Set(codes).size !== codes.length) throw new Error("myStocks board repeats a code");
  return codes;
}

function sectorsOf(json) {
  const sectors = JSON.parse(json);
  const byCode = new Map();
  for (const [sector, members] of Object.entries(sectors)) {
    if (!members || typeof members !== "object") throw new Error(`sector ${sector} is not a list`);
    for (const [code, name] of Object.entries(members)) byCode.set(code.trim().toUpperCase(), { sector, name: String(name).replace(/\s+/g, " ").trim() });
  }
  if (!byCode.size || !Object.hasOwn(sectors, ETF_SECTOR)) throw new Error("myStocks sector file has no ETF sector");
  return byCode;
}

function nseIsins(html) {
  const text = decode(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const isins = new Map();
  for (const match of text.matchAll(/Trading Symbol:\s*([A-Z0-9.-]+)\s*ISIN CODE:\s*([A-Z0-9]+)/g)) {
    const isin = match[2];
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`NSE page has a bad ISIN ${isin} for ${match[1]}`);
    isins.set(match[1], isin);
  }
  if (isins.size < 60) throw new Error(`NSE listed-companies page printed ${isins.size} ISINs`);
  return isins;
}

// The NSE page's names, by trading symbol, to spot USD lines.
function nseNames(html) {
  const text = decode(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const names = new Map();
  for (const chunk of text.split(/ISIN CODE:\s*[A-Z0-9]+/)) {
    const match = chunk.match(/(.{0,120})Trading Symbol:\s*([A-Z0-9.-]+)\s*$/);
    if (match) names.set(match[2], match[1].trim());
  }
  return names;
}

// Last trade date on a myStocks stock page.
function lastTrade(html, code) {
  const match = html.match(/End of day - ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
  if (!match || !Object.hasOwn(MONTHS, match[1])) throw new Error(`myStocks page for ${code} prints no "End of day" date`);
  return new Date(Date.UTC(Number(match[3]), MONTHS[match[1]], Number(match[2])));
}

async function lastTrades(codes) {
  const dates = new Map();
  const queue = [...codes];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const code = queue.shift();
      dates.set(code, lastTrade(await getText(STOCK_PAGE + encodeURIComponent(code), REFERER), code));
    }
  }));
  return dates;
}

// Reads the board, the sector file and the NSE page, and returns the rows
// (sorted by ticker) with the codes left out and why.
export async function readNseBoard() {
  const stamp = new Date().toISOString().slice(0, 13).replace(/\D/g, "");
  const [xml, sectorJson, nseHtml] = await Promise.all([
    getText(BOARD, REFERER),
    getText(SECTORS + stamp, "https://tickers.mystocks.co.ke/"),
    getText(NSE),
  ]);
  const codes = boardCodes(xml);
  const sectors = sectorsOf(sectorJson);
  const isins = nseIsins(nseHtml);
  const names = nseNames(nseHtml);
  for (const [symbol, name] of names) {
    if (/\bUSD\b/.test(name) && !USD_LINES.has(symbol)) throw new Error(`NSE page names a USD line not known here: ${symbol} (${name})`);
  }
  const isRights = (code) => /-R$/.test(code) || /\(Rights\)$/i.test(sectors.get(code)?.name || "");
  const trades = await lastTrades(codes.filter((code) => !isRights(code)));
  const today = Date.now();
  const ageDays = (code) => Math.floor((today - trades.get(code).getTime()) / 86_400_000);

  const rows = [];
  const leftOut = [];
  const suspended = [];
  const stale = [];
  const restricted = [];
  const used = new Set();
  for (const code of codes) {
    const entry = sectors.get(code);
    if (!entry) throw new Error(`${code} is on the board but in no myStocks sector`);
    if (isRights(code)) {
      leftOut.push(code);
      continue;
    }
    // Left-out codes still count as matched, for the board/NSE page check.
    const symbol = NSE_SYMBOL[code] || code;
    const isin = isins.get(symbol);
    if (isin) used.add(symbol);
    if (SUSPENDED.has(code)) {
      if (ageDays(code) < 30) throw new Error(`${code} is listed here as suspended but traded on ${trades.get(code).toISOString().slice(0, 10)}`);
      suspended.push(code);
      continue;
    }
    if (RESTRICTED.has(code)) {
      restricted.push(code);
      continue;
    }
    if (ageDays(code) > STALE_DAYS) {
      stale.push(`${code} ${trades.get(code).toISOString().slice(0, 10)}`);
      continue;
    }
    const type = entry.sector === ETF_SECTOR ? "ETF" : "STOCK";
    const currency = USD_LINES.has(code) ? "USD" : "KES";
    rows.push({
      query: code,
      ticker: code,
      name: entry.name,
      exchange: EXCHANGE,
      currency,
      type,
      ...(isin ? { isin } : {}),
      mic: MIC,
      raw: [code, entry.name, entry.sector, EXCHANGE, currency, isin || "", type].join(" "),
    });
  }

  // The NSE page and the board describe the same market. More than a few
  // NSE symbols missing from the board means one of the two changed.
  const unmatched = [...isins.keys()].filter((symbol) => !used.has(symbol));
  if (unmatched.length > 3) throw new Error(`NSE symbols not on the board: ${unmatched.join(", ")}`);
  if (!rows.some((row) => row.type === "ETF")) throw new Error("no ETF on the board");

  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return { rows, leftOut, suspended, stale, restricted, unmatched };
}

// One line on what was kept and what was left out.
export function nseSummary({ rows, leftOut, suspended, stale, restricted, unmatched }) {
  const count = (type) => rows.filter((row) => row.type === type).length;
  const noIsin = rows.filter((row) => !row.isin).map((row) => row.ticker);
  const usd = rows.filter((row) => row.currency === "USD").map((row) => row.ticker);
  return `${rows.length} listings (${count("STOCK")} STOCK, ${count("ETF")} ETF) on ${EXCHANGE}; left out: ${leftOut.length} rights (${leftOut.join(", ") || "none"}), ${suspended.length} suspended (${suspended.join(", ") || "none"}), ${stale.length} with no trade in ${STALE_DAYS} days (${stale.join(", ") || "none"}), ${restricted.length} restricted sub-segment (${restricted.join(", ") || "none"}); USD: ${usd.join(", ") || "none"}; no ISIN: ${noIsin.join(", ") || "none"}${unmatched.length ? `; NSE symbols not on board: ${unmatched.join(", ")}` : ""}`;
}
