// Nairobi Securities Exchange cash touch. Bid and ask are the quote
// TradingView streams for the NSEKE book. A last trade is never written
// in their place. The feed also keeps a board from a previous session, so
// a quote is kept only when today's open or last trade falls inside
// continuous trading, 09:30–15:00 Nairobi. The official quote feed is
// licensed. The board is in shillings.
//
// The clock may be twenty minutes past 15:00, which is how a delayed
// board from that session still gets filed. Outside that window nothing
// is written. The reading is nairobi-touch.json. spread.mjs copies it
// into spread.json (`--only=nairobi-touch`).
//
//   node spreads/nairobi-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const STORE = fileURLToPath(new URL("./nairobi-touch.json", import.meta.url));
const PAGE = "https://www.tradingview.com/symbols/NSEKE-";
const SCAN = "https://scanner.tradingview.com/kenya/scan";
const FIELDS = ["lp", "lp_time", "bid", "ask", "open_time", "isin", "exchange", "currency_code"];

const nairobi = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
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

const fromUnix = (unix) => nairobi(new Date(Number(unix) * 1000));

const canRead = (at) => at?.day && at.minutes >= 9 * 60 + 30 && at.minutes < 15 * 60 + 20;

const inCash = (at) => at && at.minutes >= 9 * 60 + 30 && at.minutes < 15 * 60;

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

async function listings() {
  const jobs = [];
  const seen = new Set();
  let start = 0;
  for (;;) {
    const response = await fetch(SCAN, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://www.tradingview.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        symbols: { query: { types: [] }, tickers: [] },
        columns: ["name", "currency", "isin"],
        sort: { sortBy: "name", sortOrder: "asc" },
        range: [start, start + 200],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`le tableau de Nairobi a répondu ${response.status}`);
    const data = await response.json();
    const page = Array.isArray(data.data) ? data.data : [];
    for (const row of page) {
      const symbol = String(row.s || "");
      const code = symbol.split(":")[1] || "";
      const [currency, isin] = [row.d?.[1], row.d?.[2]];
      const id = String(isin || "").trim().toUpperCase();
      const ccy = String(currency || "").trim().toUpperCase();
      if (!/^NSEKE:[A-Z0-9]{1,12}$/.test(symbol) || ccy !== "KES" || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(id)) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      jobs.push({ code, isin: id });
    }
    const total = Number(data.totalCount) || page.length;
    start += page.length;
    if (!page.length || start >= total) break;
  }
  jobs.sort((a, b) => a.code.localeCompare(b.code));
  return jobs;
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
    const timer = setTimeout(() => ws.close(), 70000);
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(settle);
      resolve(quotes);
    };
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      const symbols = jobs.map((job) => `NSEKE:${job.code}`);
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
        clearTimeout(settle);
        settle = setTimeout(() => ws.close(), 8000);
      }
    });
    ws.addEventListener("error", () => reject(new Error("le flux de Nairobi n'a pas répondu")));
    ws.addEventListener("close", finish);
  });
}

const now = nairobi();
if (!canRead(now)) {
  console.error(`hors séance, Nairobi ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const jobs = await listings();
console.error(`Nairobi ${now.clock}. ${jobs.length} codes.`);
if (!jobs.length) {
  console.error("aucun code. Rien n'est écrit.");
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
  const row = quotes.get(`NSEKE:${job.code}`);
  if (!row || row.error) {
    missing += 1;
    continue;
  }
  if (row.isin && String(row.isin).toUpperCase() !== job.isin) {
    mismatch += 1;
    continue;
  }
  const ccy = String(row.currency_code || "").toUpperCase();
  if (ccy && ccy !== "KES") {
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
    mic: "XNAI",
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
    `aucune touche. Nairobi ${now.clock}. ${stale} carnets d'un autre jour, ${noBook} sans deux côtés, ${missing} absents. Rien n'est écrit.`
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
      otherCcy,
    },
    null,
    2
  )
);
console.error(
  `${found.length} touches, ${stale} carnets d'un autre jour, ${noBook} sans deux côtés, ${mismatch} ISIN en désaccord, ${otherCcy} autre devise, ${missing} absents. Écrit dans nairobi-touch.json.`
);
