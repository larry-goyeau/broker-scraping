// Amman cash touch. Bid and ask are the best bid and best ask the
// exchange's daily bulletin prints for the last session (spreads/ase.mjs):
// the book as the session left it, not a reading taken during continuous
// trading. A last trade is never written in their place. The board is
// dinars.
//
// The bulletin covers the shares traded in that session; a share that did
// not trade is not on it and keeps no touch. The reading is ase-touch.json,
// dated with the bulletin's session. spread.mjs copies it into spread.json
// (`--only=ase-touch`).
//
//   node spreads/ase-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";
import { ASE_BULLETIN, readAseBulletin } from "./ase.mjs";

const STORE = fileURLToPath(new URL("./ase-touch.json", import.meta.url));
const AMMAN = new Set(["xamm", "amman", "ammanstockexchange"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC", "REIT", "FUND"]);

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function listings() {
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!AMMAN.has(norm(row.exchange)) && String(row.mic || "").toUpperCase() !== "XAMM") continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const code = String(row.ticker || "").trim().toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (!code || !/^JO[A-Z0-9]{10}$/.test(isin)) continue;
    const isins = byCode.get(code) || new Set();
    isins.add(isin);
    byCode.set(code, isins);
  }
  const jobs = new Map();
  let tied = 0;
  for (const [code, isins] of byCode) {
    if (isins.size !== 1) {
      tied += 1;
      continue;
    }
    jobs.set(code, [...isins][0]);
  }
  return { jobs, tied };
}

const { jobs, tied } = listings();
const { date, rows } = await readAseBulletin();
const found = [];
let noBook = 0;
let missing = 0;
for (const row of rows) {
  const isin = jobs.get(row.symbol);
  if (!isin) {
    missing += 1;
    continue;
  }
  const bp = bpFrom(row.bid, row.ask);
  if (bp == null) {
    noBook += 1;
    continue;
  }
  found.push({
    isin,
    mic: "XAMM",
    code: row.symbol,
    bid: row.bid,
    ask: row.ask,
    ...(row.close > 0 ? { last: row.close } : {}),
    bp,
    currencies: ["JOD"],
    stamp: `${date} close`,
    url: ASE_BULLETIN,
  });
}

found.sort((a, b) => a.code.localeCompare(b.code));
if (!found.length) {
  console.error(`aucune touche. ${noBook} sans deux côtés, ${missing} hors catalogue.`);
  process.exit(1);
}

fs.writeFileSync(STORE, JSON.stringify({ at: new Date().toISOString(), date, rows: found, noBook, missing, tied }, null, 2));
console.error(`${STORE} : ${found.length} touches, séance du ${date}. ${noBook} sans deux côtés, ${missing} hors catalogue, ${tied} codes à ISIN partagé.`);
