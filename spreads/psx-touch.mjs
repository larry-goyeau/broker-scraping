// Pakistan Stock Exchange cash touch. Bid and ask are the quote
// TradingView streams for the PSX book. A last trade is never written
// in their place. The board quotes rupees. A catalogue line in another
// currency is the same book when the name has no second currency here,
// so that ratio is stored too, and the rupee line is stored even when
// no broker files it.
//
// Continuous trading is 09:32–15:30 Karachi, Monday to Thursday. Outside
// that window nothing is written. The reading is psx-touch.json.
// spread.mjs copies it into spread.json (`--only=psx-touch`).
//
//   node spreads/psx-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./psx-touch.json", import.meta.url));
const PAGE = "https://www.tradingview.com/symbols/PSX-";
const PSX = new Set(["psx", "xkar", "karachi", "pakistan", "pakistanstockexchange"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC", "REIT", "FUND"]);
const FIELDS = ["lp", "lp_time", "bid", "ask", "open_time", "isin", "exchange", "currency_code"];

const karachi = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
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
    day: ["Mon", "Tue", "Wed", "Thu"].includes(parts.weekday),
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

const stampOf = (unix) => {
  const raw = Number(unix);
  if (!(raw > 0)) return null;
  const at = new Date(raw * 1000);
  if (at.getUTCHours() === 0 && at.getUTCMinutes() === 0) return null;
  return karachi(at);
};

const inCash = (minutes) => minutes >= 9 * 60 + 32 && minutes < 15 * 60 + 30;
const canRead = (at) => at?.day && inCash(at.minutes);

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function listings() {
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!PSX.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const code = String(row.ticker || "").trim().toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z0-9.]{1,16}$/.test(code) || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const job = byCode.get(code) || { code, isins: new Map() };
    const currencies = job.isins.get(isin) || new Set();
    if (/^[A-Z]{3}$/.test(currency)) currencies.add(currency);
    job.isins.set(isin, currencies);
    byCode.set(code, job);
  }
  const jobs = [];
  let tied = 0;
  for (const job of byCode.values()) {
    if (job.isins.size !== 1) {
      tied += 1;
      continue;
    }
    const [isin, currencies] = [...job.isins.entries()][0];
    jobs.push({ code: job.code, isin, currencies });
  }
  jobs.sort((a, b) => a.code.localeCompare(b.code));
  return { jobs, tied };
}

const pack = (obj) => {
  const text = JSON.stringify(obj);
  return `~m~${text.length}~m~${text}`;
};

function parse(raw) {
  const out = [];
  let i = 0;
  while (i < raw.length) {
    if (!raw.startsWith("~m~", i)) break;
    i += 3;
    const end = raw.indexOf("~m~", i);
    if (end < 0) break;
    const len = Number(raw.slice(i, end));
    i = end + 3;
    const body = raw.slice(i, i + len);
    if (body.startsWith("~h~")) out.push({ heartbeat: body });
    else {
      try {
        out.push(JSON.parse(body));
      } catch {
        out.push(null);
      }
    }
  }
  return out;
}

function quote(jobs) {
  const quotes = new Map();
  const session = `qs_${Math.random().toString(36).slice(2, 14)}`;
  const ws = new WebSocket("wss://data.tradingview.com/socket.io/websocket", {
    headers: { Origin: "https://www.tradingview.com" },
  });
  return new Promise((resolve) => {
    const hard = setTimeout(() => ws.close(), 40000);
    let quiet = null;
    const finish = () => {
      clearTimeout(hard);
      clearTimeout(quiet);
      resolve(quotes);
    };
    const bump = () => {
      clearTimeout(quiet);
      quiet = setTimeout(() => ws.close(), 10000);
    };
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      ws.send(pack({ m: "quote_add_symbols", p: [session, ...jobs.map((job) => `PSX:${job.code}`)] }));
      bump();
    });
    ws.addEventListener("message", (ev) => {
      for (const msg of parse(String(ev.data))) {
        if (!msg) continue;
        if (msg.heartbeat) {
          ws.send(`~m~${msg.heartbeat.length}~m~${msg.heartbeat}`);
          continue;
        }
        if (msg.m !== "qsd") continue;
        const payload = msg.p?.[1];
        const name = payload?.n;
        if (!name) continue;
        if (payload.s === "error") quotes.set(name, { ...(quotes.get(name) || {}), error: payload.errmsg || "error" });
        else quotes.set(name, { ...(quotes.get(name) || {}), ...(payload.v || {}) });
        bump();
      }
    });
    ws.addEventListener("error", finish);
    ws.addEventListener("close", finish);
  });
}

const now = karachi();
if (!canRead(now)) {
  console.error(`hors séance, Karachi ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const { jobs, tied } = listings();
console.error(`Karachi ${now.clock}. ${jobs.length} codes, ${tied} codes à ISIN partagé laissés de côté.`);
if (!jobs.length) {
  console.error("aucun code du catalogue. Rien n'est écrit.");
  process.exit(1);
}

const quotes = await quote(jobs);
const found = [];
let noBook = 0;
let stale = 0;
let mismatch = 0;
let missing = 0;
for (const job of jobs) {
  const row = quotes.get(`PSX:${job.code}`);
  if (!row || row.error) {
    missing += 1;
    continue;
  }
  if (row.isin && String(row.isin).toUpperCase() !== job.isin) {
    mismatch += 1;
    continue;
  }
  const bid = Number(row.bid);
  const ask = Number(row.ask);
  const bp = bpFrom(bid, ask);
  if (bp == null) {
    noBook += 1;
    continue;
  }
  const stamped = stampOf(row.lp_time) || stampOf(row.open_time);
  if (stamped && (stamped.date !== now.date || !inCash(stamped.minutes))) {
    stale += 1;
    continue;
  }
  if (!stamped && !canRead(now)) {
    stale += 1;
    continue;
  }
  const book = String(row.currency_code || "PKR").toUpperCase();
  const when = stamped && stamped.date === now.date ? stamped : now;
  found.push({
    isin: job.isin,
    mic: "XKAR",
    code: job.code,
    bid,
    ask,
    ...(Number(row.lp) > 0 ? { last: Number(row.lp) } : {}),
    bp,
    currencies: [...new Set([book, ...job.currencies])].sort(),
    stamp: `${when.date} ${when.clock}`,
    url: `${PAGE}${encodeURIComponent(job.code)}/`,
  });
}

if (!found.length) {
  console.error(`aucune touche. ${stale} hors séance, ${noBook} sans deux côtés, ${mismatch} ISIN en désaccord, ${missing} absents.`);
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: now.date, clock: now.clock, delayed: true, rows: found, noBook, stale, mismatch, missing, tied }, null, 2)
);
console.error(`${STORE} : ${found.length} touches. ${noBook} sans deux côtés, ${stale} hors séance, ${mismatch} ISIN en désaccord, ${missing} absents.`);
