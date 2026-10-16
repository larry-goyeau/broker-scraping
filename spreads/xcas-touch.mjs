// Casablanca cash touch. Bid and ask are the exchange's own live
// page: achat and vente. A last trade is never written in their
// place. The board is dirhams. A catalogue line in another currency
// gets that ratio when the name has no second book. The dirham line
// is stored even when no broker files it.
//
// Continuous trading runs after the 09:30 opening fixing until 15:20.
// Outside that window nothing is written. The reading is
// xcas-touch.json. spread.mjs copies it into spread.json
// (`--only=xcas-touch`).
//
//   node spreads/xcas-touch.mjs

import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const exec = promisify(execFile);
const STORE = fileURLToPath(new URL("./xcas-touch.json", import.meta.url));
const PAGE = "https://www.casablanca-bourse.com/live-market/actions";
const CASA = new Set(["casablanca", "xcas", "csema", "boursedecasablanca"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC", "REIT", "FUND"]);

const casablanca = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Casablanca",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
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

const canRead = (at) => at?.day && at.minutes >= 9 * 60 + 30 && at.minutes < 15 * 60 + 20;

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

async function page() {
  const { stdout } = await exec(
    "curl",
    ["-fsSL", "--max-time", "45", "-A", "Mozilla/5.0", PAGE],
    { maxBuffer: 8_000_000, encoding: "utf8" }
  );
  const match = stdout.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">(.*?)<\/script>/s);
  if (!match) throw new Error("page live de Casablanca sans carnet");
  const rows = JSON.parse(match[1])?.live_market?.actions;
  if (!Array.isArray(rows) || !rows.length) throw new Error("carnet de Casablanca vide");
  return rows;
}

function listings() {
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!CASA.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const code = String(row.ticker || "").trim().toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!code || !/^MA[A-Z0-9]{10}$/.test(isin)) continue;
    const job = byCode.get(code) || { code, isins: new Map() };
    const currencies = job.isins.get(isin) || new Set();
    if (/^[A-Z]{3}$/.test(currency)) currencies.add(currency);
    job.isins.set(isin, currencies);
    byCode.set(code, job);
  }
  const jobs = new Map();
  let tied = 0;
  for (const job of byCode.values()) {
    if (job.isins.size !== 1) {
      tied += 1;
      continue;
    }
    const [isin, currencies] = [...job.isins.entries()][0];
    jobs.set(job.code, { code: job.code, isin, currencies });
  }
  return { jobs, tied };
}

const now = casablanca();
if (!canRead(now)) {
  console.error(`hors séance, Casablanca ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

const { jobs, tied } = listings();
console.error(`Casablanca ${now.clock}. ${jobs.size} codes, ${tied} codes à ISIN partagé laissés de côté.`);
const rows = await page();
const found = [];
let noBook = 0;
let suspended = 0;
let missing = 0;
for (const row of rows) {
  const code = String(row.symbol || "").trim().toUpperCase();
  const job = jobs.get(code);
  if (!job) {
    missing += 1;
    continue;
  }
  const status = String(row.statut?.fr || row.statut || "").toUpperCase();
  if (status === "S") {
    suspended += 1;
    continue;
  }
  const bid = Number(row.achat?.prix);
  const ask = Number(row.vente?.prix);
  const bp = bpFrom(bid, ask);
  if (bp == null) {
    noBook += 1;
    continue;
  }
  const last = Number(row.dernierCours);
  found.push({
    isin: job.isin,
    mic: "XCAS",
    code,
    bid,
    ask,
    ...(last > 0 ? { last } : {}),
    bp,
    currencies: [...new Set(["MAD", ...job.currencies])].sort(),
    stamp: `${now.date} ${now.clock}`,
    url: PAGE,
  });
}

found.sort((a, b) => a.code.localeCompare(b.code));
if (!found.length) {
  console.error(`aucune touche. ${noBook} sans deux côtés, ${suspended} suspendus, ${missing} hors catalogue.`);
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), date: now.date, clock: now.clock, rows: found, noBook, suspended, missing, tied }, null, 2)
);
console.error(`${STORE} : ${found.length} touches. ${noBook} sans deux côtés, ${suspended} suspendus, ${missing} hors catalogue.`);
