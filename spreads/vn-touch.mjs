// HOSE and UPCOM cash touch from the BSC instruments board. Bid and ask
// are bidPrice1 and offerPrice1. A last trade is never written in their
// place.
//
// Continuous matching, Asia/Ho_Chi_Minh:
//   HOSE   09:15–11:30 and 13:00–14:30
//   UPCOM  09:00–11:30 and 13:00–15:00
// The opening auction (HOSE 09:00–09:15), the closing auction (HOSE
// 14:30–14:45) and the lunch break are not written. A board that is
// closed keeps its rows from the same Ho Chi Minh day. The reading is
// vn-touch.json. spread.mjs copies it into spread.json (`--only=vn-touch`).
//
//   node spreads/vn-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";

const STORE = fileURLToPath(new URL("./vn-touch.json", import.meta.url));
const FEED = "https://priceapi.bsc.com.vn/datafeed/instruments";
const BOARDS = ["HOSE", "UPCOM"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hcm = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
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
    stamp: `${parts.day}/${parts.month}/${parts.year}`,
  };
};

const openBoards = (at) => {
  if (!at.day) return [];
  const m = at.minutes;
  const morning = m < 11 * 60 + 30;
  const afternoon = m >= 13 * 60;
  const open = [];
  if ((morning && m >= 9 * 60 + 15) || (afternoon && m < 14 * 60 + 30)) open.push("HOSE");
  if ((morning && m >= 9 * 60) || (afternoon && m < 15 * 60)) open.push("UPCOM");
  return open;
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

const wanted = (row) => {
  if (!BOARDS.includes(row.exchange)) return false;
  if (String(row.Status ?? "") !== "00") return false;
  const type = String(row.StockType ?? "");
  if (type === "2") return true;
  return row.exchange === "HOSE" && type === "3" && row.FundType === "E";
};

async function board() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(FEED, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        const body = await response.json();
        const rows = Array.isArray(body?.d) ? body.d : [];
        if (rows.length) return rows;
        last = "tableau vide";
      } else last = `${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last || FEED);
}

function isins() {
  const byBoard = { HOSE: new Map(), UPCOM: new Map() };
  for (const row of catalogueRows()) {
    const exchange = String(row.exchange || "").trim().toUpperCase();
    if (!BOARDS.includes(exchange)) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && type !== "STOCK" && type !== "ETF") continue;
    const isin = String(row.isin || "").toUpperCase();
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z0-9]{2,8}$/.test(ticker)) continue;
    const counts = byBoard[exchange].get(ticker) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byBoard[exchange].set(ticker, counts);
  }
  return byBoard;
}

const pick = (counts) => {
  if (!counts) return "";
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return "";
  return ranked[0][0];
};

const previous = (date) => {
  if (!fs.existsSync(STORE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(STORE, "utf8"));
    if (data.date !== date) return [];
    return Array.isArray(data.rows) ? data.rows : [];
  } catch {
    return [];
  }
};

const start = hcm();
const untilHose = 9 * 60 + 15 - start.minutes;
if (start.day && untilHose > 0 && untilHose <= 20 && openBoards(start).includes("UPCOM")) {
  console.error(`HOSE ouvre à 09:15, attente ${untilHose} min. Hô Chi Minh ${start.clock}.`);
  await sleep(untilHose * 60_000 + 8_000);
}

const now = hcm();
const open = openBoards(now);
if (!open.length) {
  console.error(`hors continu, Hô Chi Minh ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

console.error(`Hô Chi Minh ${now.clock}. Continu : ${open.join(", ")}. ISINs des catalogues…`);
const byBoard = isins();
const rows = await board();
const today = now.stamp;
let dated = 0;
let noTouch = 0;
let tied = 0;
let unknown = 0;
const found = [];
for (const row of rows) {
  if (!open.includes(row.exchange) || !wanted(row)) continue;
  if (row.tradingdate !== today) {
    dated += 1;
    continue;
  }
  const bid = num(row.bidPrice1);
  const ask = num(row.offerPrice1);
  const bp = bpFrom(bid, ask);
  if (bp == null) {
    noTouch += 1;
    continue;
  }
  const code = String(row.symbol || "").trim().toUpperCase();
  const isin = pick(byBoard[row.exchange].get(code));
  if (!isin) {
    if (byBoard[row.exchange].has(code)) tied += 1;
    else unknown += 1;
    continue;
  }
  found.push({
    isin,
    exchange: row.exchange,
    code,
    bid,
    ask,
    bp,
    url: FEED,
  });
}

const kept = previous(now.date).filter((row) => !open.includes(row.exchange));
const freshBoards = new Set(found.map((row) => row.exchange));
const quiet = open.filter((board) => !freshBoards.has(board));
const carried = previous(now.date).filter((row) => quiet.includes(row.exchange));
const merged = [...kept, ...carried, ...found].sort(
  (a, b) => a.exchange.localeCompare(b.exchange) || a.code.localeCompare(b.code)
);

if (!merged.length) {
  console.error(`aucune touche du continu. Hô Chi Minh ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}
if (quiet.length) {
  console.error(`${quiet.join(", ")} sans touche neuve : les lignes du jour sont gardées.`);
}

fs.writeFileSync(
  STORE,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      date: now.date,
      clock: now.clock,
      open,
      source: FEED,
      rows: merged,
      stale: dated,
      noTouch,
      tied,
      unknown,
    },
    null,
    2
  )
);
const counts = Object.fromEntries(BOARDS.map((board) => [board, merged.filter((row) => row.exchange === board).length]));
console.error(
  `${found.length} touches neuves (${open.join(", ")}), gardées ${kept.length + carried.length}. ` +
    `HOSE ${counts.HOSE}, UPCOM ${counts.UPCOM}. ` +
    `${dated} hors date, ${noTouch} sans bid et ask, ${tied} ISIN partagés, ${unknown} hors catalogue. ` +
    `Écrit dans vn-touch.json.`
);
