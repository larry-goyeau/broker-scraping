// The Macedonian Stock Exchange book, shared by the North Macedonian
// brokers whose only place is the MSE (TTK Banka, Stopanska banka / SB
// Broker). Their clients order through the exchange's BEST trading system,
// so the book is every share the exchange lets trade today. Each broker's
// scraper applies the exceptions its own pages name, if any.
//
// Read from the exchange's own public pages:
//   https://www.mse.mk/en/stats/current-schedule
//     "Trading mode of Securities": every security in BEST today, in its
//     three trading modes (continuous +/-10%, auction +/-20%, auction
//     without limits), with symbol, name and ISIN. A line the exchange
//     takes out of trading leaves this list; the symbol menu of
//     https://www.mse.mk/en/stats/symbolhistory/ALK lists the same lines.
//   https://www.mse.mk/en/symbol/<SYMBOL>
//     (redirects to the issuer page, one tab per line) the line's market
//     segment and kind ("Exchange Listing - Ordinary shares", "Free Market
//     - Ordinary shares", "Mandatory Listing - priority shares", "...
//     - Bonds"), its ISIN and its last trade inside the last year.
//   https://www.mse.mk/en/stats/symbolhistory/<SYMBOL>
//     the last month, day by day, with the line's last trade price; read
//     only for a line with no trade inside the last year, to tell a line
//     that once traded from one that never did.
//
// Kept: ordinary, priority and preference shares on every segment: the
// Official market (Super listing, Exchange listing, Mandatory listing)
// and the Regular market (Market of joint stock companies with special
// reporting obligations, Free market). An issuer under long-term
// suspension from listing stays: the exchange says its shares "are traded
// on the Regular Market of the Stock Exchange, in the Free Market
// subsegment" (https://www.mse.mk/en/news/22/12/2025/long-term-suspension-from-listing-of-the-issuer-zito-karaorman-ad-kicevo).
// The watch list (https://www.mse.mk/en/content/15/9/2020/lista-za-nabljuduvanje)
// is a warning, not a halt, so its issuers stay too.
// Left out: government bonds (denationalisation, structural and treasury
// bonds, ISIN MKMINF...), corporate, convertible and perpetual bonds
// ("Bonds" and "Other Securities" segments), lines that are not in the
// trading schedule (suspended, matured or delisted; the exchange's delisting
// notices, e.g. https://www.mse.mk/en/news/24/11/2025/delisting-of-shares-issued-by-geras-cunev-confection-ad-strumica-and-geras-cunev-trgovija-ad-strumica,
// take the line out of BEST), issuers whose name says they are in
// bankruptcy or liquidation ("vo stecaj", "vo likvidacija"), and lines
// that never traded (no last trade price in their history). Skopje lists
// no ETF, ETN or ETC today and no open-end fund trades on the exchange; a
// line whose kind names an ETF would be typed ETF. Every share trades in
// denars (MKD). The ISIN is the exchange's own, from the schedule, and the
// line's page must agree.
//
// The crawl (about 200 page loads, one every 0.6 s, under three minutes)
// is kept in mse-cache.json next to this file for 12 hours, so the
// scrapers run back to back read the exchange once.
//
//   import { mseBook } from "../ttkbanka/mseBook.mjs";
//   const rows = await mseBook();   // every share open to trade, by ticker

import fs from "node:fs";

const SITE = "https://www.mse.mk";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const CACHE = new URL("mse-cache.json", import.meta.url);
const CACHE_HOURS = 12;
export const EXCHANGE = "Macedonian Stock Exchange";
export const MIC = "XMAE";
export const CURRENCY = "MKD";

const MODES = {
  "continuousTradingMode-table": "continuous",
  "fixingWith20PercentLimit-table": "auction +/-20%",
  "fixingWithoutLimit-table": "auction without limits",
};
const BOARDS = [
  "Super Listing",
  "Exchange Listing",
  "Mandatory Listing",
  "Market of joint stock companies with special reporting obligations",
  "Free Market",
];
const EQUITY = { "ordinary shares": "ordinary", "priority shares": "preference", "preference shares": "preference" };
const NOT_EQUITY = { bonds: "bond", "other securities": "perpetual bond or other security" };
const WOUND_UP = /\b(vo )?(ste[cč]aj|likvidacija|bankruptcy|liquidation)\b/i;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (value) =>
  String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
// The exchange sometimes types an ISIN or a symbol with Cyrillic letters
// that look Latin (МК for MK).
const CYRILLIC = { А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", І: "I", Ј: "J", Ѕ: "S" };
const latin = (value) => String(value ?? "").toUpperCase().replace(/[АВЕКМНОРСТХУІЈЅ]/g, (letter) => CYRILLIC[letter]);
const clean = (value) => decode(String(value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

async function getText(path) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(SITE + path, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en" },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return await response.text();
      last = `${path} answered ${response.status}`;
    } catch (error) {
      last = `${path}: ${error.message || error}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(`Skopje: ${last}`);
}

function tableRows(html) {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)]
    .map((row) => [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => clean(cell[1])))
    .filter((cells) => cells.length);
}

// The trading schedule: { ticker, name, isin, mode } for every line in BEST.
async function schedule() {
  const html = await getText("/en/stats/current-schedule");
  const lines = [];
  for (const [id, mode] of Object.entries(MODES)) {
    const table = html.match(new RegExp(`<table id="${id}"[\\s\\S]*?</table>`));
    if (!table) throw new Error(`the Skopje schedule has no ${mode} table`);
    for (const cells of tableRows(table[0])) {
      const [ticker, name, isin] = [latin(cells[0]), cells[1], latin(cells[2])];
      if (!/^[A-Z0-9]{1,10}$/.test(ticker || "") || !name || !/^MK[A-Z0-9]{9}\d$/.test(isin || "")) {
        throw new Error(`an unreadable Skopje schedule line: ${JSON.stringify(cells)}`);
      }
      lines.push({ ticker, name, isin, mode });
    }
  }
  if (lines.length < 250) throw new Error(`the Skopje schedule lists only ${lines.length} lines`);
  return lines;
}

// One line's data block from its symbol page or from its tab on the
// issuer page: market segment, ISIN and last trade inside the last year.
function lineData(html, ticker) {
  let block = html;
  const tab = html.indexOf(`id="symboltab${ticker}" role="tabpanel"`);
  if (tab >= 0) {
    // Up to the next line's tab; a bond's tab holds tab panels of its own.
    const next = html.slice(tab + 10).search(/id="symboltab[^"]+" role="tabpanel"/);
    block = html.slice(tab, next >= 0 ? tab + 10 + next : undefined);
  } else if (/id="symboltab[^"]+" role="tabpanel"/.test(html)) {
    return null;
  }
  const field = (label) => {
    const match = block.match(new RegExp(`${label}\\s*</div>\\s*<div[^>]*>([\\s\\S]*?)</div>`));
    return match ? clean(match[1]) : null;
  };
  const segment = field("Market segment:");
  const isin = field("ISIN:");
  const trade = block.match(/Last trade:\s*([^<]*)</);
  if (!segment || !isin || !trade) return null;
  return { segment, isin: latin(isin), lastTrade: clean(trade[1]) };
}

function issuerOf(html) {
  const title = clean((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
  return title.replace(/^Issuer data - /, "").replace(/^Symbol - [A-Z0-9]+ - /, "");
}

function splitSegment(segment) {
  const board = BOARDS.find((name) => segment.toLowerCase().startsWith(name.toLowerCase() + " - "));
  if (!board) throw new Error(`unknown Skopje market segment "${segment}"`);
  return { board, kind: segment.slice(board.length + 3).trim().toLowerCase() };
}

// True when the line's history shows a last trade price.
async function everTraded(ticker) {
  const html = await getText(`/en/stats/symbolhistory/${encodeURIComponent(ticker)}`);
  const table = html.match(/<table id="resultsTable"[\s\S]*?<\/table>/);
  if (!table) throw new Error(`the Skopje history of ${ticker} has no table`);
  const rows = tableRows(table[0]);
  if (!rows.length) throw new Error(`the Skopje history of ${ticker} is empty`);
  return rows.some((cells) => Number(String(cells[1] || "").replace(/,/g, "")) > 0);
}

function readCache() {
  try {
    const kept = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    return { bookAt: kept.bookAt || null, book: kept.book || null };
  } catch {
    return { bookAt: null, book: null };
  }
}

async function readBook() {
  const lines = await schedule();
  const left = {};
  const drop = (reason, ticker) => {
    left[reason] = left[reason] || [];
    left[reason].push(ticker);
  };

  // Government bonds carry the Ministry of Finance's ISIN prefix.
  const candidates = [];
  for (const line of lines) {
    if (line.isin.startsWith("MKMINF")) drop("government bond", line.ticker);
    else candidates.push(line);
  }

  // One page per line; an issuer page answers for all its lines.
  const pages = new Map();
  let loads = 0;
  for (const line of candidates) {
    let data = null;
    for (const page of pages.values()) {
      data = page.tabs.has(line.ticker) ? lineData(page.html, line.ticker) : null;
      if (data) {
        line.issuer = page.issuer;
        break;
      }
    }
    if (!data) {
      await pause(600);
      const html = await getText(`/en/symbol/${encodeURIComponent(line.ticker)}`);
      loads += 1;
      const tabs = new Set([...html.matchAll(/id="symboltab([^"]+)" role="tabpanel"/g)].map((match) => match[1]));
      const issuer = issuerOf(html);
      pages.set(`${pages.size}`, { html, tabs, issuer });
      data = lineData(html, line.ticker);
      line.issuer = issuer;
    }
    if (!data) throw new Error(`the Skopje page of ${line.ticker} has no symbol data`);
    if (data.isin !== line.isin) throw new Error(`${line.ticker}: schedule ISIN ${line.isin}, page ISIN ${data.isin}`);
    Object.assign(line, data, splitSegment(data.segment));
  }

  const shares = [];
  for (const line of candidates) {
    if (NOT_EQUITY[line.kind]) {
      drop(NOT_EQUITY[line.kind], line.ticker);
      continue;
    }
    const etf = /\b(etf|etn|etc|exchange traded)\b/i.test(line.kind);
    if (!EQUITY[line.kind] && !etf) throw new Error(`unknown Skopje line kind "${line.kind}" on ${line.ticker}`);
    if (WOUND_UP.test(line.issuer) || WOUND_UP.test(line.name)) {
      drop("bankruptcy or liquidation", line.ticker);
      continue;
    }
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(line.lastTrade)) {
      if (line.lastTrade !== "No") throw new Error(`${line.ticker}: last trade "${line.lastTrade}"`);
      await pause(600);
      loads += 1;
      if (!(await everTraded(line.ticker))) {
        drop("never traded", line.ticker);
        continue;
      }
    }
    const status = /dolgoro[cč]no suspendirano od kotacija/i.test(line.issuer) ? "long-term suspended from listing, trades on the Free Market" : "";
    const name = line.issuer.replace(/\s+-\s+dolgoro[cč]no suspendirano od kotacija$/i, "").trim() || line.name;
    const type = etf ? "ETF" : "STOCK";
    shares.push({
      query: line.isin,
      ticker: line.ticker,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: CURRENCY,
      type,
      isin: line.isin,
      raw: [line.ticker, name, EXCHANGE, CURRENCY, type, line.board, EQUITY[line.kind] || line.kind, line.mode, line.lastTrade === "No" ? "no trade in the last year" : `last trade ${line.lastTrade}`, status]
        .filter(Boolean)
        .join(" "),
    });
  }

  const isins = new Set();
  for (const row of shares) {
    if (isins.has(row.isin)) throw new Error(`ISIN ${row.isin} on two Skopje lines`);
    isins.add(row.isin);
  }
  shares.sort((a, b) => a.ticker.localeCompare(b.ticker));
  if (shares.length < 100) throw new Error(`only ${shares.length} Skopje shares are open to trade`);
  for (const ticker of ["ALK", "KMB", "TEL", "MPT", "TTK", "STB"]) {
    if (!shares.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Skopje book`);
  }
  const bookAt = new Date().toISOString();
  const book = { shares, left, scheduled: lines.length };
  fs.writeFileSync(CACHE, JSON.stringify({ bookAt, book }, null, 1));
  return { ...book, bookAt, loads, fromCache: false };
}

// Every Skopje share open to trade, sorted by ticker. Rows are fresh
// objects; the caller stamps them (stampRows, withoutObligations) and
// writes its file.
export async function mseBook({ quiet = false } = {}) {
  const cache = readCache();
  let book;
  if (cache.book && cache.bookAt && Date.now() - Date.parse(cache.bookAt) < CACHE_HOURS * 3600_000) {
    book = { ...cache.book, bookAt: cache.bookAt, loads: 0, fromCache: true };
  } else {
    book = await readBook();
  }
  const rows = book.shares.map((row) => ({ ...row }));
  if (!quiet) {
    const byBoard = {};
    for (const row of rows) {
      const board = BOARDS.find((name) => row.raw.includes(` ${name} `)) || "?";
      byBoard[board] = (byBoard[board] || 0) + 1;
    }
    console.error(
      `Skopje book: ${rows.length} shares of ${book.scheduled} scheduled lines (${Object.entries(byBoard).map(([board, n]) => `${n} ${board}`).join(", ")})` +
        `${book.fromCache ? ` from mse-cache.json (${book.bookAt})` : `, ${book.loads} pages read`}; ` +
        `left out ${Object.entries(book.left).map(([reason, list]) => `${list.length} ${reason}`).join(", ")}`,
    );
  }
  return rows;
}

// The lines left out, { reason: [tickers] }, for a scraper that wants to
// print them.
export async function mseLeftOut() {
  if (!readCache().book) await mseBook({ quiet: true });
  return { ...readCache().book.left };
}
