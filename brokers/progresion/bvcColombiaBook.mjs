// The whole equity book of the Bolsa de Valores de Colombia (BVC, MIC XBOG),
// shared by the scrapers of the Colombian brokers whose catalogue is the
// whole exchange (brokers/progresion first).
//
// The BVC has two equity segments, both quoted in pesos (COP):
// - the local market ("mercado local", board EQTY): Colombian shares,
//   preferred shares, the local ETFs (iShares COLCAP, Global X Colombia
//   Select, Global X TES, BTG Pactual TEVA) and the PEI real-estate trust;
// - the Mercado Global Colombiano (board MGC): foreign shares and ETFs a
//   sponsor has listed on the BVC, traded in pesos on the BVC itself.
// Each row says which segment it is on (row.segment, and in raw).
//
// Source: the BVC's own public website API (rest.bvc.com.co, the one behind
// https://www.bvc.com.co/mercado-local-en-linea). Every call first takes a
// one-use token from https://www.bvc.com.co/api/handshake.
// - market-information/rv/lvl-2 (board EQTY, then MGC) for the last trading
//   day: every line enabled on the board, traded or not. The board is empty
//   while the market is closed, so the module walks back from today to the
//   last day with a board.
// - market-information/rv/lvl-3/summary?filters[marketDataRv][symbol]=X: the
//   line's ISIN (isIn), CFI, status (Activo / Inactivo / Suspendido) and last
//   trade time (lastNegotiation).
// - market-information/rv/lvl-3/issuer-type/X: the issuer's sheet, whose
//   mnemonics list gives each line's security type (CS, PS, ETF, FUND, SR).
// Nothing is cached: a suspension shows on the next run.
//
// Left out (rows.report says which lines, and why):
// - Suspended lines: status "Suspendido". On 2026-10-25 that was 32 lines,
//   among them Bancolombia's old BCOLOMBIA and PFBCOLOM (replaced by
//   Grupo Cibest's CIBEST and PFCIBEST), PFGBOLIVAR and every SD*, SU*, IN*,
//   MD*, DA* and DH* side line.
// - Never-traded and dormant lines: no trade on the BVC at all, or none in
//   the last 365 days (`dormantDays`). "Inactivo" alone is not a removal:
//   the BVC sets it on a line with no trade in the last month or so (Banco
//   Popular, El Cóndor, Protección, several MGC ETFs), and those lines still
//   trade, mostly by auction. On 2026-10-25 this dropped Caracol TV,
//   Colombina, Coltel, Mayagüez, Riopaila, the AV Villas preferred series,
//   Fondo Ganadero del Tolima, Gibraltar, Summit Materials (taken over in
//   2025) and the MGC lines no one has traded yet (the ARK ETFs, Credicorp,
//   most Chilean and Peruvian shares). A broker whose own list names one of
//   them passes it in `keep`.
// - Subscription rights (security type SR, CFI R…, mnemonic DH…).
// The BVC lists no ETN. A physical-metal ETC on MGC (Invesco Physical Gold,
// SGLDCO) is typed ETC. Closed-end vehicles that trade on the board are
// typed FUND (the BVC's own security type): PEI and TIN, the real-estate
// participation titles of Patrimonio Estrategias Inmobiliarias and
// Titularizadora Colombiana, and Compass DVA Silicon Fund on MGC. A broker
// that sells shares and ETFs only drops them.
//
// ISIN: the summary's isIn, checked (check digit, no BVC placeholder like
// COVIRT…). The BVC often writes "A" as the third character of a foreign
// ISIN (CLA000000100 for CL0000000100); that character is put back when
// only one fits the check digit or the shared lists know it. Otherwise
// assets/stocks.csv and etfs.csv (exchange BVC, by ticker) fill a missing or
// wrong one (Southern Copper: the BVC has US14265V1052, the right one is
// US84265V1052; Falabella, whose wrong CLA3880F1082 passes the check digit).
// MGC lines carry the foreign ISIN (AAPLCO -> US0378331005). Name: for an
// ETF or ETC the name in assets/etfs.csv for that ISIN (the board names the
// JPMorgan UCITS ETFs "JP MORGAN CHASE & CO"), else the board's issuer name,
// else the issuer sheet's name.
//
// Run time: three calls per line, about 8 to 10 minutes for ~260 lines.
//
//   https://www.bvc.com.co/mercado-local-en-linea
//   https://www.bvc.com.co/renta-variable-mercado-local/ECOPETROL
//   https://www.bvc.com.co/listado-de-emisores-mercado-local
//   https://www.bvc.com.co/listado-de-emisores-mercado-global
//
// Use:
//   import { bvcColombiaBook } from "../progresion/bvcColombiaBook.mjs";
//   const rows = await bvcColombiaBook();                        // both segments
//   const rows = await bvcColombiaBook({ segments: ["EQTY"] });  // local market only
//   const rows = await bvcColombiaBook({ keep: ["CARACOLTV"] }); // keep a dormant line
//   rows.report                                                  // what was left out, and why
// Test:
//   node brokers/progresion/bvcColombiaBook.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://www.bvc.com.co";
const REST = "https://rest.bvc.com.co/market-information/rv";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
export const EXCHANGE = "BVC";
export const MIC = "XBOG";
export const SEGMENTS = ["EQTY", "MGC"];
const FLOOR = { EQTY: { board: 80, book: 50 }, MGC: { board: 60, book: 40 } };
const MUST = { EQTY: ["ECOPETROL", "CIBEST", "PFCIBEST", "GEB", "ICOLCAP"], MGC: ["AAPLCO"] };
const PLACEHOLDER = /^CO(?:VIRT|VIR0|000VIR)/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function isinValid(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = isin.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

async function token() {
  const url = `${ORIGIN}/api/handshake?ts=${Date.now()}&r=${Math.random().toString(36).slice(2)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`BVC handshake ${response.status}`);
  const body = await response.json();
  if (!body?.token) throw new Error("BVC handshake returned no token");
  return body.token;
}

// One GET on rest.bvc.com.co. `filters` is the query string; the site sends
// it base64-encoded in the k header next to a fresh token.
async function get(path, filters = "", pause = 250) {
  let last;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await sleep(pause * (attempt + 1));
      const response = await fetch(`${REST}/${path}${filters ? `?${filters}` : ""}`, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Origin: ORIGIN,
          Referer: `${ORIGIN}/`,
          token: await token(),
          k: Buffer.from(filters).toString("base64"),
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 401 || response.status === 429 || response.status >= 500) {
        last = new Error(`BVC ${path} answered ${response.status}`);
        continue;
      }
      if (!response.ok) throw new Error(`BVC ${path} ${filters} answered ${response.status}`);
      const body = await response.json();
      if (!body || typeof body !== "object" || !("data" in body)) throw new Error(`BVC ${path} sent no data`);
      return body.data;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

const day = (date) => date.toISOString().slice(0, 10);

// The board of the last trading day, walking back from today (Bogotá time).
async function lastBoard(board, from, pause) {
  const start = from ? new Date(`${from}T12:00:00Z`) : new Date(Date.now() - 5 * 3600_000);
  for (let back = 0; back < 12; back += 1) {
    const date = new Date(start.getTime() - back * 86_400_000);
    const data = await get("lvl-2", `filters[marketDataRv][tradeDate]=${day(date)}&filters[marketDataRv][board]=${board}`, pause);
    if (Array.isArray(data?.tab) && data.tab.length) return { date: day(date), tab: data.tab };
  }
  throw new Error(`no BVC ${board} board in the last 12 days`);
}

// ISIN -> name, and BVC ticker -> ISIN, from the shared lists.
function sharedLists() {
  const names = new Map();
  const byTicker = new Map();
  const known = new Set();
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const text = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = /^([^,]*),([^,]*),([A-Z0-9]{12}),(.*)$/.exec(line);
      if (!match) continue;
      const [, key, exchange, isin, rawName] = match;
      const name = clean(rawName.replace(/^"|"$/g, "").replace(/""/g, '"'));
      known.add(isin);
      if (file === "etfs.csv" && !names.has(isin)) names.set(isin, name);
      if (exchange === "BVC") byTicker.set(key.replace(/^BVC:/, ""), isin);
    }
  }
  return { names, byTicker, known };
}

// The BVC writes an "A" for the third character of many foreign ISINs
// (CLA000000100 for Cencosud's CL0000000100, PEA214001005 for Alicorp's
// PEP214001005, BMA2519Y1084 for Credicorp's BMG2519Y1084). Put back the
// character that makes the check digit right: one the shared lists know,
// else the only digit or P that fits.
function repairIsin(isin, known) {
  if (!/^[A-Z]{2}A[A-Z0-9]{8}\d$/.test(isin)) return "";
  const fits = [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
    .map((char) => `${isin.slice(0, 2)}${char}${isin.slice(3)}`)
    .filter((candidate) => isinValid(candidate));
  const listed = fits.filter((candidate) => known.has(candidate));
  if (listed.length === 1) return listed[0];
  const plain = fits.filter((candidate) => /[0-9P]/.test(candidate[2]));
  return plain.length === 1 ? plain[0] : "";
}

function kindOf(securityType, issuer, name, cfi) {
  if (securityType === "SR" || /^R/.test(cfi)) return null;
  if (securityType === "ETF") return /\bETC\b|physical (?:gold|silver|platinum|palladium)/i.test(name) ? "ETC" : "ETF";
  if (securityType === "FUND") return "FUND";
  if (securityType === "CS" || securityType === "PS") {
    return /fondo de inversi[oó]n|\bfund\b/i.test(name) ? "FUND" : "STOCK";
  }
  // No security type on the issuer sheet (Credicorp, Summit): its flags, then the CFI.
  if (issuer?.isETF === true || issuer?.isFundOrETF === "Y" || /^CE|^EU/.test(cfi)) return "ETF";
  if (/^CI/.test(cfi)) return "FUND";
  if (/^E/.test(cfi) || issuer?.isFundOrETF === "N") return "STOCK";
  return undefined;
}

export async function bvcColombiaBook({
  segments = SEGMENTS,
  keep = [],
  dormantDays = 365,
  date = "",
  pause = 250,
  quiet = false,
} = {}) {
  const kept = new Set(keep.map((ticker) => ticker.toUpperCase()));
  const { names, byTicker, known } = sharedLists();
  const report = { boards: {}, suspended: [], dormant: [], rights: [], unknown: [], noIsin: [], mismatched: [], repaired: [] };
  const rows = [];
  const issuers = new Map(); // mnemonic -> issuer sheet
  const now = Date.now();

  for (const board of segments) {
    if (!SEGMENTS.includes(board)) throw new Error(`unknown BVC segment ${board}`);
    const { date: tradeDate, tab } = await lastBoard(board, date, pause);
    report.boards[board] = { date: tradeDate, lines: tab.length };
    if (tab.length < FLOOR[board].board) throw new Error(`BVC ${board} board has only ${tab.length} lines`);
    const before = rows.length;
    const seen = new Set();
    for (const line of tab) {
      const ticker = clean(line.mnemonic).toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      if (/^DH/.test(ticker)) {
        report.rights.push(ticker);
        continue;
      }
      const summary = await get("lvl-3/summary", `filters[marketDataRv][symbol]=${encodeURIComponent(ticker)}`, pause);
      const info = (summary?.information || []).find((item) => clean(item.mnemonic).toUpperCase() === ticker) || summary?.information?.[0];
      if (!info) throw new Error(`the BVC summary of ${ticker} has no information block`);
      const status = clean(info.status?.es);
      const cfi = clean(info.cfi);
      if (status === "Suspendido") {
        report.suspended.push(ticker);
        continue;
      }
      if (status !== "Activo" && status !== "Inactivo") throw new Error(`${ticker} has an unknown BVC status "${status}"`);
      const lastTrade = clean(summary?.pricesAndVolumes?.lastNegotiation);
      const age = lastTrade ? (now - Date.parse(lastTrade)) / 86_400_000 : Infinity;
      if (age > dormantDays && !kept.has(ticker)) {
        report.dormant.push(`${ticker} ${lastTrade ? lastTrade.slice(0, 10) : "never"}`);
        continue;
      }

      let issuer = issuers.get(ticker);
      if (!issuer) {
        issuer = await get(`lvl-3/issuer-type/${encodeURIComponent(ticker)}`, "", pause);
        for (const item of issuer?.mnemonics || []) issuers.set(clean(item.symbol).toUpperCase(), issuer);
        issuers.set(ticker, issuer);
      }
      const securityType = clean((issuer?.mnemonics || []).find((item) => clean(item.symbol).toUpperCase() === ticker)?.securityType);

      const sheetIsin = clean(info.isIn).toUpperCase();
      let isin = sheetIsin;
      if (PLACEHOLDER.test(isin)) isin = "";
      else if (!isinValid(isin)) isin = repairIsin(isin, known);
      const listed = byTicker.get(ticker) || byTicker.get(ticker.replace(/CO$/, ""));
      // An "A" third character can also pass the check digit by chance
      // (Falabella: CLA3880F1082 on the BVC, CLP3880F1085 in fact): there
      // the shared list's ISIN wins.
      if (listed && isinValid(listed) && (!isin || (isin === sheetIsin && sheetIsin[2] === "A" && listed !== isin))) isin = listed;
      else if (isin && listed && listed !== isin) report.mismatched.push(`${ticker} ${isin}/${listed}`);
      if (isin && isin !== sheetIsin) report.repaired.push(`${ticker} ${sheetIsin || "-"}>${isin}`);
      if (!isin) report.noIsin.push(ticker);

      const boardName = clean(line.issuer);
      const issuerName = clean(issuer?.issuerName);
      const type = kindOf(securityType, issuer, `${boardName} ${issuerName} ${names.get(isin) || ""}`, cfi);
      if (type === null) {
        report.rights.push(ticker);
        continue;
      }
      if (!type) {
        report.unknown.push(`${ticker} ${securityType || "-"} ${cfi || "-"}`);
        continue;
      }
      const name = ((type === "ETF" || type === "ETC") && names.get(isin)) || boardName || issuerName || ticker;
      rows.push({
        query: isin || ticker,
        ticker,
        name,
        exchange: EXCHANGE,
        mic: MIC,
        currency: "COP",
        type,
        ...(isin ? { isin } : {}),
        segment: board,
        raw: [ticker, name, board, securityType || cfi, status, `last trade ${lastTrade ? lastTrade.slice(0, 10) : "-"}`].join(" | "),
      });
    }
    const got = rows.slice(before);
    if (got.length < FLOOR[board].book) throw new Error(`only ${got.length} BVC ${board} lines kept`);
    for (const ticker of MUST[board]) if (!got.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing from the BVC ${board} book`);
  }
  if (report.unknown.length) throw new Error(`BVC lines of unknown type: ${report.unknown.join(", ")}`);
  rows.sort((left, right) => left.segment.localeCompare(right.segment) || left.ticker.localeCompare(right.ticker));

  const count = (list) => {
    const byType = new Map();
    for (const row of list) byType.set(row.type, (byType.get(row.type) || 0) + 1);
    return [...byType].map(([type, n]) => `${n} ${type}`).join(", ");
  };
  const text =
    segments.map((board) => {
      const list = rows.filter((row) => row.segment === board);
      return `BVC ${board} (${report.boards[board].date}, ${report.boards[board].lines} lines): ${list.length} kept (${count(list)}), ${list.filter((row) => row.isin).length} ISINs.`;
    }).join(" ") +
    ` Suspended: ${report.suspended.join(", ") || "none"}.` +
    ` Dormant (no trade in ${dormantDays} days): ${report.dormant.join(", ") || "none"}.` +
    ` Rights: ${report.rights.join(", ") || "none"}.` +
    (report.noIsin.length ? ` No ISIN: ${report.noIsin.join(", ")}.` : "") +
    (report.repaired.length ? ` ISIN fixed: ${report.repaired.join(", ")}.` : "") +
    (report.mismatched.length ? ` stocks.csv disagrees on ${report.mismatched.join(", ")}.` : "");
  if (!quiet) console.error(text);
  Object.defineProperty(rows, "report", { value: { ...report, text }, enumerable: false });
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await bvcColombiaBook();
  console.log(JSON.stringify(rows.slice(0, 2), null, 2));
  if (process.argv.includes("--dump")) {
    const out = process.argv[process.argv.indexOf("--dump") + 1];
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  }
}
