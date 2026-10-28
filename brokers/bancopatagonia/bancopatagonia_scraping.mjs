// What Banco Patagonia (Banco Patagonia S.A., ALyC y AN Integral no. 66 at
// the CNV) sells in Buenos Aires shares and CEDEARs, with no login. Its
// only place is BYMA (BCBA / XBUE).
//
// Its investment FAQ, read 2026-10-25:
//   https://www.bancopatagonia.com.ar/personas/inversiones/preguntas-frecuentes.php
//   "Operamos en el mercado ByMA (Bolsas y Mercados Argentinos) en el
//   Segmento Garantizado PPT"; "¿Puedo invertir en mercados del exterior? No,
//   por el momento solo en el mercado local."; "Vas poder operar de manera
//   online Dólar MEP, Acciones locales, CEDEARs, Bonos, Letras y
//   Obligaciones Negociables"; "para operar un activo con dólares deberás
//   seleccionar un ticker finalizado con la letra 'D'" (AAPL in pesos,
//   AAPLD in dollars); "Los ticker terminados con la letra 'C' ejemplo
//   'AAPLC' ... son para operar con dólares en el exterior, y no están
//   habilitados para operar por la plataforma."
//   https://www.bancopatagonia.com.ar/personas/inversiones/cedears.php
//   CEDEARs "Cotizan en Pesos y en dólares".
//
// No list of its own and no excluded board, so the catalogue is BYMA's
// whole share and CEDEAR board (../bancogalicia/bymaBook.mjs: local shares
// and CEDEARs, ETF CEDEARs included, that trade; block lines, closed-end
// funds, rights, bond CEDEARs and dormant lines left out), with the peso
// line and the MEP-dollar (D) line of each title. Cable (C) lines are left
// out, as the FAQ says they are not enabled.
//
// Fees: the bank's company page links "Detalle de aranceles vigentes para
// operaciones con Títulos y Acciones" to this table, whose row "BANCO
// PATAGONIA S.A. - Promotor de Patagonia Valores S.B.S.A." prices "Títulos
// Privados / Contado" at max 1%, min $15.00, plus IVA:
//   https://www.bancopatagonia.com.ar/personas/pdf/comisiones.pdf
//   https://www.bancopatagonia.com.ar/empresas/inversiones/compra-venta-titulos-acciones.php
//
//   node brokers/bancopatagonia/bancopatagonia_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Banco Patagonia", { cable: false });
console.error(`Banco Patagonia: ${rows.length} rows`);
fs.writeFileSync(new URL("bancopatagonia-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
