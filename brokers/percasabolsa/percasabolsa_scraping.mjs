// What Per Capital Casa de Bolsa sells in shares, with no login.
// Per Capital is one of the "Miembros de la Bolsa de Valores de Caracas" and
// its home page says "Invierte en Acciones, Bonos y Fondos Mutuales", with
// "acceso directo y confiable al mercado venezolano". Its commission sheet
// prices "Cuenta Corretaje Bursátil" buys and sells on the BVC. No page names
// a board, segment or share it leaves out, so the book is the whole BVC
// equity board, read by the shared module ../mercosurcasabols/bvcBook.mjs.
//
// Left out, as in the other BVC scrapers (see bvcBook.mjs):
// - suspended lines (BVC sheet not ACTIVO);
// - dormant lines: no trade this year and no bid or offer on the board
//   (on 2026-10-24: CIE, GZL.A, GZL.B, IMP.A, PIV.A);
// - the closed-end mutual and private-equity funds (PER, RFM, FFV.A, FFV.B).
//   PER is Per Capital's own "PC-IBC Fondo Mutual de Inversión de Capital
//   Cerrado" (its /fondos page); it is left out like the other closed-end
//   funds. Its open-end fund is subscribed directly, not traded on the BVC.
// The BVC lists no ETF. Bonds are not shares and stay out.
//
// Fees (comisiones-per-capital.pdf): Cuenta Corretaje Bursátil, Compra 4%
// flat + IVA + 0,10% Registro BVC; Venta 4% flat + IVA + 0,10% Registro BVC
// + 1% ISLR.
//
//   https://www.per-capital.com/
//   https://www.per-capital.com/fondos
//   https://www.per-capital.com/assets/comisiones-per-capital.pdf
//
//   node brokers/percasabolsa/percasabolsa_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bvcBook } from "../mercosurcasabols/bvcBook.mjs";
import fs from "node:fs";

const rows = await bvcBook({ quiet: true });
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("percasabolsa-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
console.error(`${stamped.length} listings. ${rows.report.text}`);
