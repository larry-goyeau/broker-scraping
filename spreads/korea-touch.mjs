// KRX cash touch from Naver, and only that book. Bid and ask come from
// /api/stock/{code}/askingPrice. Nextrade is a different path,
// /api/stock/NXT/{code}/askingPrice, and this script never calls it.
// A last trade is never written in place of a missing side. One side missing,
// or a crossed book, leaves the line out.
//
// The cash session is 9:00–15:30 Seoul time, Monday to Friday. Past the close
// the script stops asking.
//
//   node korea-touch.mjs
//   node korea-touch.mjs --jobs=8

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const STORE = fileURLToPath(new URL("./spread.json", import.meta.url));
const LOCK = `${STORE}.lock`;
const JOBS = Math.max(1, Number((process.argv.find((a) => a.startsWith("--jobs=")) || "").slice(7) || 8));
const CLOSE = 15 * 60 + 30;
const ORIGIN = "https://m.stock.naver.com";

const seoul = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
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
  const open = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) && minutes >= 9 * 60 && minutes <= CLOSE;
  return { weekday: parts.weekday, minutes, open, clock: `${parts.hour}:${parts.minute}` };
};

const num = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text || text === "--" || text === "-") return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

// Best bid is the highest buy, best ask the lowest sell. lastClosePrice is
// the previous print and is not read.
const krxTouch = (body) => {
  const levels = (rows) => (Array.isArray(rows) ? rows : []).map((row) => num(row?.price)).filter((n) => n != null);
  const bids = levels(body?.buyInfos);
  const asks = levels(body?.sellInfo);
  const bid = bids.length ? Math.max(...bids) : null;
  const ask = asks.length ? Math.min(...asks) : null;
  return { bid, ask, bp: bpFrom(bid, ask) };
};

const askingUrl = (code) => `${ORIGIN}/api/stock/${encodeURIComponent(code)}/askingPrice`;

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: `${ORIGIN}/` } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function listAll(path) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const body = await getJson(`${ORIGIN}${path}?page=${page}&pageSize=100`);
    const stocks = body.stocks || [];
    rows.push(...stocks);
    if (!stocks.length || rows.length >= Number(body.totalCount || 0)) break;
  }
  return rows;
}

function isinsByTicker() {
  const rows = JSON.parse(fs.readFileSync("toss/toss-parsed.json", "utf8"));
  const map = new Map();
  for (const row of rows) {
    const exchange = String(row.exchange || "").toUpperCase();
    const type = String(row.type || "").toUpperCase();
    if (!["KOSPI", "KOSDAQ"].includes(exchange) || !["STOCK", "ETF", "ETN"].includes(type)) continue;
    const ticker = String(row.ticker || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ticker && /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) map.set(ticker, isin);
  }
  return map;
}

const boardOf = (row) => {
  const name = String(row.stockExchangeType?.nameEng || "").toUpperCase();
  if (name === "KOSPI") return "XKRX";
  if (name === "KOSDAQ") return "XKOS";
  return "";
};

async function names() {
  const [kospi, kosdaq, etf, etn] = await Promise.all([
    listAll("/api/stocks/marketValue/KOSPI"),
    listAll("/api/stocks/marketValue/KOSDAQ"),
    listAll("/api/stocks/etf"),
    listAll("/api/stocks/etn"),
  ]);
  const isins = isinsByTicker();
  const wanted = [
    ...kospi.filter((row) => row.stockEndType === "stock"),
    ...kosdaq.filter((row) => row.stockEndType === "stock"),
    ...etf.filter((row) => row.stockEndType === "etf"),
    ...etn.filter((row) => row.stockEndType === "etn"),
  ];
  const out = new Map();
  let noIsin = 0;
  for (const row of wanted) {
    const code = String(row.itemCode || "").toUpperCase();
    const mic = boardOf(row);
    const isin = isins.get(code);
    if (!code || !mic) continue;
    if (!isin) {
      noIsin += 1;
      continue;
    }
    out.set(`${mic}|${code}`, { code, mic, isin });
  }
  return { rows: [...out.values()], noIsin };
}

const sessionOver = () => !seoul().open;

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

async function readBook(row) {
  const url = askingUrl(row.code);
  if (url.includes("/NXT/")) return;
  let body;
  try {
    body = await getJson(url);
  } catch {
    missed += 1;
    return;
  }
  const touch = krxTouch(body);
  if (touch.bp == null) return;
  found.push({ isin: row.isin, mic: row.mic, bp: touch.bp, url });
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
    const byCcy = ((spreads[row.isin] ||= {})[row.mic] ||= {});
    const prev = state[`${row.isin}|${row.mic}|KRW`] || {};
    const readings = [...(prev.bp || []), row.bp].slice(-24);
    byCcy.KRW = {
      bp: readings.length === 1 ? row.bp : Number(median(readings).toFixed(2)),
      url: row.url,
    };
    state[`${row.isin}|${row.mic}|KRW`] = { bp: readings, at };
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

const clock = seoul();
if (!clock.open) {
  console.error(`Séance cash fermée à Séoul (${clock.weekday} ${clock.clock}). Rien n'est écrit.`);
  process.exit(0);
}
if (fs.existsSync(LOCK)) {
  const held = JSON.parse(fs.readFileSync(LOCK, "utf8"));
  if (held.pid !== process.pid && alive(held.pid)) {
    console.error(`une passe écrit déjà dans ${STORE} (pid ${held.pid}).`);
    process.exit(1);
  }
}
fs.mkdirSync(fileURLToPath(new URL("./", import.meta.url)), { recursive: true });
fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));

try {
  console.error(`Séoul ${clock.clock}. Liste des actions, ETF et ETN…`);
  const { rows, noIsin } = await names();
  const kospi = rows.filter((row) => row.mic === "XKRX").length;
  const kosdaq = rows.filter((row) => row.mic === "XKOS").length;
  console.error(`${kospi} KOSPI, ${kosdaq} KOSDAQ, ${noIsin} sans ISIN laissés de côté. ${JOBS} en parallèle, arrêt à 15:30.`);
  let asked = 0;
  await pool(rows, JOBS, async (row) => {
    asked += 1;
    if (asked % 200 === 0) console.error(`${asked} demandés, ${found.length} touches, Séoul ${seoul().clock}`);
    await readBook(row);
  });
  if (!found.length) {
    console.error(`Aucune touche retenue (Séoul ${seoul().clock}, ${missed} échecs). Le carnet n'est pas modifié.`);
  } else {
    const written = merge();
    console.error(`${written} touches écrites dans ${STORE}. ${missed} échecs. Séoul ${seoul().clock}.`);
  }
} finally {
  if (fs.existsSync(LOCK)) fs.unlinkSync(LOCK);
}
