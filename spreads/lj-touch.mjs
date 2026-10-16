// Ljubljana cash touch. Bid and ask are the exchange's own delayed book.
// A last trade is never written in their place. Continuous matching is
// 09:15–15:15 Ljubljana time. Auction-only names are a different method
// and are left out. The currency is the one the page names. A counter
// in another currency is kept even when no catalogue lists it.
//
// The reading is lj-touch.json. spread.mjs copies it into spread.json
// (`--only=lj-touch`).
//
//   node spreads/lj-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./lj-touch.json", import.meta.url));
const LIST = "https://ljse.si/json/TradingPriceList?lng=en&market_segment_ids=A,B,D,L,M,G,E,H,J,K,N,P,Q,O,R,S,T,C,F,I&type=ALL&model=ALL&date=&only_traded=0";
const PAGE = (isin) => `https://ljse.si/en/papir-311/310?isin=${encodeURIComponent(isin)}`;
const LJ = new Set(["ljse", "xlju", "ljubljana", "ljubljanskaborza", "ljubljanastockexchange"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC"]);
const LISTS = ["../assets/stocks.csv", "../assets/etfs.csv"].map((name) => fileURLToPath(new URL(name, import.meta.url)));

const ljubljana = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Ljubljana",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(when)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    weekday: parts.weekday,
    day: ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday),
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

const inSession = (at) => at?.day && at.minutes >= 9 * 60 + 15 && at.minutes < 15 * 60 + 15;

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

const validIsin = (isin) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin);

function objectAt(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  let i = start + marker.length;
  if (html[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < html.length; j += 1) {
    const ch = html[j];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function listings() {
  const jobs = new Map();
  const add = (isin, symbol) => {
    const code = String(isin || "").trim().toUpperCase();
    if (!validIsin(code) || jobs.has(code)) return;
    jobs.set(code, { isin: code, symbol: String(symbol || "").trim().toUpperCase() });
  };
  const response = await fetch(LIST, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  if (!response.ok) throw new Error(`liste Ljubljana ${response.status}`);
  const data = await response.json();
  if (data.IsHolidayOrWeekend || data.market_data_date !== ljubljana().date) {
    throw new Error(`liste hors séance (${data.market_data_date || "sans date"})`);
  }
  for (const block of data.priceList || []) {
    for (const row of block.tradingPriceList?.rows || []) {
      if (row.security_class_id === "DEBT") continue;
      add(row.isin, row.symbol);
    }
  }
  for (const row of catalogueRows()) {
    if (!LJ.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    add(row.isin, row.ticker);
  }
  for (const file of LISTS) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n").slice(1)) {
      const [ticker, exchange, isin] = line.split(",");
      if (!LJ.has(norm(exchange))) continue;
      add(isin, String(ticker || "").split(":").pop());
    }
  }
  return [...jobs.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.isin.localeCompare(b.isin));
}

async function readPage(job) {
  const response = await fetch(PAGE(job.isin), { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) return { job, error: response.status };
  const book = objectAt(await response.text(), "this.WebMarketData = ");
  return { job, book };
}

async function mapPool(items, width, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return out;
}

const now = ljubljana();
if (!now.day || !inSession(now)) {
  console.error(`hors séance, Ljubljana ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

console.error(`Ljubljana ${now.clock}. Liste officielle et catalogues…`);
const jobs = await listings();
console.error(`${jobs.length} ISINs.`);
const pages = await mapPool(jobs, 4, readPage);
const found = [];
let auction = 0;
let stale = 0;
let noTouch = 0;
let failed = 0;
for (const page of pages) {
  if (!page?.book) {
    failed += 1;
    continue;
  }
  const book = page.book;
  if (book.trading_model_id !== "CT" || book.trading_phase_code !== "TRADE") {
    auction += 1;
    continue;
  }
  const stamp = Date.parse(book.update_time);
  if (!Number.isFinite(stamp)) {
    stale += 1;
    continue;
  }
  const at = ljubljana(new Date(stamp));
  if (at.date !== now.date || !inSession(at)) {
    stale += 1;
    continue;
  }
  const currency = String(book.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    noTouch += 1;
    continue;
  }
  const top = book.orderbook?.[0] || {};
  const bid = Number(top.bid_price);
  const ask = Number(top.ask_price);
  const bp = bpFrom(bid, ask);
  if (bp == null) {
    noTouch += 1;
    continue;
  }
  found.push({
    isin: page.job.isin,
    mic: "XLJU",
    code: book.symbol || page.job.symbol,
    currency,
    bid,
    ask,
    bp,
    stamp: `${at.date} ${at.clock}`,
    url: PAGE(page.job.isin),
  });
}
found.sort((a, b) => a.code.localeCompare(b.code) || a.currency.localeCompare(b.currency));
if (!found.length) {
  console.error(`aucune touche du continu. Ljubljana ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}
fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: now.date, clock: now.clock, rows: found, auction, stale, noTouch, failed }, null, 2)
);
const currencies = found.reduce((map, row) => map.set(row.currency, (map.get(row.currency) || 0) + 1), new Map());
console.error(
  `${found.length} touches (${[...currencies].map(([ccy, n]) => `${n} ${ccy}`).join(", ")}), ${auction} hors continu, ${stale} hors séance, ${noTouch} sans bid et ask, ${failed} pages vides. Ljubljana ${ljubljana().clock}.`
);
