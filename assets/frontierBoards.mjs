// The session close of boards no price vendor carries, each read from the
// exchange's own public page or API, at any hour and without a key. Read by
// `prices.mjs`, which stays the only writer of `prices.json`: a board here
// only answers ISIN → { ticker, currency, price, at }.
//
// Each board is one or a few requests for every line at once, so the first
// ISIN asked pays for the whole board and the others are read from memory.
//
//   Lao Securities Exchange   LAK  lsx.com.la api-server, daily closing price per ISIN
//   Cambodia Securities Exch. KHR  csx.com.kh trade summary, one POST for the board
//   Yangon Stock Exchange     MMK  ysx-mm.com "stock trading data" pages (main and
//                                  pre-listing boards), as of the date printed on them
//   Nairobi Securities Exch.  KES  the NSE's ticker API, the official day price
//   Jamaica Stock Exchange    JMD  jamstockex.com trade quotes, closing price
//   Bourse de Tunis           TND  bvmt.com.tn market API, last price by ISIN
//   Casablanca Stock Exchange MAD  CDG Capital Bourse market summary
//   Nepal Stock Exchange      NPR  chukul.com market summary, then history per line
//   Tehran and Fara Bourse    IRR  cmsalmas.ir board (official close by ISIN)
//   Victoria Falls (VFEX)     USD  the exchange's price sheet
//   Captin (HZPC)             EUR  the issuer page's newest trade
//
// A board that cannot be read throws, and the caller tries again later.

import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const TTL = 30 * 60 * 1000;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const num = (text) => {
  const v = Number(String(text ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const ymd = (s) => (/^\d{8}$/.test(String(s)) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

async function get(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...(init.headers || {}) },
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

// The ISINs one broker's catalogue names on this board, by ticker.
function catalogue(folder) {
  const file = new URL(`../brokers/${folder}/${folder}-parsed.json`, import.meta.url);
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return (Array.isArray(parsed) ? parsed : parsed.rows || []).filter((r) => ISIN.test(String(r.isin || "")));
}

// ------------------------------------------------------------------- Laos
// /api/stock/trading has every line in one call but its TPrice is the
// intraday last and can miss the closing trades (LAT 970 there, 925 at the
// close on 2026-10-22). The daily closing price is the official close, one
// call per ISIN: the newest row, CPrice in whole kip, ODate its day. A row
// is written every session, carrying the close when nothing traded.
async function laos() {
  const rows = new Map();
  const today = new Date();
  const from = new Date(today.getTime() - 20 * 86400_000);
  const day = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  for (const row of catalogue("bcelkt")) {
    const url =
      `http://lsx.com.la/api-server/api/stock/daily-closing-price?ICode=${row.isin}` +
      `&fromDate=${day(from)}&toDate=${day(today)}`;
    const data = (await (await get(url, { headers: { Accept: "application/json" } })).json())?.data || [];
    const last = data.filter((r) => num(r.CPrice)).sort((a, b) => String(b.ODate).localeCompare(String(a.ODate)))[0];
    if (last) rows.set(row.isin, { ticker: row.ticker, currency: "LAK", price: num(last.CPrice), at: ymd(last.ODate) });
    await new Promise((done) => setTimeout(done, 300));
  }
  return rows;
}

// --------------------------------------------------------------- Cambodia
// One POST for the latest session: `close` in riel with thousands commas,
// `icode` the ISIN, `fromDate` the session.
async function cambodia() {
  const response = await get("https://csx.com.kh/api/v1/website/market-data/stock/trade-summary?lang=en", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ board: "all", fromDate: null }),
  });
  const data = (await response.json())?.data || {};
  const at = ymd(data.fromDate);
  const rows = new Map();
  for (const line of data.auctionTradingMethod || []) {
    const isin = String(line.icode || "").toUpperCase();
    const price = num(line.close);
    if (ISIN.test(isin) && price) rows.set(isin, { ticker: line.stock, currency: "KHR", price, at });
  }
  return rows;
}

// ---------------------------------------------------------------- Myanmar
// Two server-rendered pages, main board and pre-listing board. A price row
// has 12 cells and a five-digit stock code in the second: name, code, close,
// change, % change, open, high, low, volume, value, listed shares, market
// cap. Close is whole kyat with commas. The block-trading rows below have 10
// cells. The page's date is "As of 22nd Oct. 2026". The ticker joins to the
// catalogue's ISIN.
const YSX_PAGES = [
  "https://ysx-mm.com/main-board/mktdata/stocktradingdata/",
  "https://ysx-mm.com/pre-listing-board/marketdata/stock-trading-data/",
];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

async function myanmar() {
  const byTicker = new Map(catalogue("cbsecurities").map((r) => [String(r.ticker).toUpperCase(), r.isin]));
  const rows = new Map();
  for (const url of YSX_PAGES) {
    const html = await (await get(url, { headers: { Accept: "text/html" } })).text();
    const dated = html.match(/As of\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
    const at = dated && MONTHS[dated[2].toLowerCase()]
      ? `${dated[3]}-${String(MONTHS[dated[2].toLowerCase()]).padStart(2, "0")}-${dated[1].padStart(2, "0")}`
      : null;
    for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
      if (cells.length !== 12 || !/^\d{5}$/.test(cells[1])) continue;
      const isin = byTicker.get(cells[0].toUpperCase());
      const price = num(cells[2]);
      if (isin && price && !rows.has(isin)) rows.set(isin, { ticker: cells[0], currency: "MMK", price, at });
    }
  }
  return rows;
}

// ------------------------------------------------------------------ Kenya
// The NSE's own ticker API, the one its share-price page embeds. `price` is
// the official day price of the Daily Price List (the session's VWAP; a line
// with no trade carries its previous price), in units. It is intraday while
// the market is open, so the date is the API's and the leaf is replaced on
// the next read. The issuer list repeats some codes (the KPLC prefs reuse
// "KPLC", a dead second CRWN or SLAM is null): the first priced entry is the
// share. ALP and TRFC trade in US dollars. The myStocks board's "latest" is
// not used: on 2026-10-22 it differed from the official price on 32 of 61
// lines (BOC 179.75 against 186).
const NSE_TICKER = "https://nsenairobi.nse.co.ke/nseticker/api/v1/ticker";
const NSE_USD = new Set(["ALP", "TRFC"]);

async function kenya() {
  const response = await get(NSE_TICKER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.nse.co.ke",
      Referer: "https://www.nse.co.ke/",
    },
    // The NSE Plc ISIN its own widget passes.
    body: JSON.stringify({ nopage: "true", isinno: "KE3000009674" }),
  });
  const message = (await response.json())?.message || [];
  const snapshot = message.find((m) => Array.isArray(m?.snapshot))?.snapshot || [];
  const dated = String(message.find((m) => m?.updated_at)?.updated_at?.date || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const at = dated ? `${dated[3]}-${dated[2]}-${dated[1]}` : null;
  const byTicker = new Map();
  for (const r of catalogue("abccapital")) byTicker.set(String(r.ticker).toUpperCase(), r.isin);
  const rows = new Map();
  const seen = new Set();
  for (const line of snapshot) {
    const code = String(line.issuer || "").trim().toUpperCase();
    const price = num(line.price);
    if (!code || !price || seen.has(code)) continue;
    seen.add(code);
    const isin = byTicker.get(code);
    if (isin) rows.set(isin, { ticker: code, currency: NSE_USD.has(code) ? "USD" : "KES", price, at });
  }
  return rows;
}

// ---------------------------------------------------------------- Jamaica
// The JSE's trade-quotes pages, one per market: Main (JMD), Junior (JMD) and
// USD. Columns: last traded, closing price, change, closing bid, closing ask,
// volume… The closing price is kept, in units. `dateInput` is the session
// shown, the last one completed. Each table is printed twice (phone and
// desktop layouts). Seven tickers trade in both currencies, so the key is
// ticker and currency.
const JSE_MARKETS = [
  { id: 31, currency: "JMD" },
  { id: 22, currency: "JMD" },
  { id: 49, currency: "USD" },
];
const strip = (s) => String(s).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function jamaica() {
  const byKey = new Map();
  for (const folder of ["gkcapital", "jnfund", "ncbcm"]) {
    for (const r of catalogue(folder)) byKey.set(`${String(r.ticker).toUpperCase()}|${r.currency}`, r.isin);
  }
  const rows = new Map();
  for (const market of JSE_MARKETS) {
    const html = await (await get(`https://www.jamstockex.com/trading/trade-quotes/?market=${market.id}`, { headers: { Accept: "text/html" } })).text();
    const at = (html.match(/id=['"]dateInput['"]\s*value=["'](\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    const parts = html.split(/<h3[^>]*>([^<]*)<\/h3>/);
    for (let i = 1; i < parts.length; i += 2) {
      if (!/^(ORDINARY|US DENOMINATED|PREFERENCE) SHARES/.test(parts[i].trim())) continue;
      for (const tr of parts[i + 1].match(/<tr[\s\S]*?<\/tr>/gi) || []) {
        const link = tr.match(/instrument=\d+"[^>]*>\s*([^<]*?)\s*<\/a>/);
        if (!link) continue;
        const symbol = link[1].toUpperCase();
        const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => strip(c[1]));
        const at0 = cells.findIndex((c) => c.toUpperCase().startsWith(symbol));
        const price = at0 >= 0 ? num(cells[at0 + 2]) : null;
        const isin = byKey.get(`${symbol}|${market.currency}`);
        if (isin && price && !rows.has(isin)) rows.set(isin, { ticker: symbol, currency: market.currency, price, at });
      }
    }
  }
  return rows;
}

// ------------------------------------------------------------------ Tunis
// The Bourse de Tunis market API: `last` is the session's last price (the
// previous close when nothing traded), in dinars, keyed by ISIN; `seance` is
// the session in French ("22 oct. 2026"). `change`, `volume` and `open` are
// not reliable and are not read.
const FR_MONTHS = { janv: 1, "févr": 2, fevr: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, "août": 8, aout: 8, sept: 9, oct: 10, nov: 11, "déc": 12, dec: 12 };

async function tunis() {
  const data = await (await get("https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99", { headers: { Accept: "application/json" } })).json();
  const rows = new Map();
  for (const line of data?.markets || []) {
    const isin = String(line.isin || line.referentiel?.isin || "").toUpperCase();
    const price = num(line.last) || num(line.close);
    const d = String(line.seance || "").match(/(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{4})/i);
    const month = d && FR_MONTHS[d[2].toLowerCase()];
    const at = month ? `${d[3]}-${String(month).padStart(2, "0")}-${d[1].padStart(2, "0")}` : null;
    if (ISIN.test(isin) && price) rows.set(isin, { ticker: line.referentiel?.ticker || isin, currency: "TND", price, at });
  }
  return rows;
}

// ------------------------------------------------------------- Casablanca
// CDG Capital Bourse's market summary, every share in one POST: `Cours` and
// `DateDernierCours` when the line traded this session, else
// `CoursDeReferance`, the previous close. That close is dated by one more
// call, the session history of one share (the newest session before today).
// Symbols join to ISINs through the CDG catalogue.
const CDG_API = "https://www.cdgcapitalbourse.ma/api/";
const cdgCall = async (name, params) => {
  const body = {
    ACTIONS: [
      {
        ACTION: { NAME: name, TYPE: "SELECT", VALUE: name },
        PARAMS: Object.entries(params).map(([k, [type, value]]) => ({ NAME: k, TYPE: type, VALUE: value })),
      },
    ],
  };
  const out = await (await get(CDG_API, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) })).json();
  const res = out?.[0]?.[name];
  if (!res?.Valid) throw new Error(`${name} refusé`);
  return res.Data || [];
};
const dmy = (s) => {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

async function casablanca() {
  const lines = await cdgCall("MARKET-RESUME", {
    Lang_: ["S", "fr"],
    Espace_: ["I", "1"],
    IdPartener_: ["I", "1"],
    TypeStocks_: ["S", "1"],
    TypeCotation_: ["S", ""],
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
  let refDay = null;
  if (lines.some((l) => !num(l.Cours))) {
    const sessions = await cdgCall("VALEUR-SESSIONS", { Lang_: ["S", "fr"], Espace_: ["I", "1"], Symbol_: ["S", "ADH"], Top_: ["I", "5"] });
    refDay = sessions.map((s) => dmy(s.DateCours)).filter((d) => d && d < today).sort().at(-1) || null;
  }
  const byTicker = new Map(catalogue("cdgcapital").map((r) => [String(r.ticker).toUpperCase(), r.isin]));
  const rows = new Map();
  for (const line of lines) {
    const isin = byTicker.get(String(line.Symbol || "").toUpperCase());
    if (!isin) continue;
    const traded = num(line.Cours);
    const price = traded || num(line.CoursDeReferance);
    if (price) rows.set(isin, { ticker: line.Symbol, currency: "MAD", price, at: traded ? dmy(line.DateDernierCours) : refDay });
  }
  return rows;
}

// ------------------------------------------------------------------ Nepal
// NEPSE's own API needs a signed header that only a browser computes, so
// the close comes from chukul.com: one summary of the last session (`close`
// in rupees, `date` the session), then each catalogue line that did not
// trade is read from its own history (newest row). Those histories are kept
// half a day; promoter lines that never traded have none.
const CHUKUL = "https://chukul.com/api/data";
const histories = new Map();

async function nepal() {
  const summary = await (await get(`${CHUKUL}/v2/market-summary/`, { headers: { Accept: "application/json" } })).json();
  const byTicker = new Map();
  for (const folder of ["siprabi", "sunsecurities"]) {
    for (const r of catalogue(folder)) byTicker.set(String(r.ticker).toUpperCase(), r.isin);
  }
  const rows = new Map();
  for (const line of Array.isArray(summary) ? summary : []) {
    const ticker = String(line.symbol || "").toUpperCase();
    const isin = byTicker.get(ticker);
    const price = num(line.close);
    if (isin && price) rows.set(isin, { ticker, currency: "NPR", price, at: line.date || null });
  }
  for (const [ticker, isin] of byTicker) {
    if (rows.has(isin)) continue;
    let hit = histories.get(ticker);
    if (!hit || Date.now() - hit.at > 12 * 3600_000) {
      try {
        const data = await (await get(`${CHUKUL}/historydata/?symbol=${encodeURIComponent(ticker)}`, { headers: { Accept: "application/json" } })).json();
        const last = (Array.isArray(data) ? data : []).filter((r) => num(r.close)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
        hit = { at: Date.now(), row: last ? { ticker, currency: "NPR", price: num(last.close), at: last.date || null } : null };
        histories.set(ticker, hit);
      } catch {
        continue;
      }
      await new Promise((done) => setTimeout(done, 150));
    }
    if (hit.row) rows.set(isin, hit.row);
  }
  return rows;
}

// ------------------------------------------------------------------- Iran
// tsetmc.com does not answer from abroad. The Almas board the Farda live
// board reads lists every TSE and Fara Bourse title by ISIN with its
// official close (`closing_price`, rials). It prints no date: the session is
// read from one Rahavard 365 asset (Foolad), its last trade's day.
async function iran() {
  const data = await (
    await get("https://www.cmsalmas.ir/all_data", { headers: { Accept: "application/json", Referer: "https://fardabroker.ir/mliveboard" } })
  ).json();
  let at = null;
  try {
    const asset = await (await get("https://rahavard365.com/api/v2/asset/453", { headers: { Accept: "application/json" } })).json();
    at = String(asset?.data?.last_trade?.end_date_time || "").slice(0, 10) || null;
  } catch {
    at = null;
  }
  const rows = new Map();
  for (const line of Array.isArray(data) ? data : data?.data || []) {
    const isin = String(line.isin || "").trim().toUpperCase();
    const price = num(line.closing_price) || num(line.last_traded_price);
    if (ISIN.test(isin) && price) rows.set(isin, { ticker: line.symbol_fa || isin, currency: "IRR", price, at });
  }
  return rows;
}

// ------------------------------------------------------------------- VFEX
// The exchange's price sheet: `closePrice` is the session close in dollars
// (not cents, unlike the ZSE sheet), `statsDate` its day, keyed by ISIN. The
// VOMS sheet's `closingPrice` is the previous close and is not read. A close
// more than twice or less than half the last trade is taken as a typo and
// the last trade is kept (WPHL printed 14 against 2.8405 on 2026-10-22).
async function vfex() {
  const data = await (
    await get("https://ds88jcmqc11je.cloudfront.net/api/fetch/price-sheet?exchange=VFEX", { headers: { Accept: "application/json" } })
  ).json();
  const tickers = new Map(catalogue("vfexdirect").map((r) => [r.isin, r.ticker]));
  const rows = new Map();
  for (const line of data?.data || []) {
    const isin = String(line.isin || "").trim().toUpperCase();
    const close = num(line.closePrice);
    const last = num(line.lastTransPrice);
    const price = close && last && (close > 2 * last || close < last / 2) ? last : close || last;
    const d = Array.isArray(line.statsDate) ? line.statsDate : [];
    const at = d.length === 3 ? `${d[0]}-${String(d[1]).padStart(2, "0")}-${String(d[2]).padStart(2, "0")}` : null;
    if (ISIN.test(isin) && price) rows.set(isin, { ticker: tickers.get(isin) || isin, currency: "USD", price, at });
  }
  return rows;
}

// ----------------------------------------------------------------- Captin
// Captin trades HZPC certificates in periodic rounds and prints every trade
// on the issuer page: "DD-MM-YYYY | hh:mm:ss", price "€87,70", quantity,
// id. The newest trade is the price, months old between rounds. Cloudflare
// refuses HTTP/2 clients here, so the page is read with curl over HTTP/1.1.
const CAPTIN_PAGES = { NL0015000VZ2: "https://captin.com/listings/hzpc/" };

async function captin() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  const rows = new Map();
  for (const [isin, url] of Object.entries(CAPTIN_PAGES)) {
    const { stdout } = await exec("curl", ["-fsSL", "--http1.1", "--max-time", "45", "-A", UA, url], { maxBuffer: 20_000_000 });
    let best = null;
    for (const m of stdout.matchAll(/<li>(\d{2})-(\d{2})-(\d{4})\s*\|\s*(\d{2}:\d{2}:\d{2})<\/li>\s*<li>€\s*([\d.]+,\d+|[\d.]+)<\/li>/g)) {
      const when = `${m[3]}-${m[2]}-${m[1]}T${m[4]}`;
      const price = num(m[5].replace(/\./g, "").replace(",", "."));
      if (price && (!best || when > best.when)) best = { when, price };
    }
    if (best) rows.set(isin, { ticker: "HZPC", currency: "EUR", price: best.price, at: best.when.slice(0, 10) });
  }
  return rows;
}

// ------------------------------------------------------------------ table
// `folders` are the catalogues that list the board: an ISIN is sent to a
// board only when one of them names it, whatever its country code (Umeme
// and the Caribbean cross-listings carry other countries' ISINs).
export const BOARDS = {
  XLAO: { folders: ["bcelkt"], read: laos },
  XCSX: { folders: ["canadia"], read: cambodia },
  YSX: { folders: ["cbsecurities"], read: myanmar },
  XNAI: { folders: ["abccapital", "aibaxys", "faida", "kingdomsecurities"], read: kenya },
  XJAM: { folders: ["gkcapital", "jnfund", "ncbcm"], read: jamaica },
  XTUN: { folders: ["attijaritn", "btkconseil", "tunisievaleurs"], read: tunis },
  XCAS: { folders: ["cdgcapital"], read: casablanca },
  XNEP: { folders: ["siprabi", "sunsecurities"], read: nepal },
  XTEH: { folders: ["tosee"], read: iran },
  VFEX: { folders: ["vfexdirect"], read: vfex },
  CPTX: { folders: ["captin"], read: captin },
};

const cache = new Map();

// The board's rows, read at most once per half hour.
export function boardRows(mic) {
  const hit = cache.get(mic);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  const rows = BOARDS[mic].read();
  cache.set(mic, { at: Date.now(), rows });
  rows.catch(() => cache.delete(mic));
  return rows;
}

let index = null;

// The boards an ISIN can be on.
export function boardsFor(isin) {
  if (!index) {
    index = new Map();
    for (const [mic, board] of Object.entries(BOARDS)) {
      for (const folder of board.folders) {
        for (const row of catalogue(folder)) {
          const set = index.get(row.isin) || new Set();
          set.add(mic);
          index.set(row.isin, set);
        }
      }
    }
  }
  return [...(index.get(String(isin || "").toUpperCase()) || [])];
}
