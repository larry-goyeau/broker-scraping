// What Álvarez y Cía. Actividades Bursátiles (ALyC Propio y AN, CNV n° 132,
// BYMA agent code 5) sells in Buenos Aires shares and CEDEARs, with no
// login. It publishes no list of its own (its "Cotizaciones" page reads
// "SECCIÓN EN DESARROLLO"); its home page names shares and CEDEARs among
// the BYMA operations it takes part in:
//
//   https://alvarezycia.com.ar/
//   "Participamos de las operatorias autorizadas por Bolsas y Mercados
//   Argentinos S.A. (BYMA) tanto en la Negociación Primaria como
//   Secundaria." and, under "NEGOCIACIÓN SECUNDARIA": "Acciones",
//   "Derechos de Suscripción", "Cedear", "Opciones sobre Títulos Valores".
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: no page
// and no tariff line names cable / CCL settlement or an account abroad (the
// tariff's bank transfers are "Inmediatas" and "Via M.E.P."). Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module. Bonds, letras, options,
// cauciones and cheques are other products. No page names a segment, board
// or title the broker does not trade.
//
// Fees ("Cuadro de gastos, comisiones, impuestos y derechos", year 2024,
// the "Descargar PDF" of the ARANCELES page): "CONTADO - Titulos Privados y
// Fondos Cerrados en Acciones - Cedears" arancel 1% + IVA plus 0.08% market
// rights; minimum arancel $1.000:
//   https://alvarezycia.com.ar/aranceles/
//   https://alvarezycia.com.ar/wp-content/uploads/2024/08/GASTOS-2024.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/alvarezycia/alvarezycia_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Álvarez y Cía", { cable: false });
fs.writeFileSync(new URL("alvarezycia-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Álvarez y Cía: ${rows.length} BYMA lines`);
