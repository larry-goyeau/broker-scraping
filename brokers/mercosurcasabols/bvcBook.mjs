// The whole equity book of the Bolsa de Valores de Caracas (BVC), shared by
// the scrapers of the Caracas brokers (Mercosur, Statera, Per Capital).
//
// Source: the BVC's public quote board (get_cotizaciones, the "Cotizaciones
// RV" table of its "Resumen del mercado" page). It prints every equity
// symbol the exchange quotes, with its name and best bid and offer. Each
// symbol's own BVC sheet (getSimbolosDetalle) then gives its ISIN
// (COD_ISIN), its status (ESTATUS) and its currency (MONEDA). The sheet is
// read again on every run, no cache, so a suspension shows at once.
//
// Left out:
// - Suspended lines: a sheet whose ESTATUS is not "ACTIVO" (the BVC writes
//   "INTERRUMPIDO" for a halted line). Halted titles normally drop off the
//   board altogether: on 2026-10-24 the issuer list (listadoEmisoras +
//   titulosEmisoras, read with { sweep: true }) named ABC.B, RSB.O, INV,
//   SV.A and SV.B as INTERRUMPIDO and BAA (Bancamiga) and EVI.B with no
//   sheet at all, none of them on the board.
// - Dormant lines: no trade in the current year (the sheet's year volume,
//   cur_vol_x_ano_rv, and year price chart, cur_grf_anual_pre_rv, are both
//   empty) and no bid and no offer on the board. On 2026-10-24: CIE, GZL.A
//   and GZL.B (Grupo Zuliano US$ preferred, placeholder price 1), IMP.A and
//   PIV.A. A broker whose own price sheet names one of them passes it in
//   `keep` (Merinvest's sheet prices CIE).
// - Closed-end mutual and private-equity funds: PC-IBC (PER) and
//   Rendivalores (RFM) "fondo mutual de inversión de capital cerrado",
//   Fivenca "fondo de capital privado" A and B. A company named "Fondo …
//   C.A." (Fondo Petrolia, PCP.B) is a corporation and stays.
// The BVC lists no ETF, ETN or ETC: every row is a STOCK.
//
// ISIN: the sheet's COD_ISIN; assets/stocks.csv (BVCV) fills one the sheet
// leaves blank. Currency: MONEDA, Bs -> VES and US$ -> USD. A sheet in any
// other currency, or a board line that does not read, stops the run.
//
//   https://www.bolsadecaracas.com/resumen-mercado/
//   https://www.bolsadecaracas.com/emisoras/
//   POST https://www.bolsadecaracas.com/wp-admin/admin-ajax.php action=get_cotizaciones
//   POST https://www.bolsadecaracas.com/wp-admin/admin-ajax.php?action=getSimbolosDetalle simbolo=…&tipo=rv
//   POST https://www.bolsadecaracas.com/wp-admin/admin-ajax.php action=listadoEmisoras / titulosEmisoras data=COD_EMP
//
// Use:
//   import { bvcBook } from "../mercosurcasabols/bvcBook.mjs";
//   const rows = await bvcBook();                 // active, traded shares
//   const rows = await bvcBook({ keep: ["CIE"] }); // also keep these dormant lines
//   rows.report                                    // what was left out, and why
// Test:
//   node brokers/mercosurcasabols/bvcBook.mjs [--sweep]

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const BVC = "https://www.bolsadecaracas.com";
const AJAX = `${BVC}/wp-admin/admin-ajax.php`;
const BOARD_PAGE = `${BVC}/resumen-mercado/`;
export const EXCHANGE = "Caracas Stock Exchange";
export const MIC = "BVCA";
const FLOOR = { board: 35, book: 28 };
const MUST = ["BVL", "BNC", "MVZ.A", "TDV.D", "BVCC"];
const FUND = /\bFONDO\b|\bFON\.?\s*MUT/i;
const CORPORATION = /\bC\.\s?A\.?(?:\s|,|$)/;
const CURRENCY = { Bs: "VES", "US$.": "USD", US$: "USD" };
const SYMBOL = /^[A-Z]{2,4}(?:\.[A-Z])?$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function post(url, fields, referer = BOARD_PAGE) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Referer: referer,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return JSON.parse(await response.text());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

function bvcvList() {
  const found = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const match = line.match(/^BVCV:([^,]+),BVCV,([A-Z]{2}[A-Z0-9]{9}\d),/);
    if (!match) continue;
    const ticker = match[1].trim().toUpperCase();
    if (!found.has(ticker)) found.set(ticker, []);
    found.get(ticker).push(match[2]);
  }
  return found;
}

// Equity titles of every BVC issuer that are not on the board, with the
// status of their sheet: the exchange's own view of what is halted.
async function offBoard(onBoard, pause) {
  const issuers = await post(AJAX, { action: "listadoEmisoras" }, `${BVC}/emisoras/`);
  if (!Array.isArray(issuers) || issuers.length < 50) throw new Error(`the BVC lists ${issuers?.length ?? 0} issuers`);
  const found = [];
  for (const issuer of issuers) {
    const titles = await post(AJAX, { action: "titulosEmisoras", data: issuer.COD_EMP }, `${BVC}/emisoras/`);
    await sleep(pause);
    for (const title of Array.isArray(titles) ? titles : []) {
      const ticker = clean(title.COD_SIMB).toUpperCase();
      if (!SYMBOL.test(ticker) || !/^ES/.test(clean(title.CFI)) || onBoard.has(ticker)) continue;
      const head = (await post(`${AJAX}?action=getSimbolosDetalle`, { simbolo: ticker, tipo: "rv" }))?.response?.cur_encab_simb_rv?.[0];
      await sleep(pause);
      found.push(`${ticker} ${clean(head?.ESTATUS) || "no sheet"}`);
    }
  }
  return found;
}

export async function bvcBook({ keep = [], keepDormant = false, sweep = false, pause = 700, quiet = false } = {}) {
  const board = (await post(AJAX, { action: "get_cotizaciones" }))?.response;
  if (!Array.isArray(board) || board.length < FLOOR.board) throw new Error(`the BVC board lists ${board?.length ?? 0} symbols`);
  for (const field of ["COD_SIMB", "DESC_SIMB", "PRE_CMP_1", "PRE_VTA_1"]) {
    if (!(field in board[0])) throw new Error(`the BVC board has no ${field} field`);
  }
  const kept = new Set(keep.map((ticker) => ticker.toUpperCase()));
  const csv = bvcvList();
  const rows = [];
  const report = { board: board.length, funds: [], suspended: [], dormant: [], mismatched: [], offBoard: [] };
  const seen = new Set();
  for (const quote of board) {
    const ticker = clean(quote.COD_SIMB).toUpperCase();
    const name = clean(quote.DESC_SIMB);
    if (!SYMBOL.test(ticker) || !name) throw new Error(`unreadable board line ${JSON.stringify(quote)}`);
    if (seen.has(ticker)) throw new Error(`${ticker} repeats on the board`);
    seen.add(ticker);
    if (FUND.test(name) && !CORPORATION.test(name)) {
      report.funds.push(ticker);
      continue;
    }
    const detail = (await post(`${AJAX}?action=getSimbolosDetalle`, { simbolo: ticker, tipo: "rv" }))?.response;
    await sleep(pause);
    const head = detail?.cur_encab_simb_rv?.[0];
    if (!head) throw new Error(`the BVC sheet of ${ticker} is empty`);
    for (const field of ["cur_vol_x_ano_rv", "cur_grf_anual_pre_rv"]) {
      if (!Array.isArray(detail[field])) throw new Error(`the BVC sheet of ${ticker} has no ${field}`);
    }
    const status = clean(head.ESTATUS);
    if (status !== "ACTIVO") {
      report.suspended.push(`${ticker} ${status || "no status"}`);
      continue;
    }
    const currency = CURRENCY[clean(head.MONEDA)];
    if (!currency) throw new Error(`${ticker} is quoted in ${clean(head.MONEDA)} on its BVC sheet`);
    const tradedThisYear =
      detail.cur_vol_x_ano_rv.some((line) => Number(line.TOT_OP_NEGOC) > 0) || detail.cur_grf_anual_pre_rv.length > 0;
    const quoted = quote.PRE_CMP_1 != null || quote.PRE_VTA_1 != null;
    if (!tradedThisYear && !quoted && !keepDormant && !kept.has(ticker)) {
      report.dormant.push(ticker);
      continue;
    }
    const sheetIsin = clean(head.COD_ISIN);
    const listed = csv.get(ticker);
    const isin = /^VE[A-Z0-9]{9}\d$/.test(sheetIsin) ? sheetIsin : listed?.length === 1 ? listed[0] : "";
    if (listed?.length === 1 && isin && listed[0] !== isin) report.mismatched.push(`${ticker} ${isin}/${listed[0]}`);
    rows.push({
      query: isin || ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency,
      type: "STOCK",
      ...(isin ? { isin } : {}),
      raw: [ticker, name, `bid ${quote.PRE_CMP_1 ?? "-"}`, `ask ${quote.PRE_VTA_1 ?? "-"}`, EXCHANGE].join(" | "),
    });
  }
  if (rows.length < FLOOR.book) throw new Error(`only ${rows.length} BVC shares`);
  for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing from the BVC book`);
  if (sweep) report.offBoard = await offBoard(seen, pause);
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));

  const usd = rows.filter((row) => row.currency === "USD").length;
  const text =
    `BVC book: ${rows.length} STOCK (${usd} in USD, ${rows.filter((row) => row.isin).length} ISINs) from a board of ${report.board}. ` +
    `Funds left out: ${report.funds.join(", ") || "none"}. Suspended: ${report.suspended.join(", ") || "none"}. ` +
    `Dormant (no trade this year, no bid or offer): ${report.dormant.join(", ") || "none"}.` +
    (report.mismatched.length ? ` stocks.csv disagrees on ${report.mismatched.join(", ")}.` : "") +
    (sweep ? ` Issuer titles off the board: ${report.offBoard.join(", ") || "none"}.` : "");
  if (!quiet) console.error(text);
  Object.defineProperty(rows, "report", { value: { ...report, text }, enumerable: false });
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await bvcBook({ sweep: process.argv.includes("--sweep") });
  console.log(JSON.stringify(rows.slice(0, 2), null, 2));
}
