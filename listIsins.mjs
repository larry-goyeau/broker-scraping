// A broker that prints no ISIN still names a ticker and a place. The stock
// and ETF lists are that pair: one code is the row's ISIN, several on the
// same place stay in `matches`. An American line whose place is empty in
// the lists keeps the code when the lists file it on exactly one other
// American place. Arca is AMEX there, and FSMOne writes NYSE for it.

import { stampIsinMatches } from "./isinMatches.mjs";
import { resolveVenue } from "./spreads/venues.mjs";
import fs from "node:fs";

const EQUITY = new Set(["STOCK", "ETF", "ETN", "ETC"]);
const US_MICS = new Set(["XNAS", "ARCX", "XNYS", "XASE", "BATS"]);

let ready = null;

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function listKeys(ticker) {
  const text = String(ticker || "").trim().toUpperCase();
  const keys = new Set([text]);
  if (/^\d{1,6}$/.test(text)) {
    keys.add(text.padStart(6, "0"));
    keys.add(text.replace(/^0+/, "") || "0");
  }
  return [...keys];
}

function load() {
  if (ready) return ready;
  const book = new Map();
  const places = new Set();
  for (const file of ["assets/etfs.csv", "assets/stocks.csv"]) {
    const csvPath = new URL(file, import.meta.url);
    if (!fs.existsSync(csvPath)) continue;
    for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const columns = line.split(",");
      const ticker = String(columns[0] || "").trim().toUpperCase().split(":").pop();
      const place = String(columns[1] || "").trim().toUpperCase();
      const isin = isinOf(columns[2]);
      if (!ticker || !place || !isin) continue;
      places.add(place);
      const key = `${place}|${ticker}`;
      if (!book.has(key)) book.set(key, new Set());
      book.get(key).add(isin);
    }
  }
  const byMic = new Map();
  for (const place of places) {
    const { venue } = resolveVenue({ exchange: place });
    if (!venue) continue;
    if (!byMic.has(venue.mic)) byMic.set(venue.mic, []);
    byMic.get(venue.mic).push(place);
  }
  const usPlaces = [...US_MICS].flatMap((mic) => byMic.get(mic) || []);
  ready = { book, byMic, usPlaces };
  return ready;
}

function grouped(places, ticker) {
  const { book } = load();
  const groups = new Map();
  for (const key of listKeys(ticker)) {
    for (const place of places) {
      const ids = book.get(`${place}|${key}`);
      if (!ids) continue;
      if (!groups.has(place)) groups.set(place, new Set());
      for (const isin of ids) groups.get(place).add(isin);
    }
  }
  return groups;
}

function pack(groups, ticker) {
  const ids = new Set([...groups.values()].flatMap((set) => [...set]));
  if (!ids.size) return null;
  if (ids.size === 1) return { isin: [...ids][0] };
  const held = { ticker };
  stampIsinMatches(held, groups, ticker);
  return held.matches ? { matches: held.matches } : null;
}

// One American place in the lists is that line, even when the broker
// spelled another American place. Two places would be two shares.
function american(ticker, named) {
  const direct = pack(grouped(named, ticker), ticker);
  if (direct) return direct;
  const { usPlaces } = load();
  const wide = grouped(usPlaces, ticker);
  if (wide.size !== 1) return null;
  return pack(wide, ticker);
}

export function listIdentity(row) {
  const type = String(row?.type || "").toUpperCase();
  if (!EQUITY.has(type)) return null;
  if (String(row.isin || "").trim() || (row.matches || []).length) return null;
  const ticker = String(row.ticker || "").trim().toUpperCase();
  if (!ticker) return null;
  const { venue, unsourced } = resolveVenue({ exchange: row.exchange, currency: row.currency });
  const { byMic, usPlaces } = load();
  if (venue && US_MICS.has(venue.mic)) return american(ticker, byMic.get(venue.mic) || []);
  if (unsourced?.match?.includes("us")) {
    const wide = grouped(usPlaces, ticker);
    if (wide.size !== 1) return null;
    return pack(wide, ticker);
  }
  if (!venue) return null;
  return pack(grouped(byMic.get(venue.mic) || [], ticker), ticker);
}

export function fillListIsins(rows) {
  if (!Array.isArray(rows)) return 0;
  let filled = 0;
  for (const row of rows) {
    const found = listIdentity(row);
    if (!found) continue;
    if (found.isin) row.isin = found.isin;
    else row.matches = found.matches;
    filled += 1;
  }
  return filled;
}
