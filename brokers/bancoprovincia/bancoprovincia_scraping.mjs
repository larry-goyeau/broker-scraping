// What Banco Provincia (Banco de la Provincia de Buenos Aires, ALyC no. 43
// at the CNV) sells in Buenos Aires shares and CEDEARs online, with no
// login. Its place is BYMA (BCBA / XBUE), the one Argentine market with a
// share segment (the Mercado Argentino de Valores has none).
//
// Its pages, read 2026-10-28: "Invertí en Bonos y Acciones de forma simple
// y desde donde estés. Desde Home Banking BIP podés abrir tu Cuenta Títulos
// (Comitente)"; the BIP guide "Compra de Acciones": "El sistema mostrará el
// listado de acciones disponibles para operar ... Puede seleccionar el tipo
// de Acción que desea adquirir en cada una de las solapas", and
// "Importante: todas las operaciones de compra de títulos a través de BIP
// se cursan en pesos". Fees (cuadro tarifario B.P. Nº 519): "Acciones,
// Cedear y otros valores negociables de renta variable (sobre el valor
// monetario de la operación) 1,00%", minimum $ 50,00; custody bonified for
// individuals since 01/06/2026.
//   https://www.bancoprovincia.com.ar/mvc/productos/inversiones/BonosyAcciones/bonosacciones_info_gral
//   https://www.bancoprovincia.com.ar/CDN/Get/Compra_de_Acciones
//   https://www.bancoprovincia.com.ar/CDN/Get/BP0519-INTERNET   (fees)
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (local shares and CEDEARs, ETF CEDEARs
// included, that trade; block lines, closed-end funds, rights, bond CEDEARs
// and dormant lines left out there), peso lines only: the bank's own
// sentence restricts BIP purchases to pesos (broker-list.json's restriction
// "Peso-settled purchases only (BIP)", checked), so the MEP-dollar (D) and
// cable (C) lines are not written. broker-list.json gives the place
// "Argentina".
//
//   node brokers/bancoprovincia/bancoprovincia_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.bancoprovincia.com.ar/mvc/productos/inversiones/BonosyAcciones/bonosacciones_info_gral", [/Invertí en Bonos y Acciones de forma simple/, /BP0519-INTERNET/]);
await pdf("https://www.bancoprovincia.com.ar/CDN/Get/Compra_de_Acciones");
await pdf("https://www.bancoprovincia.com.ar/CDN/Get/BP0519-INTERNET");

const { rows: board } = await bymaBook("Banco Provincia", { cable: false });
const rows = board.filter((row) => row.currency === "ARS");
for (const ticker of ["GGAL", "YPFD", "AAPL", "SPY"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
console.error(`Banco Provincia: ${rows.length} peso rows; ${board.length - rows.length} dollar lines left out`);
fs.writeFileSync(new URL("bancoprovincia-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
