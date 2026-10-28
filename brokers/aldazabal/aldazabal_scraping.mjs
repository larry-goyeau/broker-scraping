// What Aldazabal y Cía. S.A. ("Agente de Liquidación y Compensación y
// Agente de Negociación Propio N°142 ante la Comisión Nacional de Valores
// ... Participante N° 1 en BYMA") sells in Buenos Aires shares and CEDEARs,
// with no login. Its only place is BYMA (BCBA / XBUE).
//
// The broker's pages, read 2026-10-25:
//   https://www.aldazabal.com.ar/preguntas-frecuentes
//   "Ponemos a disposición bonos, letras, acciones, CEDEARs, ADRs, opciones,
//   futuros, fondos comunes de inversión y otros instrumentos bursátiles".
//   https://www.aldazabal.com.ar/soluciones/productos/renta-variable
//   Instruments "Acciones", "CEDEARs" ("Certificados que representan
//   acciones extranjeras operadas localmente") and "ADRs" (these only
//   abroad: "No directamente desde el mercado local"). Currency "Pesos,
//   vinculados a activos en dólares"; FAQ: "Aunque se opera en pesos,
//   muchos instrumentos están vinculados a activos en dólares".
// No page names a board, a segment or a kind of share or CEDEAR it does
// not trade, so the catalogue is BYMA's whole share and CEDEAR board
// (../bancogalicia/bymaBook.mjs: local shares and CEDEARs, ETF CEDEARs
// included, that trade; block lines, closed-end funds, rights, warrants,
// bond CEDEARs and dormant lines left out).
// The peso line and the MEP-dollar (D) line of each title are written. The
// "se opera en pesos" wording describes the product, it does not exclude
// dollar lines, and the broker keeps client dollars at home: its bank
// accounts page lists a "Cuenta Corriente en Dólares" at Banco de Valores
// (https://www.aldazabal.com.ar/legales/cuentas-bancarias). Cable (C)
// lines are not written: no page or fee line names cable / CCL settlement
// (the FAQ cites "dólar contado con liquidación" only as a driver of CEDEAR
// prices).
//
// Fees ("Cuadro de Aranceles", "Tarifas vigentes desde Enero 2025"):
// "Compra/Venta de Acciones hasta 2,00% + IVA, Mínimo: $300 + IVA"; market
// rights "Derechos de Mercado y Bolsa (Acciones) 0,0951% (IVA Incluido)";
// custody $650 (IVA inc.):
//   https://www.aldazabal.com.ar/legales/cuadro-aranceles
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/aldazabal/aldazabal_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Aldazabal", { cable: false });
console.error(`Aldazabal: ${rows.length} rows`);
fs.writeFileSync(new URL("aldazabal-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
