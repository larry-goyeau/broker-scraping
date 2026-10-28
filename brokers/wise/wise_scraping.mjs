// What Wise Capital (Wise Capital Securities S.A., ALyC Integral no. 2368 at
// the CNV, Pilar) sells in Buenos Aires shares and CEDEARs, with no login.
// It publishes no list of its own. Its pages, read 2026-10-25:
//
//   https://wise.com.ar/inversiones/
//   "Trading: Los clientes acceden a nuestra plataforma de ejecución ...
//   incluyendo renta fija y renta variable", products "Bonos, Letras,
//   Acciones, Cedears, Futuros, Opciones, Cauciones, Cheques, Facturas,
//   Pagaré Digital"; private banking offers "Todas las opciones
//   disponibles".
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs from BYMA's open data
// (https://open.bymadata.com.ar/): the peso and MEP dollar (D) lines of
// every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable (C) lines are not
// written: no Wise page nor its tariff names cable / CCL settlement (the
// tariff's "Externas Exterior" and "Conversión de Código Local a Exterior"
// lines move securities abroad, they are not a cable trading line). Block
// lines, closed-end funds, bond CEDEARs, rights, warrants and dormant or
// delisted lines are left out by the shared module. Bonds, letras,
// futures, options, cauciones, cheques and the house FCIs are other
// products. No page names a segment, board or title the broker does not
// trade.
//
// Fees ("Comisiones, aranceles y gastos de la cuenta comitente"):
// "Compra / Venta de Acciones y Cedears 2% Por operación" (maximum rate);
// custody of private securities 0, account opening and maintenance 0:
//   https://wise.com.ar/wp-content/uploads/2026/03/Tabla-de-Aranceles-%E2%80%93-Wise-Securities.pdf
//
// broker-list.json names one place, Argentina, with no restriction.
//
//   node brokers/wise/wise_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Wise Capital", { cable: false });
fs.writeFileSync(new URL("wise-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Wise Capital: ${rows.length} BYMA lines`);
