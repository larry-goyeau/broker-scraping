// beQuoted cash touch. Bid and ask are Köp and Sälj on the public
// prices page. A last trade is never written in their place. A row
// with only one side stays empty.
//
// The page is the whole book, seven names, in kronor. It stamps when
// it was refreshed. Continuous trading is read as 09:00–17:30
// Stockholm. Outside that window, or on a stamp from another day,
// nothing is written. The reading is bequoted-touch.json. spread.mjs
// copies it into spread.json (`--only=bequoted-touch`).
//
//   node spreads/bequoted-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./bequoted-touch.json", import.meta.url));
const PAGE = "https://secure.bequoted.com/market/prices/";

const stockholm = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Stockholm",
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

const inSession = (at) => at.day && at.minutes >= 9 * 60 && at.minutes < 17 * 60 + 30;

const num = (value) => {
  const text = String(value ?? "")
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!text || text === "--" || text === "-") return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

const stem = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/(?:\s+[a-z])+$/, "");

function cellsOf(row) {
  return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
    match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function catalogue() {
  const byStem = new Map();
  for (const row of catalogueRows()) {
    if (norm(row.exchange) !== "xxxx") continue;
    const isin = String(row.isin || "").toUpperCase();
    const name = stem(row.name);
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !name) continue;
    const counts = byStem.get(name) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byStem.set(name, counts);
  }
  const isinOf = new Map();
  for (const [name, counts] of byStem) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    isinOf.set(name, ranked[0][0]);
  }
  return isinOf;
}

const now = stockholm();
if (!inSession(now)) {
  console.error(`hors séance, Stockholm ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const response = await fetch(PAGE, {
  headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
  signal: AbortSignal.timeout(20_000),
  redirect: "follow",
});
if (!response.ok) throw new Error(`beQuoted a répondu ${response.status}`);
const html = await response.text();
const stamped = html.match(/Uppdaterad\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
if (!stamped || stamped[1] !== now.date) {
  console.error(`page datée ${stamped?.[1] || "sans date"}, Stockholm ${now.date}. Rien n'est écrit.`);
  process.exit(1);
}

const isinOf = catalogue();
const found = [];
let noTouch = 0;
let unmatched = 0;
for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
  const cells = cellsOf(row);
  if (cells[0] === "Värdepapper" || cells.length < 4) continue;
  const name = cells[0];
  const isin = isinOf.get(stem(name));
  if (!isin) {
    unmatched += 1;
    continue;
  }
  const bid = num(cells[2]);
  const ask = num(cells[3]);
  const last = num(cells[4]);
  const bp = bpFrom(bid, ask);
  if (bp == null) {
    noTouch += 1;
    continue;
  }
  found.push({ isin, mic: "XXXX", name, bid, ask, ...(last > 0 ? { last } : {}), bp, url: PAGE });
}

found.sort((a, b) => a.name.localeCompare(b.name));
if (!found.length) {
  console.error(`aucune touche. Stockholm ${now.clock}. ${noTouch} sans deux côtés. Rien n'est écrit.`);
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify(
    { at: new Date().toISOString(), date: now.date, clock: stamped[2], rows: found, noTouch, unmatched },
    null,
    2
  )
);
console.error(
  `${found.length} touches, ${noTouch} sans deux côtés, ${unmatched} sans ISIN. Écrit dans bequoted-touch.json. Stockholm ${now.clock}.`
);
