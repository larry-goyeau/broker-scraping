// The Sarajevo Stock Exchange book (Sarajevska berza-burza, SASE, MIC
// XSSE), shared by the brokers whose only place is SASE (Unibroker in
// ./unibroker). Their clients order through the exchange's trading
// system, so the book is every share the exchange lists and lets trade
// today. Each broker's scraper applies the exceptions its own pages name,
// if any.
//
// Read from the exchange's own public feed, the one behind its "Uvršteni
// vrijednosni papiri" (listed securities) page:
//   https://www.sase.ba/v1/Tr%C5%BEi%C5%A1te/Emitenti/Uvr%C5%A1teni-vrijednosni-papiri
//   POST https://www.sase.ba/FeedServices/HandlerChart.ashx  type=3 lng=1
//     every listed line: symbol, name, market (Kotacija = Official market,
//     Slobodno tržište = Free market), segment, security type (Shares,
//     Bonds, Treasury Bills), status (Trading or Suspended) and last trade
//     date.
//   POST https://www.sase.ba/FeedServices/HandlerChart.ashx  type=37 symbol=<SYMBOL> lng=1
//     the line's details, as on its issuer profile page
//     (https://www.sase.ba/v1/Tr%C5%BEi%C5%A1te/Emitenti/Profil-emitenta/symbol/<SYMBOL>):
//     ISIN, status, kind ("Redovne dionice" = ordinary shares) and tier.
//
// Kept: shares on the Official market of companies, the Official market
// of funds and the Free market subsegments 1, 2 and 3. The funds are the
// closed-end investment funds (ZIF, "Dionice IF-ova"): joint-stock
// companies whose shares trade on the exchange like any other, typed FUND;
// saseBook({ funds: false }) leaves them out.
// Preference shares ("Povlaštene dionice") are kept too: the list types
// them "Treasury Bills" (ZGBMP, UPIBP, BHOSPK2), so a line of that type is
// read on its details, where its kind is "P", preference shares, and kept
// as a share; a real treasury bill would still be left out.
// Left out: bonds and other debt ("Official market - Bonds", "Official
// market - Other securities", public offerings), every
// line of the market for issuers in bankruptcy proceedings ("Emitenti u
// stečaju"), suspended lines (status "Suspended" in the list or on the
// line's own details), an issuer whose name says it is in bankruptcy or
// liquidation ("u stečaju", "u likvidaciji"), and lines that never traded
// (no last trade date). A delisted line is no longer in the exchange's
// list. SASE lists no ETF, ETN or ETC today. Every line trades in
// convertible marks (BAM). The ISIN is the exchange's own (BA...).
//
// The details (one request per kept line, about 160, one every 0.6 s) are
// kept in sase-cache.json next to this file for 12 hours, so the scrapers
// run back to back read the exchange once.
//
//   import { saseBook } from "../unibroker/saseBook.mjs";
//   const rows = await saseBook();                 // shares and ZIF funds
//   const rows = await saseBook({ funds: false }); // shares only
//
// Test: node -e 'import("./brokers/unibroker/saseBook.mjs").then(async (m) => { const r = await m.saseBook(); console.log(r.length, await m.saseLeftOut()) })'

import fs from "node:fs";

const FEED = "https://www.sase.ba/FeedServices/HandlerChart.ashx";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const CACHE = new URL("sase-cache.json", import.meta.url);
const CACHE_HOURS = 12;
export const EXCHANGE = "Sarajevo Stock Exchange";
export const MIC = "XSSE";
export const CURRENCY = "BAM";

// Segment of the list (English feed) -> board name and row type.
const KEPT = {
  "Official market - Companies": { board: "Official market (companies)", type: "STOCK" },
  "Official market - Funds": { board: "Official market (funds)", type: "FUND" },
  "Subsegment 1": { board: "Free market subsegment 1", type: "STOCK" },
  "Subsegment 2": { board: "Free market subsegment 2", type: "STOCK" },
  "Subsegment 3": { board: "Free market subsegment 3", type: "STOCK" },
};
const BANKRUPTCY_SEGMENT = "The Market for the issuers in the bankruptcy proceedings";
// "Treasury Bills" in the list are preference shares; their details decide.
const SHARE_TYPES = ["Shares", "Treasury Bills"];
const WOUND_UP = /\b(u )?(ste[cč]aj[ua]?|likvidacij[ia])\b|\b(bankruptcy|liquidation)\b/i;
const KIND = { "redovne dionice": "ordinary", "prioritetne dionice": "preference", "povlaštene dionice": "preference" };

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(form, accept) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(FEED, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: accept,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: "https://www.sase.ba/v1/",
        },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return await response.text();
      last = `type ${form.type} ${form.symbol || ""} answered ${response.status}`;
    } catch (error) {
      last = `type ${form.type} ${form.symbol || ""}: ${error.message || error}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(`Sarajevo: ${last}`);
}

// "/Date(1528149600000)/" -> "2018-06-04", or "" for no trade.
function dayOf(value) {
  const ms = Number((String(value ?? "").match(/-?\d+/) || [])[0]);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms + 12 * 3600_000).toISOString().slice(0, 10);
}

async function listed() {
  const lines = JSON.parse(await post({ type: 3, lng: 1 }, "application/json"));
  if (!Array.isArray(lines) || lines.length < 150) throw new Error(`the Sarajevo list has ${lines?.length} lines`);
  for (const line of lines) {
    if (!/^[A-Z0-9]{3,10}$/.test(line.Symbol || "") || !line.SymbolDescription || !line.Segment || !line.SymbolType || !line.SymbolStatus) {
      throw new Error(`an unreadable Sarajevo line: ${JSON.stringify(line).slice(0, 300)}`);
    }
  }
  return lines;
}

function xmlField(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : "";
}

async function details(symbol) {
  const xml = await post({ type: 37, symbol, lng: 1, Months: 1 }, "application/xml, text/xml");
  const found = xmlField(xml, "Symbol");
  if (found !== symbol) throw new Error(`the Sarajevo details of ${symbol} name ${found || "nothing"}`);
  return {
    isin: xmlField(xml, "ISIN").toUpperCase(),
    status: xmlField(xml, "StatusDescription"),
    kind: xmlField(xml, "SymbolTypeDesc"),
    tier: xmlField(xml, "TierDescription"),
  };
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
  const lines = await listed();
  const left = {};
  const drop = (reason, symbol) => {
    left[reason] = left[reason] || [];
    left[reason].push(symbol);
  };

  const shares = [];
  let loads = 1;
  for (const line of lines) {
    const symbol = line.Symbol;
    const name = String(line.SymbolDescription).replace(/\s+/g, " ").trim();
    if (line.SymbolType === "Bonds") {
      drop("bond", symbol);
      continue;
    }
    if (!SHARE_TYPES.includes(line.SymbolType)) throw new Error(`unknown Sarajevo security type "${line.SymbolType}" on ${symbol}`);
    if (line.Segment === BANKRUPTCY_SEGMENT) {
      drop("bankruptcy market", symbol);
      continue;
    }
    const segment = KEPT[line.Segment];
    if (!segment) throw new Error(`unknown Sarajevo segment "${line.Segment}" on ${symbol}`);
    if (line.SymbolStatus !== "Trading") {
      if (line.SymbolStatus !== "Suspended") throw new Error(`unknown Sarajevo status "${line.SymbolStatus}" on ${symbol}`);
      drop("suspended", symbol);
      continue;
    }
    if (WOUND_UP.test(name)) {
      drop("bankruptcy or liquidation", symbol);
      continue;
    }
    const lastTrade = dayOf(line.LastTradeDate);
    if (!lastTrade) {
      drop("never traded", symbol);
      continue;
    }

    await pause(600);
    loads += 1;
    const info = await details(symbol);
    if (!/^BA[A-Z0-9]{9}\d$/.test(info.isin)) throw new Error(`${symbol}: ISIN "${info.isin}"`);
    if (info.status !== "Trading") {
      if (!/suspend/i.test(info.status)) throw new Error(`${symbol}: status "${info.status}"`);
      drop("suspended", symbol);
      continue;
    }
    const kind = KIND[info.kind.toLowerCase()];
    if (!kind && line.SymbolType === "Treasury Bills") {
      drop("treasury bill", symbol);
      continue;
    }
    if (!kind) throw new Error(`unknown Sarajevo share kind "${info.kind}" on ${symbol}`);

    shares.push({
      query: info.isin,
      ticker: symbol,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: CURRENCY,
      type: segment.type,
      isin: info.isin,
      raw: [symbol, name, EXCHANGE, CURRENCY, segment.type, segment.board, kind, `last trade ${lastTrade}`].join(" "),
    });
  }

  const isins = new Set();
  for (const row of shares) {
    if (isins.has(row.isin)) throw new Error(`ISIN ${row.isin} on two Sarajevo lines`);
    isins.add(row.isin);
  }
  shares.sort((a, b) => a.ticker.localeCompare(b.ticker));
  if (shares.length < 100) throw new Error(`only ${shares.length} Sarajevo shares are open to trade`);
  for (const ticker of ["BHTSR", "JPESR", "BSNLR", "TCMKR", "ENISR"]) {
    if (!shares.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Sarajevo book`);
  }
  const bookAt = new Date().toISOString();
  const book = { shares, left, listed: lines.length };
  fs.writeFileSync(CACHE, JSON.stringify({ bookAt, book }, null, 1));
  return { ...book, bookAt, loads, fromCache: false };
}

// Every Sarajevo share open to trade, sorted by ticker. Rows are fresh
// objects; the caller stamps them (stampRows, withoutObligations) and
// writes its file. funds: false leaves out the closed-end funds (ZIF).
export async function saseBook({ funds = true, quiet = false } = {}) {
  const cache = readCache();
  let book;
  if (cache.book && cache.bookAt && Date.now() - Date.parse(cache.bookAt) < CACHE_HOURS * 3600_000) {
    book = { ...cache.book, bookAt: cache.bookAt, loads: 0, fromCache: true };
  } else {
    book = await readBook();
  }
  const rows = book.shares.filter((row) => funds || row.type !== "FUND").map((row) => ({ ...row }));
  if (!quiet) {
    const byBoard = {};
    for (const row of rows) {
      const board = Object.values(KEPT).find((segment) => row.raw.includes(` ${segment.board} `))?.board || "?";
      byBoard[board] = (byBoard[board] || 0) + 1;
    }
    console.error(
      `Sarajevo book: ${rows.length} lines of ${book.listed} listed (${Object.entries(byBoard).map(([board, n]) => `${n} ${board}`).join(", ")})` +
        `${book.fromCache ? ` from sase-cache.json (${book.bookAt})` : `, ${book.loads} requests`}; ` +
        `left out ${Object.entries(book.left).map(([reason, list]) => `${list.length} ${reason}`).join(", ")}`,
    );
  }
  return rows;
}

// The lines left out, { reason: [symbols] }, for a scraper that wants to
// print them.
export async function saseLeftOut() {
  if (!readCache().book) await saseBook({ quiet: true });
  return { ...readCache().book.left };
}
