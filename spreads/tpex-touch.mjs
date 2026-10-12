// Taipei Exchange cash touch, and only that book. Bid and ask come
// from the exchange's own five-deep quote, on the otc channel. The
// Taiwan Stock Exchange is the tse channel and this script never asks
// for it. A last trade is never written in place of a missing side.
// One side missing, or a crossed book, leaves the line out.
//
// Continuous matching is 9:00–13:25 Taipei time, Monday to Friday. The
// closing call starts at 13:25. Past that the script stops asking.
//
//   node spreads/tpex-touch.mjs
//   node spreads/tpex-touch.mjs --jobs=4

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STORE = fileURLToPath(new URL("./spread.json", import.meta.url));
const LOCK = `${STORE}.lock`;
const BROKERS = fileURLToPath(new URL("../brokers", import.meta.url));
const JOBS = Math.max(1, Number((process.argv.find((a) => a.startsWith("--jobs=")) || "").slice(7) || 4));
const BATCH = 30;
const OPEN = 9 * 60;
const CLOSE = 13 * 60 + 25;
const ORIGIN = "https://mis.twse.com.tw";

const taipei = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const day = `${parts.year}${parts.month}${parts.day}`;
  const open = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) && minutes >= OPEN && minutes <= CLOSE;
  return { weekday: parts.weekday, minutes, open, day, clock: `${parts.hour}:${parts.minute}` };
};

const prices = (text) =>
  String(text || "")
    .split("_")
    .map((part) => Number(part))
    .filter((n) => n > 0);

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

// Asks are quoted low to high, bids high to low. The best of each side
// is the minimum ask and the maximum bid, so a reversed column still
// lands on the touch.
const touchOf = (row) => {
  const asks = prices(row?.a);
  const bids = prices(row?.b);
  const ask = asks.length ? Math.min(...asks) : null;
  const bid = bids.length ? Math.max(...bids) : null;
  return { bid, ask, bp: bpFrom(bid, ask) };
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
        if (String(row.exchange || "").toUpperCase() !== "TPEX") continue;
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
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: `${ORIGIN}/stock/index.jsp` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const quoteUrl = (ticker) =>
  `${ORIGIN}/stock/api/getStockInfo.jsp?ex_ch=otc_${encodeURIComponent(ticker)}.tw&json=1&delay=0`;

const sessionOver = () => !taipei().open;

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
let otherBoard = 0;

async function readBatch(batch) {
  const url = `${ORIGIN}/stock/api/getStockInfo.jsp?ex_ch=${batch.map((row) => `otc_${encodeURIComponent(row.ticker)}.tw`).join("|")}&json=1&delay=0`;
  let body;
  try {
    body = await getJson(url);
  } catch {
    missed += batch.length;
    return;
  }
  const today = taipei().day;
  const byCode = new Map(batch.map((row) => [row.ticker, row]));
  for (const quote of body?.msgArray || []) {
    const ticker = String(quote.c || "").toUpperCase();
    const row = byCode.get(ticker);
    if (!row) continue;
    byCode.delete(ticker);
    if (String(quote.ex || "").toLowerCase() !== "otc" || quote.d !== today) {
      otherBoard += 1;
      continue;
    }
    const touch = touchOf(quote);
    if (touch.bp == null) continue;
    found.push({ isin: row.isin, ticker, bp: touch.bp, url: quoteUrl(ticker) });
  }
  missed += byCode.size;
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
    const byCcy = ((spreads[row.isin] ||= {})["ROCO"] ||= {});
    const prev = state[`${row.isin}|ROCO|TWD`] || {};
    const readings = [...(prev.bp || []), row.bp].slice(-24);
    byCcy.TWD = {
      bp: readings.length === 1 ? row.bp : Number(median(readings).toFixed(2)),
      url: row.url,
    };
    state[`${row.isin}|ROCO|TWD`] = { bp: readings, at };
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

const clock = taipei();
if (!clock.open) {
  console.error(`Séance cash fermée à Taipei (${clock.weekday} ${clock.clock}). Rien n'est écrit.`);
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
  console.error(`Taipei ${clock.clock}. Liste des lignes TPEx…`);
  const { rows, several } = names();
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
  console.error(`${rows.length} lignes, ${several} symboles à plusieurs ISIN laissés de côté. ${JOBS} paquets en parallèle, arrêt à 13:25.`);
  let asked = 0;
  await pool(batches, JOBS, async (batch) => {
    asked += batch.length;
    await readBatch(batch);
    if (asked % 300 < BATCH) console.error(`${asked} demandés, ${found.length} touches, Taipei ${taipei().clock}`);
  });
  if (!found.length) {
    console.error(`Aucune touche retenue (Taipei ${taipei().clock}, ${missed} échecs, ${otherBoard} hors TPEx). Le carnet n'est pas modifié.`);
  } else {
    const written = merge();
    console.error(`${written} touches écrites dans ${STORE}. ${missed} échecs, ${otherBoard} hors TPEx. Taipei ${taipei().clock}.`);
  }
} finally {
  if (fs.existsSync(LOCK)) fs.unlinkSync(LOCK);
}
