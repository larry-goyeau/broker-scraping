// What Nación Bursátil sells in Buenos Aires shares and CEDEARs, with no
// login. Nación Bursátil S.A. (Grupo BNA) is an agent of BYMA (ALyC y AN
// integral n° 26 CNV). The "Cotizaciones" menu of its site reads its own
// public API, one list per BYMA panel: AccionesLideres (the leader panel),
// PanelGeneral (the general panel) and Cedears (every CEDEAR, ETF
// certificates such as SPY, QQQ and IBIT included), zero-volume symbols
// included. Its Home Broker manual names the same panels (LIDER, GENERAL,
// CEDEARS) as where orders are placed. Those three lists are the
// catalogue; bonds, letras, obligaciones negociables and options are other
// lists. The API sometimes answers an empty Cedears list for a while (seen
// on 2026-10-21 in the afternoon); an empty list is asked again, then read
// from nacionbursatil-cache.json, the last full answer, kept in this folder.
//   https://nacionbursatil.com.ar/assets/pdf/ManualdeusuarioHomeBroker.pdf
//
// The lists name the peso line of each title only (GGAL, AAPL, SPY). Nación
// Bursátil takes and keeps dollars: its fee table lists "Transferencias
// recepción-emisión en cuentas locales ($ y U$S) Sin Cargo" and
// "Liquidaciones por Dólar Cable (por transacción) Hasta U$S 50". So, as
// the source gives no currency per title, each title also gets the dollar
// lines BYMA quotes for it: its MEP line (D: GGALD, AAPLD, GOGLD for
// GOOGL) and its cable line (C: GGALC, AAPLC, GOGLC), each written only
// when BYMA's species card prints the ISIN of a listed peso line.
//   https://nacionbursatil.com.ar/assets/pdf/Tabla-de-Aranceles-y-Comisiones-2025_aprobados-Directorio-09-04-2025.pdf
//
// Currency, type and ISIN come from BYMA's open data (../comafi/byma.mjs,
// shared with brokers/comafi and brokers/gio): a symbol BYMA no longer
// quotes, a block line (GGALB) and a kind that is not a share, a CEDEAR or
// an ADR are not written, nor a line with no trade today on BYMA that
// BYMA's history shows no trade on in two years. A bid, an offer or a
// previous close is not a market: BYMA and Nación's own lists carry
// placeholder quotes on dead lines (read 2026-10-22: HARGD previous close
// 0.008, ADS bid 0.01; no day of volume in two years), so every line with
// no trade today, the dollar lines added above included, is looked up.
// Of two lines of one certificate, currency and settlement only the newer
// BYMA instrument is written (SCCOD kept, the legacy SCOOD not).
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   https://new-nacion-bursatil-institucional-api.azurewebsites.net/api/AccionesLideres
//   https://new-nacion-bursatil-institucional-api.azurewebsites.net/api/PanelGeneral
//   https://new-nacion-bursatil-institucional-api.azurewebsites.net/api/Cedears
//   https://open.bymadata.com.ar/
//
//   node brokers/nacionbursatil/nacionbursatil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBoard, bymaRows, clean, expectLine, getText, pause, summary } from "../comafi/byma.mjs";

const API = "https://new-nacion-bursatil-institucional-api.azurewebsites.net/api/";
const LISTS = [
  { name: "AccionesLideres", floor: 15 },
  { name: "PanelGeneral", floor: 60 },
  { name: "Cedears", floor: 450 },
];

// The API sometimes answers an empty list for a while. An empty answer is
// asked again; when it stays empty, the last full answer, kept in
// nacionbursatil-cache.json in this folder, is read instead.
const CACHE = new URL("nacionbursatil-cache.json", import.meta.url);
const CACHE_DAYS = 30;
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : { lists: {} };

async function readList(name) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const text = await getText(`${API}${name}`, { Referer: "https://nacionbursatil.com.ar/" });
    // The API answers a JSON string that holds the JSON list.
    let lines = JSON.parse(text);
    if (typeof lines === "string") lines = JSON.parse(lines);
    if (!Array.isArray(lines)) throw new Error(`${name} is not a list`);
    if (lines.length) return { lines, from: "API" };
    await pause(15_000);
  }
  const kept = cache.lists[name];
  if (!kept?.lines?.length) throw new Error(`${name} stayed empty and has no cache`);
  const age = (Date.now() - Date.parse(kept.savedOn)) / 86_400_000;
  if (age > CACHE_DAYS) throw new Error(`${name} stayed empty and its cache is ${Math.round(age)} days old`);
  return { lines: kept.lines, from: `cache ${kept.savedOn}` };
}

const entries = [];
for (const list of LISTS) {
  const { lines, from } = await readList(list.name);
  for (const line of lines) {
    const symbol = clean(line.Especie).toUpperCase();
    if (!/^[A-Z0-9.]+$/.test(symbol)) throw new Error(`${list.name} has symbol ${line.Especie}`);
    // A price today: a trade, a bid, an offer or the previous close.
    const live = from === "API" && [line.Ult_Pre, line.PC, line.PV, line.Anterior].some((value) => Number(value) > 0);
    entries.push({ symbol, live, raw: [list.name, symbol, `plazo ${line.Plazo}`].join(" | ") });
  }
  console.error(`${list.name}: ${lines.length} lines (${from})`);
  if (lines.length < list.floor) throw new Error(`${list.name} has only ${lines.length} lines`);
  if (from === "API") {
    cache.lists[list.name] = {
      savedOn: new Date().toISOString().slice(0, 10),
      lines: lines.map(({ Especie, Plazo, Ult_Pre, Anterior }) => ({ Especie, Plazo, Ult_Pre, Anterior })),
    };
  }
  await pause(400);
}
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

// The dollar lines of each listed title: every BYMA symbol in dollars
// ending in D or C (GGALD, AAPLC, and GOGLD for GOOGL, TECOD for TECO2) is
// looked up, and kept only when BYMA's species card gives it the ISIN of a
// listed peso line.
const listed = new Set(entries.map((entry) => entry.symbol));
const board = await bymaBoard();
const dollarLines = new Set();
for (const [symbol, line] of board) {
  if (line.currency !== "USD" || listed.has(symbol) || !/[CD]$/.test(symbol)) continue;
  dollarLines.add(symbol);
  entries.push({ symbol, live: false, raw: `BYMA dollar line | ${symbol}` });
}
console.error(`${dollarLines.size} BYMA dollar lines looked up`);

const { rows: all, dropped } = await bymaRows(entries, "Nación Bursátil", { cable: true });

const pesoIsins = new Set(all.filter((row) => !dollarLines.has(row.ticker) && row.isin).map((row) => row.isin));
let others = 0;
const rows = all.filter((row) => {
  if (!dollarLines.has(row.ticker)) return true;
  if (row.isin && pesoIsins.has(row.isin)) return true;
  others += 1;
  return false;
});
console.error(`${rows.filter((row) => dollarLines.has(row.ticker)).length} dollar lines kept; ${others} dollar lines of titles not listed left out`);

expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
expectLine(rows, "GGALD", "USD", "STOCK", "ARP495251018");
expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLD", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLC", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
expectLine(rows, "SPYD", "USD", "ETF", "ARCAVA460131");
for (const block of ["GGALB", "AAPLB", "ALUAB"]) {
  if (rows.some((row) => row.ticker === block)) throw new Error(`the block line ${block} was kept`);
}
const local = rows.filter((row) => row.panel === "local");
const cedears = rows.filter((row) => row.panel === "cedear");
if (local.length < 90) throw new Error(`Buenos Aires shares were short: ${local.length}`);
if (cedears.length < 900) throw new Error(`CEDEARs were short: ${cedears.length}`);
if (cedears.filter((row) => row.type === "ETF").length < 100) throw new Error("CEDEAR ETFs were short");

summary("Nación Bursátil", rows, dropped);
const kept = rows.map(({ panel, ...row }) => row);
fs.writeFileSync(new URL("nacionbursatil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(kept)), null, 2));
