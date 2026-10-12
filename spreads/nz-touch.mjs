// NZX cash touch. Bid and ask are bestBid and bestOffer on the public
// quote. That quote runs about twenty minutes behind the tape. A last
// trade is never written in place of a missing side. One side missing,
// or a crossed book, leaves the line out.
//
// Continuous trading is 10:00–16:45 Auckland time, Monday to Friday. The
// closing auction starts at 16:45. A stamp from outside that window, or
// from another day, is left out.
//
//   node spreads/nz-touch.mjs
//   node spreads/nz-touch.mjs --jobs=6

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STORE = fileURLToPath(new URL("./spread.json", import.meta.url));
const LOCK = `${STORE}.lock`;
const BROKERS = fileURLToPath(new URL("../brokers", import.meta.url));
const JOBS = Math.max(1, Number((process.argv.find((a) => a.startsWith("--jobs=")) || "").slice(7) || 6));
const OPEN = 10 * 60;
const CLOSE = 16 * 60 + 45;
const BOARDS = new Set(["NZX", "XNZE", "NZSE NATIONAL MARKET"]);

const auckland = (date = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const open = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) && minutes >= OPEN && minutes <= CLOSE;
  return { weekday: parts.weekday, minutes, open, day, clock: `${parts.hour}:${parts.minute}` };
};

const num = (value) => {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function names() {
  const byTicker = new Map();
  for (const folder of fs.readdirSync(BROKERS)) {
    const dir = path.join(BROKERS, folder);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith("-parsed.json")) continue;
      const rows = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!BOARDS.has(String(row.exchange || "").toUpperCase())) continue;
        const ticker = String(row.ticker || "").trim().toUpperCase();
        const isin = String(row.isin || "").trim().toUpperCase();
        if (!ticker || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
        if (!byTicker.has(ticker)) byTicker.set(ticker, new Set());
        byTicker.get(ticker).add(isin);
      }
    }
  }
  const out = [];
  let several = 0;
  for (const [ticker, isins] of byTicker) {
    if (isins.size !== 1) {
      several += 1;
      continue;
    }
    out.push({ ticker, isin: [...isins][0] });
  }
  return { rows: out, several };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const quoteUrl = (ticker) => `https://api.nzx.com/ticker/1.0/instrument/${encodeURIComponent(ticker)}/last`;

const inSession = (stamp) => {
  const when = new Date(stamp);
  if (Number.isNaN(when.getTime())) return false;
  const clock = auckland(when);
  return clock.day === auckland().day && clock.minutes >= OPEN && clock.minutes <= CLOSE;
};

const sessionOver = () => !auckland().open;

async function pool(items, n, fn) {
  const queue = items[Symbol.iterator]();
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (const item of queue) {
        if (sessionOver()) return;
        await fn(item);
      }
    })
  );
}

const found = [];
let missed = 0;
let stale = 0;

async function readBook(row) {
  const url = quoteUrl(row.ticker);
  let body;
  try {
    body = await getJson(url);
  } catch {
    missed += 1;
    return;
  }
  const stamp = body?.lastUpdatedAt || body?.priceAt;
  if (!inSession(stamp) || String(body?.currency || "").toUpperCase() !== "NZD") {
    stale += 1;
    return;
  }
  const bid = num(body.bestBid);
  const ask = num(body.bestOffer);
  const bp = bpFrom(bid, ask);
  if (bp == null) return;
  found.push({ isin: row.isin, ticker: row.ticker, bp, url });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function merge() {
  const store = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, "utf8")) : {};
  const spreads = (store.spreads ||= {});
  const state = (store.state ||= {});
  const at = new Date().toISOString();
  for (const row of found) {
    const byCcy = ((spreads[row.isin] ||= {})["XNZE"] ||= {});
    const prev = state[`${row.isin}|XNZE|NZD`] || {};
    const readings = [...(prev.bp || []), row.bp].slice(-24);
    byCcy.NZD = {
      bp: readings.length === 1 ? row.bp : Number(median(readings).toFixed(2)),
      url: row.url,
    };
    state[`${row.isin}|XNZE|NZD`] = { bp: readings, at };
  }
  store.generatedAt = at;
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  return found.length;
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const clock = auckland();
if (!clock.open) {
  console.error(`Séance cash fermée à Auckland (${clock.weekday} ${clock.clock}). Rien n'est écrit.`);
  process.exit(0);
}
if (fs.existsSync(LOCK)) {
  const held = JSON.parse(fs.readFileSync(LOCK, "utf8"));
  if (held.pid !== process.pid && alive(held.pid)) {
    console.error(`une passe écrit déjà dans ${STORE} (pid ${held.pid}).`);
    process.exit(1);
  }
}
fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));

try {
  console.error(`Auckland ${clock.clock}. Liste des lignes NZX…`);
  const { rows, several } = names();
  console.error(`${rows.length} lignes, ${several} symboles à plusieurs ISIN laissés de côté. ${JOBS} en parallèle, arrêt à 16:45.`);
  let asked = 0;
  await pool(rows, JOBS, async (row) => {
    asked += 1;
    if (asked % 40 === 0) console.error(`${asked} demandés, ${found.length} touches, Auckland ${auckland().clock}`);
    await readBook(row);
  });
  if (!found.length) {
    console.error(`Aucune touche retenue (Auckland ${auckland().clock}, ${missed} échecs, ${stale} hors séance). Le carnet n'est pas modifié.`);
  } else {
    const written = merge();
    console.error(`${written} touches écrites dans ${STORE}. ${missed} échecs, ${stale} hors séance. Auckland ${auckland().clock}.`);
  }
} finally {
  if (fs.existsSync(LOCK)) fs.unlinkSync(LOCK);
}
