// Singapore cash touch from the exchange's public price file. Bid and
// ask are the quote. A last trade is never written in their place.
//
// Continuous matching is 09:00–12:00 and 13:00–17:00 Singapore time.
// The file stamps UTC. A stamp outside those two windows, or from
// another day, is left out. The reading is sgx-touch.json. spread.mjs
// copies it into spread.json (`--only=sgx-touch`).
//
//   node spreads/sgx-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./sgx-touch.json", import.meta.url));
const URL_FEED =
  "https://api.sgx.com/securities/v1.1?excludetypes=bonds&params=nc,b,bv,s,sv,lt,trading_time,type";
const SG = new Set(["sgx", "xses", "singapore", "sgxst"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC"]);

const singapore = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
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

// "20261006_010100" is 01:01:00 UTC, 09:01 in Singapore.
const stampOf = (text) => {
  const match = String(text || "").match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const utc = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]));
  if (Number.isNaN(utc.getTime())) return null;
  return singapore(utc);
};

const inSession = (at) => {
  if (!at?.day) return false;
  const morning = at.minutes >= 9 * 60 && at.minutes < 12 * 60;
  const afternoon = at.minutes >= 13 * 60 && at.minutes < 17 * 60;
  return morning || afternoon;
};

function listings() {
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!SG.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const code = String(row.ticker || "").trim().toUpperCase().replace(/\.SI$/, "");
    if (!/^[A-Z0-9]{2,6}$/.test(code)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byCode.get(code) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byCode.set(code, counts);
  }
  const jobs = new Map();
  let tied = 0;
  for (const [code, counts] of byCode) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      tied += 1;
      continue;
    }
    jobs.set(code, ranked[0][0]);
  }
  return { jobs, tied };
}

async function book() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(URL_FEED, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
          Origin: "https://www.sgx.com",
          Referer: "https://www.sgx.com/securities/securities-prices",
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response.json();
      last = `${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || "no price file");
}

const now = singapore();
if (!now.day || !inSession(now)) {
  console.error(`hors séance, Singapour ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

console.error(`Singapour ${now.clock}. ISINs des catalogues…`);
const { jobs, tied } = listings();
console.error(`${jobs.size} codes, ${tied} codes à ISIN partagé laissés de côté.`);

const body = await book();
const prices = body?.data?.prices;
if (!Array.isArray(prices) || !prices.length) throw new Error("le fichier de cours est vide");

const today = now.date;
const found = [];
let stale = 0;
let noTouch = 0;
let unmatched = 0;
for (const line of prices) {
  const code = String(line.nc || "").trim().toUpperCase();
  const isin = jobs.get(code);
  if (!isin) {
    unmatched += 1;
    continue;
  }
  const at = stampOf(line.trading_time);
  if (!at || at.date !== today || !inSession(at)) {
    stale += 1;
    continue;
  }
  const bid = num(line.b);
  const ask = num(line.s);
  const bp = bpFrom(bid, ask);
  if (bp == null) {
    noTouch += 1;
    continue;
  }
  found.push({
    isin,
    mic: "XSES",
    code,
    bid,
    ask,
    bp,
    stamp: `${at.date} ${at.clock}`,
    url: `https://www.sgx.com/securities/equities/${encodeURIComponent(code)}`,
  });
}
found.sort((a, b) => a.code.localeCompare(b.code));

if (!found.length) {
  console.error(`aucune touche du continu. Singapour ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), clock: now.clock, rows: found, stale, noTouch, unmatched, tied }, null, 2)
);
console.error(
  `${found.length} touches, ${stale} hors séance, ${noTouch} sans bid et ask. Écrit dans sgx-touch.json.`
);
