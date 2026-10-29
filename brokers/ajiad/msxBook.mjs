// The Muscat Stock Exchange book, for a broker that deals in all of it
// (../ajiad). Every listed share and fund unit open to trade, in rials,
// from the exchange's own public site (msx.om), with no login.
//
// Three reads:
//
//   The market watch (market-watch-custom.aspx) loads one JSON call,
//   APIPage.aspx/GetPageData grouped by market, that prints every listed
//   line of each market with its symbol, name, session prices and a status
//   ("2" draws the "Suspended" icon on the page). The markets:
//     Regular Market, Parallel Market            shares
//     Under_Monitoring Market                    shares of companies with
//                                                large accumulated losses or
//                                                in liquidation; they keep
//                                                their listing and order book
//     Alternative Investment Market (AIM)        shares of small companies
//     Collective Investment Funds Market         listed closed-end and real
//                                                estate funds (Oman REIT
//                                                Fund, Jabal REIF...): kept
//                                                as shares, as listed REITs
//                                                and closed-end funds are in
//                                                ../wellstrade/usBook.mjs
//     Bonds Market                               bonds and sukuk, left out
//   A suspended line (status 2) is left out. The MSX lists no ETF, so every
//   row is a STOCK. The third market (closed SAOC companies) and the rights
//   issue, book building and public offering boards are not in the watch.
//
//   The companies list (companies.aspx/List) gives each symbol its listing
//   state ("Listed" 1 or 2 is listed, 3 delisted) and long English name; a
//   watch line the list calls delisted is left out.
//
//   Each symbol's snapshot page (snapshot.aspx?s=SYMBOL) prints its ISIN
//   (OM...). The symbol printed on the page must be the one asked for.
//
//   https://www.msx.om/market-watch-custom.aspx
//   https://www.msx.om/companies.aspx
//   https://www.msx.om/snapshot.aspx?s=BKMB
//
// The read (about 120 page loads) is kept for 12 hours in the system temp
// folder. Row: { query, ticker, name, exchange "Muscat Stock Exchange", mic
// "XMUS", currency "OMR", type "STOCK", isin, raw }; the place is written
// out in full, as venues.mjs names it.
//
//   import { msxBook } from "../ajiad/msxBook.mjs";
//   const { rows, leftOut, session } = await msxBook();
//
//   node brokers/ajiad/msxBook.mjs      (prints the counts)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "Muscat Stock Exchange";
export const MIC = "XMUS";

const SITE = "https://www.msx.om";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const KEEP = {
  "Regular Market": "Regular",
  "Parallel Market": "Parallel",
  "Under_Monitoring Market": "Under Monitoring",
  "Alternative Investment Market": "AIM",
  "Collective Investment Funds Market": "Funds",
};
const SKIP = new Set(["Bonds Market"]);
const MUST = ["BKMB", "OQGN", "OTEL", "BKSB"];
const FLOOR = 90;
const CACHE = path.join(os.tmpdir(), "msx-book-cache.json");
const CACHE_HOURS = 12;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) =>
  String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

async function call(url, init = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1_500 * (attempt + 1));
  }
  throw new Error(last);
}

const post = async (page, body, referer) =>
  JSON.parse(
    await call(`${SITE}/${page}`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json", Referer: `${SITE}/${referer}` },
    }),
  ).d;

// symbol -> ISIN from its snapshot page, or "" when the page prints none.
async function isinOf(symbol) {
  const html = await call(`${SITE}/snapshot.aspx?s=${encodeURIComponent(symbol)}`, { headers: { Accept: "text/html" } });
  const field = (id) => clean((html.match(new RegExp(`id="ctl00_ContentPlaceHolder1_${id}"[^>]*>([^<]*)`)) || [])[1]);
  if (field("CompanySymbolLabel").replace(/[()]/g, "").toUpperCase() !== symbol.toUpperCase()) return "";
  const isin = field("ISINLabel").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "";
}

async function crawl() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3_600_000) return cached;
  } catch {}

  const answer = await post("APIPage.aspx/GetPageData", JSON.stringify({ sHiddens: "||false|||Market|0" }), "market-watch-custom.aspx");
  const result = JSON.parse(String(answer).split("|")[0]);
  if (result.Status !== "Success" || !Array.isArray(result.Data)) throw new Error("MSX market watch answered no data");
  const listed = new Map();
  for (const company of await post("companies.aspx/List", "{}", "companies.aspx")) listed.set(company.Symbol, company);

  const lines = [];
  const leftOut = [];
  for (const market of result.Data) {
    const board = clean(market.MarketNameEn);
    if (SKIP.has(board)) continue;
    if (!KEEP[board]) throw new Error(`MSX market watch has a new market: ${board}`);
    for (const line of market.MarketList) {
      const symbol = clean(line.Symbol);
      const name = clean(listed.get(symbol)?.LongNameEn || line.LongNameEn || line.ShortNameEn);
      if (line.Status === "2") {
        leftOut.push(`${symbol} ${name}: suspended (${board})`);
        continue;
      }
      if (listed.get(symbol)?.Listed === "3") {
        leftOut.push(`${symbol} ${name}: delisted`);
        continue;
      }
      lines.push({
        symbol,
        name,
        board: KEEP[board],
        turnover: Number(String(line.Turnover || "0").replace(/,/g, "")) || 0,
        note: clean(line.isFlagMMLoss25En),
      });
    }
  }
  for (const line of lines) {
    line.isin = await isinOf(line.symbol);
    await sleep(300);
  }
  const data = { at: Date.now(), lines, leftOut };
  fs.writeFileSync(CACHE, JSON.stringify(data));
  return data;
}

export async function msxBook() {
  const { lines, leftOut: out } = await crawl();
  const leftOut = [...out];
  const rows = [];
  const seen = new Set();
  for (const line of lines) {
    if (seen.has(line.symbol)) continue;
    seen.add(line.symbol);
    rows.push({
      query: line.isin || line.symbol,
      ticker: line.symbol,
      name: line.name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "OMR",
      type: "STOCK",
      isin: line.isin,
      raw: [line.symbol, line.name, `${line.board} market`, line.note, "OMR", line.isin].filter(Boolean).join(" | "),
    });
    if (!line.isin) leftOut.push(`${line.symbol} kept without ISIN`);
  }
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`MSX book is missing ${ticker}`);
  if (rows.length < FLOOR) throw new Error(`only ${rows.length} MSX lines open`);
  if (rows.filter((row) => !row.isin).length > 10) throw new Error("too many MSX lines without an ISIN");
  return { rows, leftOut, turnover: new Map(lines.map((line) => [line.symbol, line.turnover])) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { rows, leftOut } = await msxBook();
  const counts = {};
  for (const row of rows) {
    const board = row.raw.split(" | ")[2];
    counts[board] = (counts[board] || 0) + 1;
  }
  console.log(`${rows.length} MSX lines`, counts);
  console.log(`left out: ${leftOut.join("; ") || "none"}`);
}
