// What SJB S.A. ("SJB Finanzas Expertas", Registro CNV AN 2592, BYMA and
// Matba Rofex agent) sells in Buenos Aires shares and CEDEARs, with no
// login. It publishes no list of its own. Its FAQ names local shares,
// CEDEARs and both kinds of stock-market dollars, and its home page CEDEARs
// of ETFs:
//
//   https://www.sjb.com.ar/preguntas-frecuentes/
//   "Los instrumentos disponibles son: ... Acciones, Títulos públicos, ...
//   Opciones, Cedears, Fondos Comunes de Inversión, ... Dólar MEP y Dólar
//   CCL."
//   https://www.sjb.com.ar/
//   "Una nueva alternativa para tus inversiones: Cedears de ETF."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable lines are kept because
// the FAQ offers "Dólar CCL" (contado con liquidación, dollars settled
// abroad) and the tariff has a "Contado - Exterior" line. Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module. Bonds, letras, ONs, options,
// futures, cauciones, cheques and funds are other products. The FAQ's
// "inversión mínima requerida para activos en el exterior es de USD 5.000"
// is about assets bought abroad, not BYMA lines. No page names a segment,
// board or title the broker does not trade.
//
// Fees ("Tabla de aranceles", 14/11/2022, linked from the FAQ and the
// "Información legal" page): "Contado - Renta variable" maximum 2%, minimum
// $100, plus IVA; fees charged "en moneda original de la operación";
// account maintenance $200:
//   https://www.sjb.com.ar/wp-content/uploads/2022/11/TABLA-DE-ARANCELES-SJB-2022.11.14.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/sjbbursatil/sjbbursatil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("SJB Bursátil", { cable: true });
fs.writeFileSync(new URL("sjbbursatil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`SJB Bursátil: ${rows.length} BYMA lines`);
