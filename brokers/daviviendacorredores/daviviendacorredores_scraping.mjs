// What Corredores Davivienda S.A. Comisionista de Bolsa (Grupo Bolívar)
// sells online in shares and ETFs, with no login. Clients trade on the
// "Davivienda Homebroker" e-trading platform (a "Sistema Electrónico de
// Ruteo de Órdenes" to the Bolsa de Valores de Colombia); the site's
// products under "Intermediación" are "Renta variable", "Davivienda
// Homebroker", "ETF´s" and "Mercado Global Colombiano". It publishes no
// list and names no board or title it does not trade.
//
//   https://www.daviviendacorredores.com/
//
// So the catalogue is the BVC's whole equity book, read by
// ../progresion/bvcColombiaBook.mjs: the local market (Colombian shares,
// preferred shares, local ETFs, the PEI trust) and the Mercado Global
// Colombiano (foreign shares and ETFs listed on the BVC and traded there in
// pesos), less suspended, never-traded and dormant lines. Canacol Energy
// (CNEC) is left out as in brokers/progresion: the BVC suspended its spot
// trading in November 2025 (CCAA restructuring) although its status still
// reads "Inactivo".
//
// Not added: the United States that broker-list.json gives with the
// restriction "By phone/advisor only". The site sells foreign markets as
// "Inversiones internacionales" through "Davivienda Advisors" (advice),
// and the commission policy prices the Homebroker for BVC orders only; no
// page sells US shares online.
//
// Fees ("Manual de Intermediación, Anexo No. 4 Política de Comisiones y
// Márgenes", 24-03-2026, "14. TARIFAS SISTEMAS ELECTRÓNICOS DE RUTEO DE
// ÓRDENES (E-TRADING)"): "Davivienda Homebroker De $1.000.000 a
// $20.000.000 $60.000 más IVA; $20.000.000 a $50.000.000 0.3 % más IVA;
// para montos superiores a $50.000.000, Comisión 0.2 % más IVA"; by
// contract "Para Renta Variable máximo 2% sobre el valor de giro":
//   https://www.daviviendacorredores.com/documents/d/davivienda-corredores-colombia/politica-de-comisiones-y-margenes
//   (linked from https://www.daviviendacorredores.com/politicas-y-tarifas)
//
//   node brokers/daviviendacorredores/daviviendacorredores_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";
import { bvcColombiaBook } from "../progresion/bvcColombiaBook.mjs";

await evidence("https://www.daviviendacorredores.com/", [/Davivienda Homebroker/, /Mercado Global Colombiano/]);
await evidence("https://www.daviviendacorredores.com/politicas-y-tarifas", [/politica-de-comisiones-y-margenes/]);
await pdf("https://www.daviviendacorredores.com/documents/d/davivienda-corredores-colombia/politica-de-comisiones-y-margenes");

const DROP = new Set(["CNEC"]);
const book = await bvcColombiaBook({ segments: ["EQTY", "MGC"] });
const rows = book.filter((row) => !DROP.has(row.ticker)).map(({ segment, ...row }) => row);
if (rows.length < 100) throw new Error(`only ${rows.length} BVC lines kept`);
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("daviviendacorredores-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
const counts = {};
for (const row of stamped) counts[row.type] = (counts[row.type] || 0) + 1;
console.error(`Davivienda Corredores: ${stamped.length} BVC lines, ${stamped.filter((row) => row.isin).length} with an ISIN`, counts);
