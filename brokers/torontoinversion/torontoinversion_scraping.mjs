// What Toronto Inversiones S.A. (ex BACS Administradora de Activos; "Alyc
// AN Integral CNV Nº 1398; ... Agente BYMA Nº190") sells in Buenos Aires
// shares and CEDEARs, with no login. Its only place is BYMA (BCBA / XBUE).
//
// The broker's pages, read 2026-10-25:
//   https://torontoinversiones.com.ar/preguntas-frecuentes/
//   "¿Qué instrumentos puedo operar desde mi cuenta?": "Bonos y acciones",
//   "CEDEARs", letras, cauciones, ONs, funds, futures and options; money
//   goes back "a los CBU que le indiques, tanto en pesos como dólares".
//   https://torontoinversiones.com.ar/autogestion/
//   Self-service through MATRIZ, "Conectate directamente con los
//   principales mercados del país, como BYMA y A3".
// No page names a board, a segment or a kind of share or CEDEAR it does
// not trade, so the catalogue is BYMA's whole share and CEDEAR board
// (../bancogalicia/bymaBook.mjs: local shares and CEDEARs, ETF CEDEARs
// included, that trade; block lines, closed-end funds, rights, warrants,
// bond CEDEARs and dormant lines left out), with the peso line and the
// MEP-dollar (D) line of each title.
// Cable (C) lines are not written: the fee table has no cable / CCL line,
// and dollars are paid out to a local CBU. The account terms
// (F1-Terminos-y-Condiciones, clause 8) allow "Operaciones en el exterior"
// only for "Inversores Calificados" through Caja de Valores' accounts at
// Euroclear, Clearstream and DTC; that is foreign custody, not BYMA's
// cable lines.
//   https://torontoinversiones.com.ar/wp-content/uploads/2026/04/F1-Terminos-y-Condiciones-CLEAN-TORONTO-INVERSIONES-SA.pdf
//
// Fees ("ANEXO IV – COMISIONES, CARGOS Y TASAS"): "ACCIONES Comisión por
// Operaciones 1,00% sobre importe bruto operado. Min. $500", custody 0,10%
// a year, account fee $1000 a month, plus market rights "Acciones - Títulos
// Privados - Oblig. Neg. – Cedear 0.08%"; IVA on top:
//   https://torontoinversiones.com.ar/wp-content/uploads/2026/04/Aranceles.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/torontoinversion/torontoinversion_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Toronto Inversiones", { cable: false });
console.error(`Toronto Inversiones: ${rows.length} rows`);
fs.writeFileSync(new URL("torontoinversion-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
