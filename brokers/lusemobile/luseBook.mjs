// The Lusaka Securities Exchange (LuSE, MIC XLUS) book: every share a
// client can buy on the exchange's equity board, ordinary and preference
// shares, in kwacha or in US dollars as each line trades.
//
// The exchange's own site (luse.co.zm: the listed-companies page, the
// market data, the WordPress feeds) answers every script call with a
// Cloudflare "Just a moment..." challenge, so it cannot be read. Only its
// uploaded PDFs answer, and their names are not listed anywhere readable.
// What is read instead:
//   - AFX (afx.kwayisi.org), which republishes the LuSE board every
//     session: the "Listed companies/securities" table gives each line's
//     LuSE ticker, and the line's own page gives its ISIN, its trading
//     currency ("Monetary values are quoted in US Dollar (USD)") and the
//     date of its last trade ("closed its last trading day (Tuesday,
//     October 27, 2026)");
//       https://afx.kwayisi.org/luse/
//       https://afx.kwayisi.org/luse/<ticker>.html
//   - african-markets.com's LuSE list, as a check: an ISIN that differs
//     from AFX's for the same code is reported and AFX's is kept (on
//     2026-10-28 only Puma Energy PUMA: AFX ZM0000000185, african-markets
//     ZM0000000194), and the lines it prints that AFX does not are
//     reported (on 2026-10-28: Pamodzi Hotels PMDZ, no trade since
//     October 2024; First Quantum FQMZ, suspended; EIZ Properties EIZP; the
//     old kwacha line of Real Estate Investments Zambia, ZM0000000045,
//     which now trades in US dollars as ZM4000000013).
//       https://www.african-markets.com/en/stock-markets/luse/listed-companies
//
// A line whose last trade is more than 180 days old is left out as
// dormant or suspended (the LuSE keeps suspended codes on its board).
// LuSE lists no ETF today; bonds are not on this board. Shoprite (SHOP)
// is the JSE company's LuSE line, with the JSE ISIN.
//
// AFX prints no ISIN for a few recent lines (Dot Com Zambia, DCZM): the
// ISIN african-markets gives under the same code is used; a line with no
// ISIN anywhere is left out and reported.
//
// When AFX does not answer (it stopped answering this machine for hours
// on 2026-10-28, after a few test runs), the book falls back on
// african-markets alone: its table, its ISINs, its LuSE codes mapped to the
// exchange's tickers, and each company page's quote date standing in for
// the last trade (see africanBook below).
//
// `luseBook()` returns { rows, stale, noIsin, differ, onlyOnAfrican, source, latest }.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const AFX = "https://afx.kwayisi.org/luse/";
const AFRICAN = "https://www.african-markets.com/en/stock-markets/luse/listed-companies";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const STALE_DAYS = 180;
const DAY = 86_400_000;
const CURRENCY = { "Zambian Kwacha": "ZMW", "US Dollar": "USD" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

async function get(url, { attempts = 4, seconds = 40 } = {}) {
  let last = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", String(seconds), "-A", UA, url], { maxBuffer: 16_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last || url);
}

// The AFX board: ticker -> { name, page }.
function afxBoard(html) {
  const start = html.indexOf("Listed companies/securities");
  if (start < 0) throw new Error("AFX LuSE page has no listed-companies table");
  const table = html.slice(start, html.indexOf("</table>", start));
  const lines = new Map();
  for (const match of table.matchAll(/<tr><td><a href=(https:\/\/afx\.kwayisi\.org\/luse\/[a-z0-9-]+\.html) title="([^"]+)">([A-Z0-9.-]+)<\/a>/g)) {
    const [, page, name, ticker] = match;
    if (lines.has(ticker)) throw new Error(`AFX repeats ${ticker}`);
    lines.set(ticker, { name: clean(name), page });
  }
  const shown = table.match(/Showing 1 - (\d+) of (\d+) listings/) || html.match(/Showing 1 - (\d+) of (\d+) listings/);
  if (shown && Number(shown[2]) !== lines.size) throw new Error(`AFX says ${shown[2]} listings, ${lines.size} read`);
  return lines;
}

// One line's page: ISIN, currency, last trade date.
function afxLine(html, ticker) {
  const isin = html.match(/ISIN: ([A-Z]{2}[A-Z0-9]{9}[0-9])\)/)?.[1] || "";
  const money = html.match(/Monetary values are quoted in ([A-Za-z ]+?) \(/)?.[1] || "";
  const currency = CURRENCY[money.trim()];
  if (!currency) throw new Error(`AFX ${ticker}: unknown currency ${JSON.stringify(money)}`);
  const date = html.match(/closed its last trading day \([A-Za-z]+, ([A-Za-z]+ \d{1,2}, \d{4})\)/)?.[1] || "";
  const time = date ? Date.parse(`${date} UTC`) : NaN;
  return { isin, currency, time };
}

// african-markets: its LuSE table (code, name) and its own ISIN list.
function africanList(html) {
  const start = html.indexOf("Listed companies</h3>");
  const table = start >= 0 ? html.slice(start, html.indexOf("</table>", start)) : "";
  const codes = [...table.matchAll(/code=([^'"]+)['"][^>]*>([^<]+)<\/a>/g)].map((match) => ({ code: match[1], name: clean(match[2]) }));
  const isins = new Map();
  for (const match of html.matchAll(/"market": "Zambia",\s*"ticker": "([^"]+)",\s*"isin": "([^"]+)",\s*"company": "([^"]+)"/g)) {
    isins.set(match[1], { isin: match[2], name: clean(match[3]) });
  }
  return codes.map((line) => ({ ...line, isin: isins.get(line.code)?.isin || "" }));
}

// african-markets codes that differ from the LuSE tickers (from AFX's
// board of 2026-10-28, matched by ISIN).
const LUSE_CODE = { ZANCO: "ZNCO", ZAMBR: "ZABR", ZAMBF: "ZMBF", ZAMFA: "ZMFA", ZAMBIARE: "ZMRE", MFIN: "MAFS", REIZUSD: "REIZ" };
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// Fallback when AFX does not answer: african-markets' LuSE table, each
// company page's quote date ("As of 15-Sep-2023") standing in for the last
// trade date. That date is carried forward on some quiet lines, so the
// fallback can keep a dormant line AFX would drop; FARM (the REIZ
// preference shares) is not on african-markets and is missing then.
async function africanBook(african) {
  const read = [];
  for (const line of african) {
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(line.isin)) continue;
    await sleep(1000);
    const page = await get(`https://www.african-markets.com/en/stock-markets/luse/listed-companies/company?code=${encodeURIComponent(line.code)}`);
    const text = page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const quote = text.match(/(ZMW|USD) [^A]{0,40}As of (\d{2})-([A-Za-z]{3})-(\d{4})/);
    if (!quote) throw new Error(`african-markets ${line.code}: no quote date`);
    const time = Date.UTC(Number(quote[4]), MONTHS[quote[3]], Number(quote[2]));
    read.push({ ticker: LUSE_CODE[line.code] || line.code, name: line.name, isin: line.isin, currency: quote[1], time });
  }
  return read;
}

export async function luseBook() {
  const african = africanList(await get(AFRICAN));
  if (african.length < 18) throw new Error(`african-markets printed ${african.length} LuSE lines`);
  let index = "";
  try {
    index = await get(AFX, { attempts: 2, seconds: 25 });
  } catch (error) {
    console.error(`AFX does not answer (${error.message.split("\n")[0]}): the LuSE book falls back on african-markets`);
  }
  if (!index) return finish(await africanBook(african), [], african, "african-markets");
  const board = afxBoard(index);
  if (board.size < 18) throw new Error(`AFX printed ${board.size} LuSE lines`);
  const africanIsin = new Map(african.map((line) => [line.code, line.isin]));
  const read = [];
  const noIsin = [];
  for (const [ticker, { name, page }] of board) {
    await sleep(1000);
    const line = afxLine(await get(page), ticker);
    // AFX prints no ISIN for a few recent listings (DCZM); african-markets
    // gives it under the same code.
    if (!line.isin && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(africanIsin.get(ticker) || "")) line.isin = africanIsin.get(ticker);
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(line.isin)) {
      noIsin.push(ticker);
      continue;
    }
    read.push({ ticker, name, ...line });
  }
  if (noIsin.length > 2) throw new Error(`no ISIN for ${noIsin.join(", ")}`);
  return finish(read, noIsin, african, "AFX");
}

function finish(read, noIsin, african, source) {
  const rows = [];
  const stale = [];
  const latest = Math.max(...read.map((line) => line.time).filter(Number.isFinite));
  if (!Number.isFinite(latest)) throw new Error(`no ${source} LuSE line has a trade date`);
  if ((Date.now() - latest) / DAY > 14) throw new Error(`the latest LuSE trade ${source} prints is ${new Date(latest).toISOString().slice(0, 10)}`);
  const seen = new Set();
  for (const line of read) {
    if (seen.has(line.isin)) throw new Error(`${source} repeats ISIN ${line.isin}`);
    seen.add(line.isin);
    const day = Number.isFinite(line.time) ? new Date(line.time).toISOString().slice(0, 10) : "never";
    if (!Number.isFinite(line.time) || (latest - line.time) / DAY > STALE_DAYS) {
      stale.push(`${line.ticker} (${source === "AFX" ? "last trade" : "quoted"} ${day})`);
      continue;
    }
    // FARM is the REIZ preference share line.
    const name = line.ticker === "FARM" ? "Real Estate Investments Zambia Preference Shares" : line.name;
    rows.push({
      query: line.ticker,
      ticker: line.ticker,
      name,
      exchange: "Lusaka",
      mic: "XLUS",
      currency: line.currency,
      type: "STOCK",
      isin: line.isin,
      raw: [line.ticker, name, "LuSE", line.isin, line.currency, `${source === "AFX" ? "last trade" : "quoted"} ${day}`].join(" | "),
    });
  }
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));

  // Cross-check with african-markets: same ISIN for the same company, and
  // the lines only it prints are reported.
  const afxIsins = new Set(read.map((line) => line.isin));
  const afxByTicker = new Map(read.map((line) => [line.ticker, line.isin]));
  const differ = source !== "AFX" ? [] : african.filter((line) => line.isin && afxByTicker.has(line.code) && afxByTicker.get(line.code) !== line.isin).map((line) => `${line.code} AFX ${afxByTicker.get(line.code)}, african-markets ${line.isin}`);
  const onlyOnAfrican = source !== "AFX" ? [] : african.filter((line) => line.isin && !afxIsins.has(line.isin) && !afxByTicker.has(line.code)).map((line) => `${line.code} ${line.name} ${line.isin}`);
  if (differ.length > 3) throw new Error(`AFX and african-markets give other ISINs: ${differ.join("; ")}`);

  for (const ticker of ["ATEL", "ZNCO", "ZCCM", "CECZ", "ZSUG", "SCBL"]) {
    if (!rows.some((row) => row.ticker === ticker)) throw new Error(`LuSE book misses ${ticker}`);
  }
  if (rows.length < 18) throw new Error(`only ${rows.length} LuSE lines kept`);
  return { rows, stale, noIsin, differ, onlyOnAfrican, source, latest: new Date(latest).toISOString().slice(0, 10) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const book = await luseBook();
  console.log(`${book.rows.length} LuSE lines from ${book.source}, latest session ${book.latest}`);
  for (const row of book.rows) console.log(`  ${row.ticker} ${row.currency} ${row.isin} ${row.name}`);
  console.log(`stale: ${book.stale.join(", ") || "none"}`);
  console.log(`no ISIN: ${book.noIsin.join(", ") || "none"}`);
  console.log(`other ISIN on african-markets (AFX kept): ${book.differ.join("; ") || "none"}`);
  console.log(`only on african-markets: ${book.onlyOnAfrican.join("; ") || "none"}`);
}
