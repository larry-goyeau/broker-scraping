// Jakarta cash touch from the public delayed quote. Bid and ask are the
// quote. A last trade is never written in their place. The currency is
// the one the quote names, so a counter no catalogue lists is still kept.
//
// Continuous matching is 09:00–12:00 and 13:30–16:00 Jakarta time. A
// stamp from lunch, from another day, or from before the open is left
// out. The reading is idx-touch.json. spread.mjs copies it into
// spread.json (`--only=idx-touch`).
//
//   node spreads/idx-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./idx-touch.json", import.meta.url));
const IDX = new Set(["idx", "xidx", "jakarta", "indonesia"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC"]);
const LISTS = ["../assets/stocks.csv", "../assets/etfs.csv"].map((name) => fileURLToPath(new URL(name, import.meta.url)));
const FIELDS = ["lp", "lp_time", "bid", "ask", "currency_code"];

const jakarta = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
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

const inSession = (at) => {
  if (!at?.day) return false;
  const morning = at.minutes >= 9 * 60 && at.minutes < 12 * 60;
  const afternoon = at.minutes >= 13 * 60 + 30 && at.minutes < 16 * 60;
  return morning || afternoon;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
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
    if (!IDX.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    add(String(row.ticker || "").trim().toUpperCase(), String(row.isin || "").toUpperCase());
  }
  for (const file of LISTS) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n").slice(1)) {
      const [ticker, exchange, isin] = line.split(",");
      if (!IDX.has(norm(exchange))) continue;
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
    const timer = setTimeout(() => ws.close(), 90_000);
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      const symbols = jobs.map((job) => `IDX:${job.code}`);
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
    ws.addEventListener("error", () => reject(new Error("le flux Jakarta n'a pas répondu")));
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      resolve(quotes);
    });
  });
}

const now = jakarta();
if (!now.day || !inSession(now)) {
  console.error(`hors séance, Jakarta ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

console.error(`Jakarta ${now.clock}. ISINs des catalogues et des listes…`);
const { jobs, tied } = listings();
console.error(`${jobs.length} codes, ${tied} codes à ISIN partagé laissés de côté.`);
const quotes = await quote(jobs);
const today = now.date;
const found = [];
let stale = 0;
let noTouch = 0;
let other = 0;
for (const job of jobs) {
  const row = quotes.get(`IDX:${job.code}`) || {};
  if (row.error) continue;
  const stamp = Number(row.lp_time);
  if (!Number.isFinite(stamp)) {
    stale += 1;
    continue;
  }
  const at = jakarta(new Date(stamp * 1000));
  if (at.date !== today || !inSession(at)) {
    stale += 1;
    continue;
  }
  const currency = String(row.currency_code || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
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
    mic: "XIDX",
    code: job.code,
    currency,
    bid: Number(row.bid),
    ask: Number(row.ask),
    bp,
    stamp: `${at.date} ${at.clock}`,
    url: `https://www.tradingview.com/symbols/IDX-${encodeURIComponent(job.code)}/`,
  });
}
found.sort((a, b) => a.code.localeCompare(b.code) || a.currency.localeCompare(b.currency));
if (!found.length) {
  console.error(`aucune touche du continu. Jakarta ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}
fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: today, clock: now.clock, rows: found, stale, noTouch, other, tied }, null, 2)
);
const currencies = found.reduce((map, row) => map.set(row.currency, (map.get(row.currency) || 0) + 1), new Map());
console.error(
  `${found.length} touches (${[...currencies].map(([ccy, n]) => `${n} ${ccy}`).join(", ")}), ${stale} hors séance, ${noTouch} sans bid et ask. Jakarta ${jakarta().clock}.`
);
