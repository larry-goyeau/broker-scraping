// What Statera Casa de Bolsa sells in shares, with no login.
// Statera is "Miembro Nro. 52 de la BVC" and deals on the Bolsa de Valores
// de Caracas only. Its "Productos y Servicios" page: "Ofrecemos la Compra –
// Venta de acciones a través de la Bolsa de Valores de Caracas", and "Invierte
// en acciones cotizadas en la Bolsa de Valores". It names no board, segment
// or share it leaves out, so the book is the whole BVC equity board, read by
// the shared module ../mercosurcasabols/bvcBook.mjs.
//
// Left out, as in the other BVC scrapers (see bvcBook.mjs):
// - suspended lines (BVC sheet not ACTIVO);
// - dormant lines: no trade this year and no bid or offer on the board
//   (on 2026-10-24: CIE, GZL.A, GZL.B, IMP.A, PIV.A);
// - the closed-end mutual and private-equity funds (PER, RFM, FFV.A, FFV.B).
// The BVC lists no ETF. Renta fija (papeles comerciales, obligaciones,
// titularizaciones) is not a share and stays out.
//
// Fees ("Tarifas y Comisiones"): Renta Variable "Hasta 5%", "Aplicable sobre
// el monto de la operación y negociable con el cliente en función del tamaño
// de la operación"; taxes and the BVC registration right come on top.
//
//   https://www.stateracasadebolsa.com/Servicios.html
//   https://www.stateracasadebolsa.com/tarifas.html
//
//   node brokers/stateracasabolsa/stateracasabolsa_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bvcBook } from "../mercosurcasabols/bvcBook.mjs";
import fs from "node:fs";

const rows = await bvcBook({ quiet: true });
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("stateracasabolsa-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
console.error(`${stamped.length} listings. ${rows.report.text}`);
