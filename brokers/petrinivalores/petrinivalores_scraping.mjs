// What Petrini Valores (Petrini Valores S.A., Córdoba; ALyC Propio y AN
// n° 85 CNV, member of BYMA, A3 and MAV) sells in Buenos Aires shares and
// CEDEARs, with no login. The broker publishes no list of its own. Its home
// page says it trades every instrument of the local market:
//
//   https://www.petrini.com.ar/
//   "Plaza Local: Operamos todos los instrumentos financieros disponibles
//   en la plaza local habilitados por BYMA, Rofex, Matba y MAV."
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso, MEP-dollar (D) and cable (C) lines of every local share and
// CEDEAR that BYMA quotes and that traded in the last months; block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out there. Cable lines are kept because the fee schedule
// lets clients move dollars abroad: "Transferencias Bancarias en el
// Exterior U$S 60" and "Transferencias a otras depositarias
// exteriores/Cambio de Depositante U$S 100". Bonds, letras, ONs and
// options are other products.
//
// Fees ("Cuadro de Aranceles y Gastos Vigentes", updated 21 October 2026):
// "Compra / Venta de Acciones o Títulos de Deuda (Público/Privada) 2%",
// minimum $2,000, maximums before IVA and market rights:
//   https://www.petrini.com.ar/comisiones-y-aranceles/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/petrinivalores/petrinivalores_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Petrini Valores", { cable: true });
fs.writeFileSync(new URL("petrinivalores-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Petrini Valores: ${rows.length} rows`);
