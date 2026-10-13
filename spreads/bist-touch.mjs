// Borsa Istanbul cash touch. Bid and ask are the quote TradingView
// streams for the BIST book. A last trade is never written in their
// place. The feed also keeps a board from a previous session, so a quote
// is kept only when today's open or last trade falls inside continuous
// trading, 10:00–18:00 Istanbul. The exchange sells the top of book.
//
// The clock may be twenty minutes past 18:00, which is how a delayed
// board from that session still gets filed. Outside that window nothing
// is written. The reading is bist-touch.json. spread.mjs copies it into
// spread.json (`--only=bist-touch`).
//
//   node spreads/bist-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./bist-touch.json", import.meta.url));
const PAGE = "https://www.tradingview.com/symbols/BIST-";
const BIST = new Set(["bist", "xist", "istanbul", "istanbulstockexchange", "borsaistanbul"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC", "REIT"]);
const FIELDS = ["lp", "lp_time", "bid", "ask", "open_time", "isin", "exchange", "currency_code"];

const istanbul = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
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

const fromUnix = (unix) => istanbul(new Date(Number(unix) * 1000));

const canRead = (at) => at?.day && at.minutes >= 10 * 60 && at.minutes < 18 * 60 + 20;

const inCash = (at) => at && at.minutes >= 10 * 60 && at.minutes < 18 * 60;

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function listings() {
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!BIST.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    if (String(row.currency || "").toUpperCase() !== "TRY") continue;
    const code = String(row.ticker || "").trim().toUpperCase().replace(/\.TR$/, "");
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(code) || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byCode.get(code) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byCode.set(code, counts);
  }
  const jobs = [];
  let tied = 0;
  for (const [code, counts] of byCode) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      tied += 1;
      continue;
    }
    jobs.push({ code, isin: ranked[0][0] });
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
  let completed = 0;
  let errors = 0;
  let settle = null;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => ws.close(), 40000);
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(settle);
      resolve(quotes);
    };
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      ws.send(pack({ m: "quote_add_symbols", p: [session, ...jobs.map((job) => `BIST:${job.code}`)] }));
    });
    ws.addEventListener("message", (ev) => {
      for (const msg of parse(String(ev.data))) {
        if (!msg) continue;
        if (msg.heartbeat) {
          ws.send(`~m~${msg.heartbeat.length}~m~${msg.heartbeat}`);
          continue;
        }
        if (msg.m === "quote_completed") {
          completed += 1;
          continue;
        }
        if (msg.m !== "qsd") continue;
        const payload = msg.p?.[1];
        const name = payload?.n;
        if (!name) continue;
        if (payload.s === "error") {
          errors += 1;
          quotes.set(name, { error: payload.errmsg || "error" });
          continue;
        }
        quotes.set(name, { ...(quotes.get(name) || {}), ...(payload.v || {}) });
      }
      if (completed + errors >= jobs.length) {
        clearTimeout(settle);
        settle = setTimeout(() => ws.close(), 6000);
      }
    });
    ws.addEventListener("error", () => reject(new Error("le flux d'Istanbul n'a pas répondu")));
    ws.addEventListener("close", finish);
  });
}

const now = istanbul();
if (!canRead(now)) {
  console.error(`hors séance, Istanbul ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const { jobs, tied } = listings();
console.error(`Istanbul ${now.clock}. ${jobs.length} codes, ${tied} codes à ISIN partagé laissés de côté.`);
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
let otherCcy = 0;
for (const job of jobs) {
  const row = quotes.get(`BIST:${job.code}`);
  if (!row || row.error) {
    missing += 1;
    continue;
  }
  if (row.isin && String(row.isin).toUpperCase() !== job.isin) {
    mismatch += 1;
    continue;
  }
  const ccy = String(row.currency_code || "").toUpperCase();
  if (ccy && ccy !== "TRY") {
    otherCcy += 1;
    continue;
  }
  const bid = Number(row.bid);
  const ask = Number(row.ask);
  const last = Number(row.lp);
  const bp = bpFrom(bid, ask);
  if (bp == null) {
    noBook += 1;
    continue;
  }
  const stamped = [row.lp_time, row.open_time]
    .filter((unix) => Number(unix) > 0)
    .map(fromUnix)
    .find((at) => at.date === now.date && inCash(at));
  if (!stamped) {
    stale += 1;
    continue;
  }
  found.push({
    isin: job.isin,
    mic: "XIST",
    code: job.code,
    bid,
    ask,
    ...(last > 0 ? { last } : {}),
    bp,
    stamp: `${stamped.date} ${stamped.clock}`,
    url: `${PAGE}${encodeURIComponent(job.code)}/`,
  });
}

found.sort((a, b) => a.code.localeCompare(b.code));
if (!found.length) {
  console.error(
    `aucune touche. Istanbul ${now.clock}. ${stale} carnets d'un autre jour, ${noBook} sans deux côtés, ${mismatch} ISIN en désaccord, ${missing} absents. Rien n'est écrit.`
  );
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: now.date, clock: now.clock, delayed: true, rows: found, noBook, stale, mismatch, missing, otherCcy, tied }, null, 2)
);
console.error(
  `${found.length} touches, ${stale} carnets d'un autre jour, ${noBook} sans deux côtés, ${mismatch} ISIN en désaccord, ${otherCcy} autre devise, ${missing} absents. Écrit dans bist-touch.json.`
);
