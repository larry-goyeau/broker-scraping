// Every share and ETF that can be bought on the Nigerian Exchange today,
// with no login: the shared book for the brokers whose only place is the
// NGX and which name no list of their own (../morgancapital and the other
// Nigerian online brokers).
//
// The set comes from the exchange's own lists, the two behind ngxgroup.com's
// price-list pages: the equities list (Main, Premium, Growth and
// Non-Interest Finance boards, and the "Real Estate Investment Trust &
// Close End Fund" board) and the exchange-traded products list.
//
//   https://ngxgroup.com/exchange/data/equities-price-list/
//   https://doclib.ngxgroup.com/REST/api/statistics/equities/?market=&sector=&orderby=&pageSize=300&pageNo=0
//   https://ngxgroup.com/exchange/data/etfs-price-list/
//   https://doclib.ngxgroup.com/REST/api/statistics/etfs/?market=&sector=&orderby=&pageSize=300&pageNo=0
//
// Shares, listed REITs and ETFs are written. The closed-end funds the
// exchange quotes on its Main Board (Coronation Infrastructure Fund CNIF,
// Chapel Hill Denham Infrastructure Debt Fund NIDF, MOFI Real Estate
// Investment Fund MOFIREIF, AVA Infrastructure Fund AVAIF) are funds, not
// shares, and are left out, as in ../meristem/ngxBook.mjs. Bonds, sukuk,
// indexes and memorandum mutual funds are not on these two lists.
//
// The exchange publishes no list of suspended shares. A suspended share
// stays on the equities list at its last price with no trade. The NGX
// Daily Official List (Equities) of the list's session prints each Main
// and Premium Board share's "Last Business Done" date: a share whose last
// trade is more than STALE_DAYS older than the session cannot be bought
// and is dropped, and so is one the equities list flags [DIP], "Delisting
// in Process". On 2026-10-23 that dropped eight, the same eight NGX RegCo
// suspended or is delisting: UNIVINSURE (last trade 19/08/26, suspended
// 20 Aug 2026), ALEX [BMF] (21/07/26, suspended 22 Jul 2026 for not filing
// its FY2025 accounts), UNITYBNK [MRF] (25/09/25, Providus merger, "fully
// suspended and delisted"), GOLDBREW [BMF] (05/05/25), PHARMDEKO [MRS]
// (10/07/23), AFROMEDIA [MRF] (10/07/23), AFRINSURE [MRF] (30/06/22) and
// EKOCORP [DIP] (09/06/22). The next oldest share traded in October.
// Other flags ([BLS], [RST], [DWL]) sit on lines that trade every day and
// are kept. The Daily Official List does not print the Growth and
// Non-Interest boards; their lines are kept unless flagged [DIP].
//
//   https://doclib.ngxgroup.com/DownloadsContent/Daily%20Official%20List%20-%20Equities%20for%20<dd-mm-yyyy>.pdf
//
// The NGX lists print no name and no ISIN. Both come from the Standard Bank
// feed behind Stanbic IBTC's price listing, read by ../meristem/ngxBook.mjs
// (a code with a bad check digit is dropped there), then from the shared
// lists (stocks.csv and etfs.csv, NSENG) when the feed has none, then from
// the Daily Official List's security name.
//
// The PDF is read with PyMuPDF (pip install pymupdf), as ../atlass does.
//
// ngxWhole() returns { rows, day, dolDay, dropped, leftOut }:
//   rows     the book (query, ticker, name, exchange, mic, currency, type,
//            isin, raw), every row "Nigerian Exchange", XNGN, NGN;
//   day      the session of the NGX lists (yyyy-mm-dd);
//   dolDay   the session of the Daily Official List read;
//   dropped  [{ ticker, board, flag, last, why }] suspended or delisting;
//   leftOut  Map label -> count of lines that are not shares or ETFs.
// Each row's raw carries the NGX board, so a broker that excludes a board
// (e.g. the REIT board) can filter on it.
//
//   node brokers/morgancapital/ngxWhole.mjs     (prints the counts)

import { ngxListings } from "../meristem/ngxBook.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const PLACE = "Nigerian Exchange";
const MIC = "XNGN";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EQUITIES = "https://doclib.ngxgroup.com/REST/api/statistics/equities/?market=&sector=&orderby=&pageSize=300&pageNo=0";
const EQUITIES_PAGE = "https://ngxgroup.com/exchange/data/equities-price-list/";
const ETPS = "https://doclib.ngxgroup.com/REST/api/statistics/etfs/?market=&sector=&orderby=&pageSize=300&pageNo=0";
const ETPS_PAGE = "https://ngxgroup.com/exchange/data/etfs-price-list/";
const DOL = (dd, mm, yyyy) =>
  `https://doclib.ngxgroup.com/DownloadsContent/Daily%20Official%20List%20-%20Equities%20for%20${dd}-${mm}-${yyyy}.pdf`;
const BOARDS = /^(Main Board|Premium Board|Growth Board|Non-Interest Finance Board|Real Estate Investment Trust & Close End Fund)$/i;
const DELISTING = /\[DIP\]/;
const STALE_DAYS = 30;
const MAX_AGE_DAYS = 10;
const FUNDS = { CNIF: "closed-end fund", NIDF: "closed-end fund", MOFIREIF: "closed-end fund", AVAIF: "closed-end fund" };
const FLOOR = { STOCK: 130, ETF: 10 };
const MUST = ["DANGCEM", "MTNN", "GTCO", "ZENITHBANK", "ACCESSCORP", "SEPLAT", "STANBICETF30", "NEWGOLD"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// A 404 answers null when `gone` is set: a Daily Official List not posted.
async function fetchRetry(url, { referer, binary = false, gone = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Referer: referer },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
      if (gone && response.status === 404) return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function pdfLines(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
json.dump([l.strip() for page in doc for l in page.get_text().split("\\n") if l.strip()], sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.error || python.status !== 0) {
    const detail = python.stderr?.toString() || python.error?.message || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
  }
  return JSON.parse(python.stdout.toString());
}

// NSENG lines of the shared lists: ticker -> [{ isin, name, etf }].
function listLines() {
  const found = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    const etf = file.includes("etfs");
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const match = line.match(/^NSENG:([^,]+),NSENG,([A-Z]{2}[A-Z0-9]{9}\d),(.*)$/);
      if (!match) continue;
      const ticker = match[1].trim().toUpperCase();
      if (!found.has(ticker)) found.set(ticker, []);
      found.get(ticker).push({ isin: match[2], name: match[3].replace(/^"|"$/g, "").trim(), etf });
    }
  }
  return found;
}

async function ngxList(url, referer, floor) {
  const list = JSON.parse(await fetchRetry(url, { referer }));
  if (!Array.isArray(list) || list.length < floor) throw new Error(`${url} has ${list?.length} lines`);
  return list;
}

export async function ngxWhole() {
  const equities = await ngxList(EQUITIES, EQUITIES_PAGE, 130);
  await sleep(500);
  const etps = await ngxList(ETPS, ETPS_PAGE, 8);
  await sleep(500);

  const dates = equities.map((line) => String(line.TradeDate || "").slice(0, 10)).filter(Boolean).sort();
  const day = dates.at(-1);
  if (!day || !((Date.now() - Date.parse(`${day}T00:00:00Z`)) / 86_400_000 < MAX_AGE_DAYS)) {
    throw new Error(`the NGX equities list is dated ${day}`);
  }

  const board = new Map();
  const flag = new Map();
  for (const line of equities) {
    const symbol = clean(line.Symbol).toUpperCase();
    if (!symbol) throw new Error(`unreadable NGX line ${JSON.stringify(line).slice(0, 160)}`);
    const market = clean(line.Market);
    if (!BOARDS.test(market)) throw new Error(`unknown NGX board ${market || "(none)"} on ${symbol}`);
    if (board.has(symbol)) throw new Error(`${symbol} repeats on the NGX equities list`);
    board.set(symbol, market);
    flag.set(symbol, clean(clean(line.Company2).replace(symbol, "")));
  }
  for (const line of etps) {
    const symbol = clean(line.Symbol).toUpperCase();
    if (!symbol) throw new Error(`unreadable NGX ETP line ${JSON.stringify(line).slice(0, 160)}`);
    if (board.has(symbol)) throw new Error(`${symbol} is on both NGX lists`);
    board.set(symbol, "ETP");
    flag.set(symbol, "");
  }

  // The Daily Official List of the session, or of the one before when the
  // exchange has not posted it yet.
  let dol = null;
  let dolDay = null;
  for (let back = 0; back < 7 && !dol; back += 1) {
    const date = new Date(Date.parse(`${day}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
    const [yyyy, mm, dd] = date.split("-");
    const bytes = await fetchRetry(DOL(dd, mm, yyyy), { binary: true, gone: true, referer: EQUITIES_PAGE });
    if (bytes && bytes.subarray(0, 5).toString() === "%PDF-") {
      dol = pdfLines(bytes);
      dolDay = date;
    }
    await sleep(500);
  }
  if (!dol || !dol[0]?.startsWith("Daily Official List (Equities)")) throw new Error(`no NGX Daily Official List since ${day}`);
  // A symbol's line is the symbol alone or, failing that, "SYMBOL SECURITY
  // NAME" (the Premium Board prints it so). A name line can start with
  // another symbol ("UPDC REAL ESTATE" under UPDCREIT), so the exact
  // lines are taken first.
  const symbolAt = new Map();
  dol.forEach((text, index) => {
    if (board.has(text) && !symbolAt.has(text)) symbolAt.set(text, index);
  });
  dol.forEach((text, index) => {
    const head = text.split(" ")[0];
    if (head !== text && board.has(head) && !symbolAt.has(head)) symbolAt.set(head, index);
  });
  const symbolLines = new Set(symbolAt.values());
  // "Last Business Done": the first dd/mm/yy after the symbol, before the next one.
  function dolEntry(symbol) {
    const at = symbolAt.get(symbol);
    if (at === undefined) return undefined;
    const nameParts = [dol[at].slice(symbol.length).trim()];
    let last = null;
    for (let i = at + 1; i < Math.min(dol.length, at + 30); i += 1) {
      if (dol[i] === "Symbol" || symbolLines.has(i)) break;
      if (!last && /^[A-Z&.,'()\- ]+$/.test(dol[i]) && !/^\d/.test(dol[i])) nameParts.push(dol[i]);
      const date = dol[i].match(/(?:^|\s)(\d{2})\/(\d{2})\/(\d{2})$/);
      if (date) {
        last = `20${date[3]}-${date[2]}-${date[1]}`;
        break;
      }
    }
    return { last, name: clean(nameParts.join(" ")) };
  }
  if (!dolEntry("DANGCEM")?.last) throw new Error("the NGX Daily Official List has no date for DANGCEM");
  const staleBefore = new Date(Date.parse(`${dolDay}T00:00:00Z`) - STALE_DAYS * 86_400_000).toISOString().slice(0, 10);

  // Names, ISINs and kinds from the Standard Bank feed, then the shared lists.
  const feed = new Map((await ngxListings()).rows.map((row) => [row.ticker, row]));
  const lists = listLines();

  const rows = [];
  const dropped = [];
  const leftOut = new Map();
  const tally = (label) => leftOut.set(label, (leftOut.get(label) || 0) + 1);
  for (const [ticker, market] of board) {
    if (FUNDS[ticker]) {
      tally(FUNDS[ticker]);
      continue;
    }
    const mark = flag.get(ticker);
    const entry = market === "ETP" ? undefined : dolEntry(ticker);
    const last = entry?.last;
    if (DELISTING.test(mark)) {
      dropped.push({ ticker, board: market, flag: mark, last, why: "delisting in process" });
      continue;
    }
    if (last && last < staleBefore) {
      dropped.push({ ticker, board: market, flag: mark, last, why: `no trade since ${last}` });
      continue;
    }
    const fed = feed.get(ticker);
    const known = lists.get(ticker) || [];
    const hit = new Set(known.map((line) => line.isin)).size === 1 ? known[0] : null;
    const isin = fed?.isin || hit?.isin || "";
    const type = market === "ETP" || fed?.type === "ETF" || hit?.etf ? "ETF" : "STOCK";
    const name = fed?.name || hit?.name || entry?.name || ticker;
    rows.push({
      query: isin || ticker,
      ticker,
      name,
      exchange: PLACE,
      mic: MIC,
      currency: "NGN",
      type,
      ...(isin ? { isin } : {}),
      raw: [
        ticker,
        name,
        `NGX ${market}${mark ? ` ${mark}` : ""}`,
        last ? `last trade ${last}` : "",
        isin,
        PLACE,
      ].filter(Boolean).join(" | "),
    });
  }

  const isins = new Set();
  for (const row of rows) {
    if (!row.isin) continue;
    if (isins.has(row.isin)) throw new Error(`ISIN ${row.isin} repeats`);
    isins.add(row.isin);
  }
  const count = { STOCK: 0, ETF: 0 };
  for (const row of rows) count[row.type] += 1;
  for (const [type, floor] of Object.entries(FLOOR)) {
    if (count[type] < floor) throw new Error(`only ${count[type]} ${type} lines`);
  }
  for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
  if (dropped.length > 25) throw new Error(`${dropped.length} lines look suspended: the Daily Official List may be misread`);

  rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  return { rows, day, dolDay, dropped, leftOut };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
  const count = {};
  const byBoard = {};
  for (const row of rows) {
    count[row.type] = (count[row.type] || 0) + 1;
    const market = row.raw.split(" | ")[2].replace(/ \[.*$/, "");
    byBoard[market] = (byBoard[market] || 0) + 1;
  }
  console.error(
    `${PLACE}: ${rows.length} rows (${day}, Daily Official List ${dolDay}): ` +
      `${Object.entries(count).map(([type, value]) => `${value} ${type}`).join(", ")}; ` +
      `${rows.filter((row) => row.isin).length} with ISIN, without: ${rows.filter((row) => !row.isin).map((row) => row.ticker).join(" ") || "none"}.\n` +
      `By board: ${Object.entries(byBoard).map(([key, value]) => `${key} ${value}`).join(", ")}.\n` +
      `Dropped: ${dropped.map((line) => `${line.ticker}${line.flag ? ` ${line.flag}` : ""} (${line.why})`).join(", ") || "none"}.\n` +
      `Left out: ${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
  );
}
