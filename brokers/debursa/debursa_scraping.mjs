// What Debursa S.A. (ALyC y AN Propio n° 159 CNV, "Miembro de Bolsas y
// Mercados Argentinos S.A.") sells in Buenos Aires shares and CEDEARs, with
// no login. Its home page sells its web home broker ("Operá online, desde
// donde estés ... Ingresar al Home Broker Versión Web"); its products page
// names local shares and CEDEARs ("Acciones de empresas extranjeras que
// cotizan en la Bolsa de Buenos Aires"). It publishes no list and names no
// restriction.
//
//   https://www.debursa.com.ar/
//   https://www.debursa.com.ar/productos/
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (CEDEARs of US ETFs included; block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines left out there). Cable (C) lines are not written: the fee table's
// only dollar transfers are "Transferencias MEP".
//
// Fees ("Aranceles y Comisiones", maximum rates published as the CNV
// requires): the only share line of the table is "Compra venta de acciones
// del exterior Hasta 1,50% + IVA (mínimo U$S 50 + IVA)"; it names no other
// share rate, and the market rights it lists for "Títulos privados 0,08%"
// are BYMA's share rights, so that line is the share rate of the table:
//   https://www.debursa.com.ar/aranceles-y-comisiones/
//
//   node brokers/debursa/debursa_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.debursa.com.ar/", [/Oper[aá] online, desde donde est[eé]s/]);
await evidence("https://www.debursa.com.ar/aranceles-y-comisiones/", [/Compra venta de acciones del exterior/i]);

const { rows } = await bymaBook("Debursa", { cable: false });
if (rows.length < 500) throw new Error(`only ${rows.length} BYMA lines`);
fs.writeFileSync(new URL("debursa-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Debursa: ${rows.length} BYMA lines`);
