// BYMA cash touch. Bid and ask are the quote TradingView streams for the
// Buenos Aires book. A last trade is never written in their place. The
// board is in pesos and in dollars, as two lines. A quote is kept only
// when today's last trade falls inside continuous trading, 10:30–17:00
// Buenos Aires. Outside that window nothing is written.
//
//   node spreads/byma-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const STORE = fileURLToPath(new URL("./byma-touch.json", import.meta.url));
const PAGE = "https://www.tradingview.com/symbols/BCBA-";
const SCAN = "https://scanner.tradingview.com/argentina/scan";
const FIELDS = ["lp", "lp_time", "bid", "ask", "isin", "exchange", "currency_code"];

const buenos = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires",
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
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
};

const inCash = (at) => at.minutes >= 10 * 60 + 30 && at.minutes < 17 * 60;
const canRead = (at) => at.weekday !== "Sat" && at.weekday !== "Sun" && at.minutes >= 10 * 60 + 30 && at.minutes < 17 * 60 + 20;

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

const fromUnix = (unix) => buenos(new Date(Number(unix) * 1000));

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
        filter: [{ left: "exchange", operation: "equal", right: "BCBA" }],
        sort: { sortBy: "name", sortOrder: "asc" },
        range: [start, start + 200],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`le tableau BYMA a répondu ${response.status}`);
    const data = await response.json();
    const page = Array.isArray(data.data) ? data.data : [];
    for (const row of page) {
      const symbol = String(row.s || "");
      const code = symbol.slice("BCBA:".length);
      const [currency, isin] = [row.d?.[1], row.d?.[2]];
      const id = String(isin || "").trim().toUpperCase();
      const ccy = String(currency || "").trim().toUpperCase();
      if (!symbol.startsWith("BCBA:") || !code || (ccy !== "ARS" && ccy !== "USD")) continue;
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(id)) continue;
      const key = `${code}|${ccy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({ code, isin: id, currency: ccy });
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
    const timer = setTimeout(() => ws.close(), 150000);
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(settle);
      resolve(quotes);
    };
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      const symbols = jobs.map((job) => `BCBA:${job.code}`);
      for (let i = 0; i < symbols.length; i += 80) {
        ws.send(pack({ m: "quote_add_symbols", p: [session, ...symbols.slice(i, i + 80)] }));
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
    ws.addEventListener("error", () => reject(new Error("le flux BYMA n'a pas répondu")));
    ws.addEventListener("close", finish);
  });
}

const now = buenos();
if (!canRead(now)) {
  console.error(`hors séance, Buenos Aires ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const jobs = await listings();
console.error(`BYMA ${now.clock}. ${jobs.length} lignes.`);
if (!jobs.length) {
  console.error("aucune ligne. Rien n'est écrit.");
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
  const row = quotes.get(`BCBA:${job.code}`);
  if (!row || row.error) {
    missing += 1;
    continue;
  }
  if (row.isin && String(row.isin).toUpperCase() !== job.isin) {
    mismatch += 1;
    continue;
  }
  const ccy = String(row.currency_code || job.currency).toUpperCase();
  if (ccy !== job.currency) {
    otherCcy += 1;
    continue;
  }
  const bp = bpFrom(Number(row.bid), Number(row.ask));
  if (bp == null) {
    noBook += 1;
    continue;
  }
  const stamped = Number(row.lp_time) > 0 ? fromUnix(row.lp_time) : null;
  if (!stamped || stamped.date !== now.date || !inCash(stamped)) {
    stale += 1;
    continue;
  }
  found.push({
    code: job.code,
    isin: job.isin,
    currency: job.currency,
    bid: Number(row.bid),
    ask: Number(row.ask),
    bp,
    url: `${PAGE}${encodeURIComponent(job.code)}/`,
  });
}

fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: now.date, tz: "America/Argentina/Buenos_Aires", rows: found }, null, 2)
);
const by = {};
for (const row of found) by[row.currency] = (by[row.currency] || 0) + 1;
console.error(
  `${found.length} touches (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(", ")}), ${stale} d'un autre moment, ${noBook} sans deux côtés, ${mismatch} ISIN en désaccord, ${otherCcy} autre devise, ${missing} absents.`
);
