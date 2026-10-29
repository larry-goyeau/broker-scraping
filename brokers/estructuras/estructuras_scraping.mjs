// What Estructuras Financieras Regionales S.A. (ALyC Propio n° 503 CNV)
// sells in Buenos Aires shares and CEDEARs, with no login. Clients trade
// online through its OMS (oms.estructurasfinancieras.com.ar) and virtual
// broker (virtualbroker-efire.aunesa.com); the home page sells "ABRÍ TU
// CUENTA EMPEZÁ A INVERTIR MONITOREÁ TUS INVERSIONES". It publishes no list
// and names no restriction.
//
//   https://www.estructurasfinancieras.com.ar/
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (CEDEARs of US ETFs included; block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines left out there). Cable (C) lines are not written: the fee table has
// no cable / CCL line ("CONTADO - EXTERIOR 2,00% 50 USD" is an order placed
// abroad, and no foreign place is in broker-list.json).
//
// Fees ("Tabla de aranceles", in force from 01/03/2025, maximum, plus IVA):
// "CONTADO - RENTA VARIABLE PORCENTAJE 21 2,00% 100 ARS" (minimum ARS 100):
//   https://www.estructurasfinancieras.com.ar/pdf/aranceles2024.pdf
//
//   node brokers/estructuras/estructuras_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.estructurasfinancieras.com.ar/", [/aranceles2024\.pdf/, /virtualbroker-efire|oms\.estructurasfinancieras/]);
await pdf("https://www.estructurasfinancieras.com.ar/pdf/aranceles2024.pdf");

const { rows } = await bymaBook("Estructuras Financieras", { cable: false });
if (rows.length < 500) throw new Error(`only ${rows.length} BYMA lines`);
fs.writeFileSync(new URL("estructuras-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Estructuras Financieras: ${rows.length} BYMA lines`);
