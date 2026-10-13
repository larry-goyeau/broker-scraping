// AQSE cash touch, from the exchange's own pre-trade file. Best bid
// and best offer are BEST_BID and BEST_OFFER. A last trade is never
// written in their place. A cancelled quote is not a book.
//
// The file is at least fifteen minutes late. Continuous trading is
// 08:00–16:30 London. Outside that window nothing is written. A quote
// from another London day is left out. Pence and pounds are one book:
// a GBX quote is also filed in GBP when that is the only sterling
// line. The reading is aqse-touch.json. spread.mjs copies it into
// spread.json (`--only=aqse-touch`).
//
//   node spreads/aqse-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./aqse-touch.json", import.meta.url));
const FILE = "https://aquis-public-files.s3.eu-west-2.amazonaws.com/aqse/market_data/current/pre_trade_transaction_data.csv";
const PAGE = "https://www.aquis.eu/stock-exchange/trade-transparency";
const NAMES = new Set(["aqse", "aquis", "plusmarketsgroupformerlyofex", "plusmarkets", "ofex"]);

const london = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
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

const inSession = (at) => at.day && at.minutes >= 8 * 60 && at.minutes < 16 * 60 + 30;

const num = (value) => {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  const [header, ...body] = rows;
  const index = new Map(header.map((name, at) => [name, at]));
  return body.map((cells) => Object.fromEntries([...index].map(([name, at]) => [name, cells[at] ?? ""])));
}

function wanted() {
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    if (!NAMES.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(isin, counts);
  }
  return byIsin;
}

const now = london();
if (!inSession(now)) {
  console.error(`hors séance, Londres ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

console.error(`Londres ${now.clock}. Fichier pré-négociation…`);
const response = await fetch(FILE, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`AQSE a répondu ${response.status}`);
const messages = parseCsv(await response.text());
messages.sort((a, b) => String(a.RECEIVED).localeCompare(String(b.RECEIVED)));

const latest = new Map();
for (const row of messages) {
  const isin = String(row.ISIN || "").toUpperCase();
  const currency = String(row.CURRENCY || "").toUpperCase();
  const received = String(row.RECEIVED || "");
  if (!isin || !currency || !received.startsWith(now.date)) continue;
  const key = `${isin}|${currency}`;
  if (String(row.MESSAGE_TYPE || "").toUpperCase() === "QC") {
    latest.set(key, null);
    continue;
  }
  latest.set(key, row);
}

const catalogues = wanted();
const found = [];
let noTouch = 0;
for (const [isin, counts] of catalogues) {
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
  const currency = ranked[0][0];
  const direct = latest.get(`${isin}|${currency}`);
  const sterling = currency === "GBP" ? latest.get(`${isin}|GBX`) : null;
  const row = direct || sterling;
  if (!row) {
    noTouch += 1;
    continue;
  }
  const bid = num(row.BEST_BID);
  const ask = num(row.BEST_OFFER);
  const bp = bpFrom(bid, ask);
  if (bp == null) {
    noTouch += 1;
    continue;
  }
  found.push({
    isin,
    mic: "AQSE",
    currency,
    quoteCurrency: String(row.CURRENCY || "").toUpperCase(),
    ticker: String(row.SHORTNAME || "").replace(/\.GB$/i, ""),
    name: row.SECURITYNAME || "",
    bid,
    ask,
    bp,
    received: row.RECEIVED,
    url: PAGE,
  });
}

found.sort((a, b) => a.isin.localeCompare(b.isin) || a.currency.localeCompare(b.currency));
if (!found.length) {
  console.error(`aucune touche. Londres ${now.clock}. ${noTouch} sans deux côtés. Rien n'est écrit.`);
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: now.date, clock: now.clock, delayed: true, rows: found, noTouch }, null, 2)
);
const byCcy = found.reduce((map, row) => map.set(row.currency, (map.get(row.currency) || 0) + 1), new Map());
console.error(
  `${found.length} touches (${[...byCcy].map(([ccy, n]) => `${n} ${ccy}`).join(", ")}), ${noTouch} sans deux côtés. Écrit dans aqse-touch.json. Londres ${now.clock}.`
);
