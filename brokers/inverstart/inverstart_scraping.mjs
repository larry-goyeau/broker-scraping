// What InverStart S.A. (Mendoza, Agente de Negociación Mat. N° 746 CNV)
// sells in Buenos Aires shares and CEDEARs, with no login. Clients trade
// online in its app (app.inverstart.com), its virtual broker
// (virtualbroker-inverstart.aunesa.com) and Rosval's DMA; its menu sells
// "Acciones" among the products. It publishes no list and names no
// restriction.
//
//   https://www.inverstart.com/
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (CEDEARs of US ETFs included; block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines left out there). Cable (C) lines are not written: the fee table
// prices no cable / CCL settlement and the site sells "Dólar MEP" only.
//
// Fees ("Comisiones INVERSTART S.A.", an image on the Aranceles page):
// "RENTA VARIABLE Contado ARS/USD Normal 1,21% Mínimo S/M Máximo 5,00%";
// "Comisiones finales. Incluyen IVA (en caso de corresponder), Derechos de
// Mercado, Arancel ALYC y gastos de Caja de Valores":
//   https://www.inverstart.com/aranceles
//   https://static.wixstatic.com/media/346527_49f680cd15744c9895606a608421c027~mv2.jpeg
//
//   node brokers/inverstart/inverstart_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.inverstart.com/aranceles", [/ARANCELES Y GASTOS/, /346527_49f680cd15744c9895606a608421c027/]);

const { rows } = await bymaBook("InverStart", { cable: false });
if (rows.length < 500) throw new Error(`only ${rows.length} BYMA lines`);
fs.writeFileSync(new URL("inverstart-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`InverStart: ${rows.length} BYMA lines`);
