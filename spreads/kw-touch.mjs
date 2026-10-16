// Boursa Kuwait cash touch. Bid and ask are the public quote. A last
// trade is never written in their place. The quote is in fils; the
// ratio is the dinar book. A currency that is not fils or dinars is
// kept as its own book, even when no catalogue lists it.
//
// Continuous matching is 09:00–13:00 Kuwait time, Sunday to Thursday.
// The closing auction starts at 13:00. A stamp outside that window, or
// from another day, is left out. The reading is kw-touch.json.
// spread.mjs copies it into spread.json (`--only=kw-touch`).
//
//   node spreads/kw-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./kw-touch.json", import.meta.url));
const KW = new Set(["kse", "xkuw", "kuwait", "boursakuwait", "kuwaitstockexchange"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC"]);
const LISTS = ["../assets/stocks.csv", "../assets/etfs.csv"].map((name) => fileURLToPath(new URL(name, import.meta.url)));
const FIELDS = ["lp", "lp_time", "bid", "ask", "currency_code"];

const kuwait = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuwait",
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
    day: ["Sun", "Mon", "Tue", "Wed", "Thu"].includes(parts.weekday),
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

const inSession = (at) => at?.day && at.minutes >= 9 * 60 && at.minutes < 13 * 60;

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

// Fils and dinars are one book. Anything else is a second counter.
const bookCurrency = (code) => {
  const ccy = String(code || "").toUpperCase();
  if (ccy === "KWF" || ccy === "KWD") return "KWD";
  return /^[A-Z]{3}$/.test(ccy) ? ccy : "";
};

function listings() {
  const byCode = new Map();
  const add = (code, isin) => {
    if (!/^[A-Z0-9]{2,12}$/.test(code) || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return;
    const counts = byCode.get(code) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byCode.set(code, counts);
  };
  for (const row of catalogueRows()) {
    if (!KW.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy && ccy !== "KWD" && !isin.startsWith("KW")) continue;
    add(String(row.ticker || "").trim().toUpperCase(), isin);
  }
  for (const file of LISTS) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n").slice(1)) {
      const [ticker, exchange, isin] = line.split(",");
      if (!KW.has(norm(exchange))) continue;
      add(String(ticker || "").split(":").pop().trim().toUpperCase(), String(isin || "").trim().toUpperCase());
    }
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
    const timer = setTimeout(() => ws.close(), 45_000);
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      const symbols = jobs.map((job) => `KSE:${job.code}`);
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
      if (completed + errors >= jobs.length) ws.close();
    });
    ws.addEventListener("error", () => reject(new Error("le flux Koweït n'a pas répondu")));
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      resolve(quotes);
    });
  });
}

const now = kuwait();
if (!now.day || !inSession(now)) {
  console.error(`hors séance, Koweït ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

console.error(`Koweït ${now.clock}. ISINs des catalogues et des listes…`);
const { jobs, tied } = listings();
console.error(`${jobs.length} codes, ${tied} codes à ISIN partagé laissés de côté.`);
const quotes = await quote(jobs);
const found = [];
let stale = 0;
let noTouch = 0;
let other = 0;
for (const job of jobs) {
  const row = quotes.get(`KSE:${job.code}`) || {};
  if (row.error) continue;
  const stamp = Number(row.lp_time);
  if (!Number.isFinite(stamp)) {
    stale += 1;
    continue;
  }
  const at = kuwait(new Date(stamp * 1000));
  if (at.date !== now.date || !inSession(at)) {
    stale += 1;
    continue;
  }
  const currency = bookCurrency(row.currency_code);
  if (!currency) {
    other += 1;
    continue;
  }
  const bp = bpFrom(Number(row.bid), Number(row.ask));
  if (bp == null) {
    noTouch += 1;
    continue;
  }
  found.push({
    isin: job.isin,
    mic: "XKUW",
    code: job.code,
    currency,
    bid: Number(row.bid),
    ask: Number(row.ask),
    bp,
    stamp: `${at.date} ${at.clock}`,
    url: `https://www.tradingview.com/symbols/KSE-${encodeURIComponent(job.code)}/`,
  });
}
found.sort((a, b) => a.code.localeCompare(b.code) || a.currency.localeCompare(b.currency));
if (!found.length) {
  console.error(`aucune touche du continu. Koweït ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}
fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: now.date, clock: now.clock, rows: found, stale, noTouch, other, tied }, null, 2)
);
const currencies = found.reduce((map, row) => map.set(row.currency, (map.get(row.currency) || 0) + 1), new Map());
console.error(
  `${found.length} touches (${[...currencies].map(([ccy, n]) => `${n} ${ccy}`).join(", ")}), ${stale} hors séance, ${noTouch} sans bid et ask. Koweït ${kuwait().clock}.`
);
