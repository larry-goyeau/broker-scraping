// What Cucchiara (Cucchiara y Cía. S.A., ALyC Integral n° 265 CNV, BYMA
// member n° 18) sells in Buenos Aires shares and CEDEARs, with no login.
// The broker publishes no list of its own. Its services page gives access
// to every instrument of the Argentine markets:
//
//   https://cucchiara.com.ar/servicios
//   "Te damos acceso a todos los mercados argentinos para operar los
//   instrumentos de oferta pública autorizados por la CNV: Títulos
//   públicos, obligaciones negociables, acciones, CEDEARs, ..."
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso and MEP-dollar (D) lines of every local share and CEDEAR that
// BYMA quotes and that traded in the last months; block lines, closed-end
// funds, bond CEDEARs, rights, warrants and dormant or delisted lines are
// left out there. Cable (C) lines are not written: the FAQ names only the
// MEP dollar ("¿Cómo opero dólar MEP? Comuníquese con nuestra mesa de
// operaciones"), and the published deposit accounts ("Cuentas habilitadas")
// are all Argentine bank accounts in pesos and dollars, with no account
// abroad. Bonds, letras, ONs and options are other products.
//   https://cucchiara.com.ar/preguntasfrecuentes
//   https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:2c692a2e-89c1-46ae-8564-164dc07e3ac0
//
// Fees ("Detalle de Aranceles y Comisiones", the "Aranceles y comisiones"
// link of the site footer, a public Adobe Acrobat share): "Compra - Venta de
// Acciones" maximum 2.00%, minimum $100, plus IVA:
//   https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:3da44e44-68a8-4a33-a4bc-6d4bab50dde1
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/cucchiara/cucchiara_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Cucchiara", { cable: false });
fs.writeFileSync(new URL("cucchiara-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Cucchiara: ${rows.length} rows`);
