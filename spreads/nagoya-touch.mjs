// Nagoya cash touch. Bid and ask are the quote TradingView streams for
// the NAG book, twenty minutes late. A last trade is never written in
// their place. The feed also keeps a board from a previous session, so
// a quote is kept only when today's open or last trade falls inside
// continuous matching: 09:00–11:30 and 12:30–15:25 Tokyo. The opening
// print can be stamped a few minutes early. Lunch and the closing
// auction are left out.
//
// The clock may be up to twenty-five minutes past a session, which is
// how a delayed board from that session still gets filed. Outside that
// window nothing is written. The reading is nagoya-touch.json.
// spread.mjs copies it into spread.json (`--only=nagoya-touch`).
//
//   node spreads/nagoya-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./nagoya-touch.json", import.meta.url));
const PAGE = "https://www.tradingview.com/symbols/NAG-";
const NAG = new Set(["nagoya", "nag", "xngo", "xnag"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC", "REIT"]);
const FIELDS = ["lp", "lp_time", "bid", "ask", "open_time", "isin", "exchange", "pricescale"];

const tokyo = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
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

const fromUnix = (unix) => tokyo(new Date(Number(unix) * 1000));

// Reading is allowed through the delayed tail of each session.
const canRead = (at) => {
  if (!at?.day) return false;
  const morning = at.minutes >= 9 * 60 && at.minutes < 11 * 60 + 55;
  const afternoon = at.minutes >= 12 * 60 + 30 && at.minutes < 15 * 60 + 50;
  return morning || afternoon;
};

// 08:50 covers an opening print stamped a few minutes before 09:00.
const inCash = (at) => {
  if (!at) return false;
  const morning = at.minutes >= 8 * 60 + 50 && at.minutes < 11 * 60 + 30;
  const afternoon = at.minutes >= 12 * 60 + 30 && at.minutes < 15 * 60 + 25;
  return morning || afternoon;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function listings() {
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!NAG.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const code = String(row.ticker || "").trim().toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[0-9A-Z]{4,5}$/.test(code) || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
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
    i += len;
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
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
    }, 30000);
    const finish = () => {
      clearTimeout(timer);
      resolve(quotes);
    };
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      const symbols = jobs.map((job) => `NAG:${job.code}`);
      for (let i = 0; i < symbols.length; i += 50) {
        ws.send(pack({ m: "quote_add_symbols", p: [session, ...symbols.slice(i, i + 50)] }));
      }
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
        ws.close();
      }
    });
    ws.addEventListener("error", () => reject(new Error("le flux Nagoya n'a pas répondu")));
    ws.addEventListener("close", finish);
  });
}

const now = tokyo();
if (!canRead(now)) {
  console.error(`hors séance, Tokyo ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const { jobs, tied } = listings();
console.error(`Tokyo ${now.clock}. ${jobs.length} codes Nagoya, ${tied} codes à ISIN partagé laissés de côté.`);
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
  const row = quotes.get(`NAG:${job.code}`);
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
    mic: "XNGO",
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
    `aucune touche. Tokyo ${now.clock}. ${stale} carnets d'un autre jour, ${noBook} sans deux côtés, ${missing} absents. Rien n'est écrit.`
  );
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      date: now.date,
      clock: now.clock,
      delayed: true,
      rows: found,
      noBook,
      stale,
      mismatch,
      missing,
      tied,
    },
    null,
    2
  )
);
console.error(
  `${found.length} touches, ${stale} carnets d'un autre jour, ${noBook} sans deux côtés, ${mismatch} ISIN en désaccord, ${missing} absents. Écrit dans nagoya-touch.json.`
);
