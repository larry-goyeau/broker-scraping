// What Vector Investments S.A. (Agente de Negociación n° 960 CNV, settling
// through Rosario Valores S.A., ALyC Integral n° 39) sells in Buenos Aires
// shares and CEDEARs, with no login. Clients trade online on its virtual
// broker (virtualbroker-vectorinvestments.aunesa.com) and the "DMA Rosval"
// app; the fee table has an "Online" column. It publishes no list and names
// no restriction.
//
//   https://www.vectorinvestments.com.ar/
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (CEDEARs of US ETFs included; block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines left out there). The table's market rights are BYMA's and MAV's;
// MAV has no share board. Cable (C) lines are not written: neither the fee
// table nor the site sells cable / CCL settlement (the home page only
// quotes the CCL rate among others).
//
// Fees ("Aranceles y derechos para operaciones de mercado de valores",
// Operación: Contado, Especie Privado): "General 0,75%", "Online 0,55%",
// market rights BYMA 0,080%:
//   https://www.vectorinvestments.com.ar/comisiones-y-aranceles.php
//
//   node brokers/vectorinvestments/vectorinvestments_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.vectorinvestments.com.ar/comisiones-y-aranceles.php", [/Operaci[oó]n: Contado/, /Online/, /0,55%/]);

const { rows } = await bymaBook("Vector Investments", { cable: false });
if (rows.length < 500) throw new Error(`only ${rows.length} BYMA lines`);
fs.writeFileSync(new URL("vectorinvestments-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Vector Investments: ${rows.length} BYMA lines`);
