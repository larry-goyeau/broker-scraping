// BIVA cash touch. Bid and ask are the quote TradingView streams for the
// BIVA book. A last trade is never written in their place. The official
// best-bid feed is licensed. The public site shows a delayed last price.
// The board is in pesos. Continuous trading is 08:30–14:50 Mexico City.
// A quote is kept only when today's last trade falls inside that window.
// Outside it, nothing is written.
//
//   node spreads/biva-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const STORE = fileURLToPath(new URL("./biva-touch.json", import.meta.url));
const PAGE = "https://www.tradingview.com/symbols/BIVA-";
const SCAN = "https://scanner.tradingview.com/mexico/scan";
const FIELDS = ["lp", "lp_time", "bid", "ask", "isin", "exchange", "currency_code"];

const mexico = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Mexico_City",
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
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour,
    minute,
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
};

const inCash = (at) => at.minutes >= 8 * 60 + 30 && at.minutes < 14 * 60 + 50;
const canRead = (at) => at.weekday !== "Sat" && at.weekday !== "Sun" && at.minutes >= 8 * 60 + 30 && at.minutes < 15 * 60 + 10;

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

const fromUnix = (unix) => mexico(new Date(Number(unix) * 1000));

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
        filter: [{ left: "exchange", operation: "equal", right: "BIVA" }],
        sort: { sortBy: "name", sortOrder: "asc" },
        range: [start, start + 200],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`le tableau BIVA a répondu ${response.status}`);
    const data = await response.json();
    const page = Array.isArray(data.data) ? data.data : [];
    for (const row of page) {
      const symbol = String(row.s || "");
      const code = symbol.slice("BIVA:".length);
      const [currency, isin] = [row.d?.[1], row.d?.[2]];
      const id = String(isin || "").trim().toUpperCase();
      const ccy = String(currency || "").trim().toUpperCase();
      if (!symbol.startsWith("BIVA:") || !code || ccy !== "MXN" || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(id)) continue;
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

function quoteChunk(jobs) {
  const quotes = new Map();
  const session = `qs_${Math.random().toString(36).slice(2, 14)}`;
  const ws = new WebSocket("wss://data.tradingview.com/socket.io/websocket", {
    headers: { Origin: "https://www.tradingview.com" },
  });
  let settle = null;
  const arm = () => {
    clearTimeout(settle);
    settle = setTimeout(() => ws.close(), 4000);
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => ws.close(), 25000);
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      ws.send(pack({ m: "quote_add_symbols", p: [session, ...jobs.map((job) => `BIVA:${job.code}`)] }));
      arm();
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
        if (payload.s === "error") quotes.set(name, { error: payload.errmsg || "error" });
        else quotes.set(name, { ...(quotes.get(name) || {}), ...(payload.v || {}) });
        arm();
      }
    });
    ws.addEventListener("error", () => reject(new Error("le flux BIVA n'a pas répondu")));
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      clearTimeout(settle);
      resolve(quotes);
    });
  });
}

async function quote(jobs) {
  const quotes = new Map();
  for (let i = 0; i < jobs.length; i += 150) {
    const chunk = jobs.slice(i, i + 150);
    const part = await quoteChunk(chunk);
    for (const [name, row] of part) quotes.set(name, row);
    console.error(`    ${Math.min(i + chunk.length, jobs.length)}/${jobs.length}`);
  }
  return quotes;
}

let now = mexico();
while (!canRead(now)) {
  if (now.weekday === "Sat" || now.weekday === "Sun" || now.minutes >= 15 * 60 + 10) {
    console.error(`hors séance, Mexico ${now.weekday} ${now.clock}. Rien n'est écrit.`);
    process.exit(1);
  }
  console.error(`Mexico ${now.clock}, la séance continue ouvre à 08:30. Attente.`);
  await new Promise((r) => setTimeout(r, 30_000));
  now = mexico();
}

const jobs = await listings();
console.error(`BIVA ${now.clock}. ${jobs.length} codes.`);
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
  const row = quotes.get(`BIVA:${job.code}`);
  if (!row || row.error) {
    missing += 1;
    continue;
  }
  if (row.isin && String(row.isin).toUpperCase() !== job.isin) {
    mismatch += 1;
    continue;
  }
  const ccy = String(row.currency_code || "").toUpperCase();
  if (ccy && ccy !== "MXN") {
    otherCcy += 1;
    continue;
  }
  const bp = bpFrom(Number(row.bid), Number(row.ask));
  if (bp == null) {
    noBook += 1;
    continue;
  }
  // A last trade from before today's open is yesterday's board. A print
  // from this morning, including the call before 08:30, is this session.
  const stamped = Number(row.lp_time) > 0 ? fromUnix(row.lp_time) : null;
  if (stamped && (stamped.date !== now.date || stamped.minutes < 7 * 60 + 30)) {
    stale += 1;
    continue;
  }
  if (!stamped && !inCash(now)) {
    stale += 1;
    continue;
  }
  found.push({
    code: job.code,
    isin: job.isin,
    bid: Number(row.bid),
    ask: Number(row.ask),
    bp,
    url: `${PAGE}${encodeURIComponent(job.code)}/`,
  });
}

const at = new Date().toISOString();
fs.writeFileSync(
  STORE,
  JSON.stringify({ at, date: now.date, tz: "America/Mexico_City", rows: found }, null, 2)
);
console.error(
  `${found.length} touches, ${stale} d'un autre moment, ${noBook} sans deux côtés, ${mismatch} ISIN en désaccord, ${otherCcy} autre devise, ${missing} absents.`
);
