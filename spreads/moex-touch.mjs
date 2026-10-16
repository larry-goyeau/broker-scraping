// Moscow Exchange cash touch. Bid and ask are the exchange's own
// anonymous book. A last trade is never written in their place. The
// main board (TQBR) is rubles; MOEX codes that currency SUR. The odd-lot
// board is a different book and is not written here. A name that also
// trades in dollars, yuan or euros on the multicurrency board keeps
// that book too, even when no broker files the currency. An empty
// side is left out.
//
// Continuous trading is 10:00–18:45 Moscow. Outside that window nothing
// is written. The reading is moex-touch.json. spread.mjs copies it
// into spread.json (`--only=moex-touch`).
//
//   node spreads/moex-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./moex-touch.json", import.meta.url));
const MOEX = new Set(["moex", "misx", "moscow", "moscowexchange"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC", "REIT", "FUND"]);
const CCY = { SUR: "RUB", RUB: "RUB", USD: "USD", EUR: "EUR", CNY: "CNY", HKD: "HKD" };

const moscow = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
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

const canRead = (at) => at?.day && at.minutes >= 10 * 60 && at.minutes < 18 * 60 + 45;

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function wanted() {
  const isins = new Set();
  for (const row of catalogueRows()) {
    if (!MOEX.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) isins.add(isin);
  }
  return isins;
}

async function board(market, id) {
  const url = `https://iss.moex.com/iss/engines/stock/markets/${market}/boards/${id}/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,ISIN,CURRENCYID&marketdata.columns=SECID,BID,OFFER,LAST,TRADINGSTATUS`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${id} a répondu ${response.status}`);
  const data = await response.json();
  const sc = data.securities.columns;
  const mc = data.marketdata.columns;
  const sec = new Map();
  for (const row of data.securities.data) {
    const rec = Object.fromEntries(sc.map((key, i) => [key, row[i]]));
    sec.set(rec.SECID, rec);
  }
  const books = [];
  for (const row of data.marketdata.data) {
    const rec = Object.fromEntries(mc.map((key, i) => [key, row[i]]));
    const info = sec.get(rec.SECID);
    if (!info) continue;
    books.push({ ...info, ...rec });
  }
  return books;
}

const now = moscow();
if (!canRead(now)) {
  console.error(`hors séance, Moscou ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const isins = wanted();
console.error(`Moscou ${now.clock}. ${isins.size} ISIN du catalogue.`);
if (!isins.size) {
  console.error("aucun ISIN du catalogue. Rien n'est écrit.");
  process.exit(1);
}

const main = await board("shares", "TQBR");
const found = [];
let noBook = 0;
let absent = 0;
const seen = new Set();

function push(row, currency, boardId) {
  const isin = String(row.ISIN || "").toUpperCase();
  if (!isins.has(isin)) return;
  const key = `${isin}|${currency}`;
  if (seen.has(key)) return;
  if (row.TRADINGSTATUS && row.TRADINGSTATUS !== "T") return;
  const bid = Number(row.BID);
  const ask = Number(row.OFFER);
  const bp = bpFrom(bid, ask);
  if (bp == null) return false;
  seen.add(key);
  const last = Number(row.LAST);
  found.push({
    isin,
    mic: "MISX",
    code: row.SECID,
    bid,
    ask,
    ...(last > 0 ? { last } : {}),
    bp,
    currencies: [currency],
    board: boardId,
    stamp: `${now.date} ${now.clock}`,
    url: `https://www.moex.com/en/issue.aspx?board=${boardId}&code=${encodeURIComponent(row.SECID)}`,
  });
  return true;
}

const onMain = new Set();
for (const row of main) {
  const currency = CCY[String(row.CURRENCYID || "").toUpperCase()] || "";
  if (currency !== "RUB") continue;
  const isin = String(row.ISIN || "").toUpperCase();
  if (!isins.has(isin)) continue;
  onMain.add(isin);
  if (push(row, "RUB", "TQBR") === false) noBook += 1;
}
for (const isin of isins) if (!onMain.has(isin)) absent += 1;

// A second currency of the same ISIN. The ruble book is not copied onto it.
for (const id of ["LIQB", "CIQB"]) {
  let rows = [];
  try {
    rows = await board("mamc", id);
  } catch (error) {
    console.error(`    ${id} : ${error.message}`);
    continue;
  }
  for (const row of rows) {
    const raw = String(row.CURRENCYID || "").toUpperCase();
    const currency = CCY[raw] || "";
    if (!currency || currency === "RUB") continue;
    push(row, currency, id);
  }
}

found.sort((a, b) => a.code.localeCompare(b.code) || a.currencies[0].localeCompare(b.currencies[0]));
if (!found.length) {
  console.error(`aucune touche. ${noBook} sans deux côtés, ${absent} absents du tableau principal.`);
  process.exit(1);
}

const by = {};
for (const row of found) by[row.currencies[0]] = (by[row.currencies[0]] || 0) + 1;
fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: now.date, clock: now.clock, rows: found, noBook, absent }, null, 2)
);
console.error(
  `${STORE} : ${found.length} touches (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(", ")}). ${noBook} sans deux côtés, ${absent} absents du tableau principal.`
);
