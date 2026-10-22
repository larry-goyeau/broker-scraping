// What Mercantil Merinvest Casa de Bolsa sells in shares, with no login.
// Merinvest is a member of the Bolsa de Valores de Caracas (BVC) and deals
// on that exchange; its "Instrumentos" page sells "acciones … en empresas
// inscritas en la Bolsa de Valores de Caracas", every share the exchange
// lists. The book is therefore the exchange's own list: the BVC's public
// quote board (get_cotizaciones, the "Cotizaciones RV" table of its
// "Resumen del mercado" page) prints every equity symbol with its name and
// best bid and offer. Most are quoted in bolívares (VES); a few (the
// Grupo Zuliano preferred shares GZL.A and GZL.B, both left out as dormant,
// see below) in dollars, which the symbol sheet's MONEDA says.
//
// Merinvest's own "Cierre Financiero Diario" PDF names 29 of those shares
// and is read only as a check: on 2026-10-21 it was still the sheet of 17
// July 2026 (the file is not refreshed daily), and it leaves out names the
// board quotes. A PDF symbol missing from the board is reported (BPV,
// Banco Provincial, on 2026-10-21; back on the board on 2026-10-22); the
// run stops if the PDF no longer reads as a price list.
//
// Left out as dormant: a board symbol with no trade in the current year
// (its BVC symbol sheet's year volume, cur_vol_x_ano_rv, and year price
// chart, cur_grf_anual_pre_rv, are both empty) and no bid and no offer on
// the board, unless Merinvest's own sheet names it. Merinvest's page says
// only that shares let clients "comprar y vender participación accionaria
// en empresas inscritas en la Bolsa de Valores de Caracas", and a line
// with no market and no Merinvest price cannot be bought. On 2026-10-22
// that left out GZL.A and GZL.B (Grupo Zuliano US$ preferred shares, at a
// placeholder price of 1, year high and low 1/1), IMP.A (Impulsa Venture
// Capital) and PIV.A (Pivca). CIE (Corp. Industrial de Energía) is as
// dormant but stays: Merinvest's sheet prices it ("Corp.Ind. de Energía
// CIE 0,15").
//
// Left out: the closed-end mutual and private-equity funds (PC-IBC and
// Rendivalores "fondo mutual de inversión de capital cerrado", Fivenca
// "fondo capital privado" A and B). Companies named "Fondo … C.A." (Fondo
// Petrolia) are corporations and stay. The BVC lists no ETF.
//
// ISIN and currency: the BVC's symbol sheet (getSimbolosDetalle: COD_ISIN,
// ESTATUS, MONEDA), read again for every symbol on every run so that a
// suspension shows at once (no cache); stocks.csv (BVCV) fills an ISIN the sheet
// leaves blank, and a disagreement between the two is reported. A symbol
// whose sheet is not ACTIVO, or in a currency other than Bs or US$, stops
// the run.
//
//   https://www.mercantilmerinvest.com/instrumentos
//   https://www.mercantilmerinvest.com/documents/precio-de-cierre-diario.pdf
//   https://www.bolsadecaracas.com/resumen-mercado/
//   POST https://www.bolsadecaracas.com/wp-admin/admin-ajax.php action=get_cotizaciones
//   POST https://www.bolsadecaracas.com/wp-admin/admin-ajax.php?action=getSimbolosDetalle simbolo=…&tipo=rv
//
// The PDF is read with PyMuPDF (pip install pymupdf).
//
//   node brokers/merinvest/merinvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const BVC = "https://www.bolsadecaracas.com";
const AJAX = `${BVC}/wp-admin/admin-ajax.php`;
const BOARD_PAGE = `${BVC}/resumen-mercado/`;
const PDF = "https://www.mercantilmerinvest.com/documents/precio-de-cierre-diario.pdf";
const EXCHANGE = "Caracas Stock Exchange";
const MIC = "BVCA";
const FLOOR = { board: 35, pdf: 20, book: 30 };
const MUST = ["BVL", "BNC", "MVZ.A", "TDV.D", "BVCC"];
const FUND = /\bFONDO\b|\bFON\.?\s*MUT/i;
const CORPORATION = /\bC\.\s?A\.?(?:\s|,|$)/;
// MONEDA on a BVC symbol sheet.
const CURRENCY = { Bs: "VES", "US$.": "USD", US$: "USD" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, init = {}, { binary = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, Referer: BOARD_PAGE, ...(init.headers || {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const post = async (url, fields) =>
  JSON.parse(
    await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
      body: new URLSearchParams(fields).toString(),
    })
  );

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function pdfLines(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
json.dump([l.strip() for page in doc for l in page.get_text().split("\\n") if l.strip()], sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.error || python.status !== 0) {
    const detail = python.stderr?.toString() || python.error?.message || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
  }
  return JSON.parse(python.stdout.toString());
}

// "Banco de Venezuela / BVL / 1.669,00 / …": a symbol line is followed by a
// price in Venezuelan format.
async function merinvestSheet() {
  const bytes = await request(PDF, { headers: { Referer: "https://www.mercantilmerinvest.com/" } }, { binary: true });
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${PDF} did not return a PDF`);
  const lines = pdfLines(bytes);
  const dated = lines.join(" ").match(/Caracas,\s+(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i);
  const start = lines.findIndex((line) => /^BOLSA DE VALORES DE CARACAS/i.test(line));
  const end = lines.findIndex((line) => /^Total operaciones regulares/i.test(line));
  if (!dated || start < 0 || end < start) throw new Error("the Merinvest closing sheet no longer reads as a price list");
  const symbols = new Set();
  for (let i = start; i + 1 < end; i += 1) {
    if (/^[A-Z]{2,4}(?:\.[A-D])?$/.test(lines[i]) && /^-?[\d.]+,\d{2}$/.test(lines[i + 1])) symbols.add(lines[i]);
  }
  return { symbols, date: `${dated[1]} ${dated[2]} ${dated[3]}` };
}

function bvcvList() {
  const found = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const match = line.match(/^BVCV:([^,]+),BVCV,([A-Z]{2}[A-Z0-9]{9}\d),(.*)$/);
    if (!match) continue;
    const ticker = match[1].trim().toUpperCase();
    if (!found.has(ticker)) found.set(ticker, []);
    found.get(ticker).push({ isin: match[2], name: match[3].replace(/^"|"$/g, "").trim() });
  }
  return found;
}

const board = await post(AJAX, { action: "get_cotizaciones" });
const quotes = board?.response;
if (!Array.isArray(quotes) || quotes.length < FLOOR.board) throw new Error(`the BVC board lists ${quotes?.length ?? 0} symbols`);
for (const field of ["COD_SIMB", "DESC_SIMB", "PRE_CMP_1", "PRE_VTA_1"]) {
  if (!(field in quotes[0])) throw new Error(`the BVC board has no ${field} field`);
}

const sheet = await merinvestSheet();
if (sheet.symbols.size < FLOOR.pdf) throw new Error(`the Merinvest sheet names only ${sheet.symbols.size} symbols`);

const csv = bvcvList();
const rows = [];
const leftOut = [];
const dormant = [];
const mismatched = [];
let fetched = 0;
const seen = new Set();
for (const quote of quotes) {
  const ticker = clean(quote.COD_SIMB).toUpperCase();
  const name = clean(quote.DESC_SIMB);
  if (!/^[A-Z]{2,4}(?:\.[A-D])?$/.test(ticker) || !name) throw new Error(`unreadable board line ${JSON.stringify(quote)}`);
  if (seen.has(ticker)) throw new Error(`${ticker} repeats on the board`);
  seen.add(ticker);
  if (FUND.test(name) && !CORPORATION.test(name)) {
    leftOut.push(ticker);
    continue;
  }
  const detail = (await post(`${AJAX}?action=getSimbolosDetalle`, { simbolo: ticker, tipo: "rv" }))?.response;
  const head = detail?.cur_encab_simb_rv?.[0];
  if (!head) throw new Error(`the BVC sheet of ${ticker} is empty`);
  for (const field of ["cur_vol_x_ano_rv", "cur_grf_anual_pre_rv"]) {
    if (!Array.isArray(detail[field])) throw new Error(`the BVC sheet of ${ticker} has no ${field}`);
  }
  const known = { isin: clean(head.COD_ISIN), status: clean(head.ESTATUS), currency: clean(head.MONEDA) };
  fetched += 1;
  await sleep(700);
  if (known.status !== "ACTIVO") throw new Error(`${ticker} is ${known.status} on its BVC sheet`);
  const currency = CURRENCY[known.currency];
  if (!currency) throw new Error(`${ticker} is quoted in ${known.currency} on its BVC sheet`);
  const tradedThisYear =
    detail.cur_vol_x_ano_rv.some((line) => Number(line.TOT_OP_NEGOC) > 0) || detail.cur_grf_anual_pre_rv.length > 0;
  const quoted = quote.PRE_CMP_1 != null || quote.PRE_VTA_1 != null;
  if (!tradedThisYear && !quoted && !sheet.symbols.has(ticker)) {
    dormant.push(ticker);
    continue;
  }
  const listed = csv.get(ticker);
  const isin = /^VE[A-Z0-9]{9}\d$/.test(known.isin) ? known.isin : listed?.length === 1 ? listed[0].isin : "";
  if (listed?.length === 1 && isin && listed[0].isin !== isin) mismatched.push(`${ticker} ${isin}/${listed[0].isin}`);
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
for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
const notOnBoard = [...sheet.symbols].filter((symbol) => !seen.has(symbol));

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("merinvest-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
const withIsin = stamped.filter((row) => row.isin).length;
console.error(
  `${stamped.length} listings: ${EXCHANGE} STOCK ${stamped.length} (BVC board ${quotes.length}, ${fetched} sheets read; ` +
    `${stamped.filter((row) => row.currency === "USD").length} in USD); ${withIsin} ISINs` +
    `${mismatched.length ? `, stocks.csv disagrees on ${mismatched.join(", ")}` : ""}. ` +
    `Funds left out: ${leftOut.join(", ") || "none"}. No trade this year, no bid or offer, not on Merinvest's sheet: ${dormant.join(", ") || "none"}. Merinvest sheet of ${sheet.date}: ${sheet.symbols.size} symbols, ` +
    `not on the board: ${notOnBoard.join(", ") || "none"}.`
);
