// Stock Exchange of Thailand cash touch. Bid and ask are the quote
// TradingView streams for the SET book. A last trade is never written
// in their place. NVDR symbols are the .R line, a different book from
// the local share. The board quotes baht. A catalogue line in another
// currency is the same book when the name has no second currency here,
// so that ratio is stored too, and the baht line is stored even when
// no broker files it.
//
// Continuous trading is 10:00–12:30 and 14:00–16:30 Bangkok. Outside
// that window nothing is written. The reading is set-touch.json.
// spread.mjs copies it into spread.json (`--only=set-touch`).
//
//   node spreads/set-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./set-touch.json", import.meta.url));
const PAGE = "https://www.tradingview.com/symbols/SET-";
const SET = new Set(["set", "xbkk", "thailand", "stockexchangeofthailand"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC", "REIT", "FUND"]);
const FIELDS = ["lp", "lp_time", "bid", "ask", "open_time", "isin", "exchange", "currency_code"];

const bangkok = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
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

const stampOf = (unix) => {
  const raw = Number(unix);
  if (!(raw > 0)) return null;
  const at = new Date(raw * 1000);
  if (at.getUTCHours() === 0 && at.getUTCMinutes() === 0) return null;
  return bangkok(at);
};

const inCash = (minutes) =>
  (minutes >= 10 * 60 && minutes < 12 * 60 + 30) || (minutes >= 14 * 60 && minutes < 16 * 60 + 30);

const canRead = (at) => at?.day && inCash(at.minutes);

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function tvCode(ticker) {
  let code = String(ticker || "").trim().toUpperCase().replace(/_N$/, "");
  if (code.endsWith("-R")) code = `${code.slice(0, -2)}.R`;
  return /^[A-Z0-9.]{1,24}$/.test(code) ? code : "";
}

function listings() {
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!SET.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const code = tvCode(row.ticker);
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!code || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
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

function quoteChunk(symbols) {
  const quotes = new Map();
  const session = `qs_${Math.random().toString(36).slice(2, 14)}`;
  const ws = new WebSocket("wss://data.tradingview.com/socket.io/websocket", {
    headers: { Origin: "https://www.tradingview.com" },
  });
  return new Promise((resolve) => {
    const hard = setTimeout(() => ws.close(), 55000);
    let quiet = null;
    const finish = () => {
      clearTimeout(hard);
      clearTimeout(quiet);
      resolve(quotes);
    };
    const bump = () => {
      clearTimeout(quiet);
      quiet = setTimeout(() => ws.close(), 12000);
    };
    ws.addEventListener("open", () => {
      ws.send(pack({ m: "quote_create_session", p: [session] }));
      ws.send(pack({ m: "quote_set_fields", p: [session, ...FIELDS] }));
      let sent = 0;
      const sendSome = () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const slice = symbols.slice(sent, sent + 8);
        sent += slice.length;
        if (slice.length) ws.send(pack({ m: "quote_add_symbols", p: [session, ...slice.map((code) => `SET:${code}`)] }));
        if (sent < symbols.length) setTimeout(sendSome, 250);
        else bump();
      };
      sendSome();
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

async function quoteAll(jobs) {
  const quotes = new Map();
  const chunks = [];
  const size = process.argv.includes("--missing") ? 40 : 160;
  for (let i = 0; i < jobs.length; i += size) chunks.push(jobs.slice(i, i + size));
  const queue = [...chunks];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const chunk = queue.shift();
      const part = await quoteChunk(chunk.map((job) => job.code));
      for (const [key, value] of part) quotes.set(key, { ...(quotes.get(key) || {}), ...value });
      done += 1;
      console.error(`    lot ${done}/${chunks.length}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return quotes;
}

const now = bangkok();
if (!canRead(now)) {
  console.error(`hors séance, Bangkok ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const { jobs, tied } = listings();
console.error(`Bangkok ${now.clock}. ${jobs.length} codes, ${tied} codes à ISIN partagé laissés de côté.`);
if (!jobs.length) {
  console.error("aucun code du catalogue. Rien n'est écrit.");
  process.exit(1);
}

const retry = process.argv.includes("--missing");
const already = new Set();
let kept = [];
if (retry && fs.existsSync(STORE)) {
  const prior = JSON.parse(fs.readFileSync(STORE, "utf8"));
  if (prior.date === now.date) {
    kept = prior.rows || [];
    for (const row of kept) already.add(row.code);
  }
}
const pending = retry ? jobs.filter((job) => !already.has(job.code)) : jobs;
console.error(retry ? `${pending.length} codes encore absents.` : "");
const quotes = await quoteAll(pending);
const found = [...kept];
let noBook = 0;
let stale = 0;
let mismatch = 0;
let missing = 0;
const currencies = new Map();
for (const job of pending) {
  const row = quotes.get(`SET:${job.code}`);
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
  const book = String(row.currency_code || "THB").toUpperCase();
  const stored = new Set([book, ...job.currencies]);
  currencies.set(book, (currencies.get(book) || 0) + 1);
  const when = stamped && stamped.date === now.date ? stamped : now;
  found.push({
    isin: job.isin,
    mic: "XBKK",
    code: job.code,
    bid,
    ask,
    ...(Number(row.lp) > 0 ? { last: Number(row.lp) } : {}),
    bp,
    currencies: [...stored].sort(),
    stamp: `${when.date} ${when.clock}`,
    url: `${PAGE}${encodeURIComponent(job.code)}/`,
  });
}

found.sort((a, b) => a.code.localeCompare(b.code));
if (!found.length) {
  console.error(`aucune touche. ${stale} hors séance, ${noBook} sans deux côtés, ${mismatch} ISIN en désaccord, ${missing} absents.`);
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
  `${STORE} : ${found.length} touches (${[...currencies].map(([k, n]) => `${k} ${n}`).join(", ")}). ${noBook} sans deux côtés, ${stale} hors séance, ${mismatch} ISIN en désaccord, ${missing} absents.`
);
