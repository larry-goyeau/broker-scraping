// For each place the front shows, the instrument names that sit on that place
// at every broker which lists it. No shared ISIN (or ticker) → an empty list.
//
//   node places.mjs
//
// Writes `parsed_json/places.json`.

import fs from "node:fs";
import path from "node:path";
import { catalogueFiles } from "./catalogues.mjs";
import { resolveVenue } from "./venues.mjs";

const UNSOURCED_EN = {
  "Euronext, place non précisée": "Euronext",
  "places américaines, sans précision": "US (unspecified)",
  "ATS canadiennes": "Canadian ATS",
  "B3 São Paulo": "B3 São Paulo",
  B3: "B3 São Paulo",
  "TSE (Toronto ou Tokyo)": "TSE (Toronto or Tokyo)",
};

function displayExchange(raw, extra = {}) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const { venue, unsourced } = resolveVenue({ exchange: text, ...extra });
  if (venue) return venue.name;
  if (unsourced?.name) return UNSOURCED_EN[unsourced.name] || unsourced.name;
  return text;
}

function instrumentKey(row) {
  const type = String(row.type || "").trim().toUpperCase() || "OTHER";
  const isin = String(row.isin || "").trim().toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return isin;
  const ticker = String(row.ticker || row.query || "").trim().toUpperCase();
  if (!ticker) return "";
  return `${type}:${ticker}`;
}

function pickName(counts) {
  let best = "";
  let bestN = -1;
  for (const [name, n] of counts) {
    if (n > bestN || (n === bestN && (name.length < best.length || (name.length === best.length && name.localeCompare(best, "en") < 0)))) {
      best = name;
      bestN = n;
    }
  }
  return best;
}

const byPlace = new Map();

for (const file of catalogueFiles()) {
  const broker = path.basename(path.dirname(file));
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.instruments || [];
  for (const row of rows) {
    if (String(row.type || "").toUpperCase() === "CRYPTO") continue;
    const raw = String(row.exchange || "").trim();
    if (!raw) continue;
    const place = displayExchange(raw, { currency: row.currency, isin: row.isin });
    if (!place) continue;
    const key = instrumentKey(row);
    if (!key) continue;
    const name = String(row.name || row.label || "").trim();
    let brokers = byPlace.get(place);
    if (!brokers) {
      brokers = new Map();
      byPlace.set(place, brokers);
    }
    let keys = brokers.get(broker);
    if (!keys) {
      keys = new Map();
      brokers.set(broker, keys);
    }
    let counts = keys.get(key);
    if (!counts) {
      counts = new Map();
      keys.set(key, counts);
    }
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
}

const places = {};
for (const place of [...byPlace.keys()].sort((a, b) => a.localeCompare(b, "en"))) {
  const perBroker = [...byPlace.get(place).values()];
  let shared = new Set(perBroker[0].keys());
  for (const keys of perBroker.slice(1)) {
    for (const key of shared) if (!keys.has(key)) shared.delete(key);
  }
  const names = new Set();
  for (const key of shared) {
    const counts = new Map();
    for (const keys of perBroker) {
      const votes = keys.get(key);
      if (!votes) continue;
      for (const [name, n] of votes) counts.set(name, (counts.get(name) || 0) + n);
    }
    const name = pickName(counts);
    if (name) names.add(name);
  }
  places[place] = [...names].sort((a, b) => a.localeCompare(b, "en"));
}

const out = new URL("parsed_json/places.json", import.meta.url);
fs.mkdirSync(new URL("parsed_json/", import.meta.url), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ generatedAt: new Date().toISOString(), places }, null, 2) + "\n"
);

const empty = Object.values(places).filter((n) => !n.length).length;
const named = Object.values(places).reduce((n, list) => n + list.length, 0);
console.error(
  `${Object.keys(places).length} places, ${named} noms, ${empty} sans intersection → ${out.pathname}`
);
