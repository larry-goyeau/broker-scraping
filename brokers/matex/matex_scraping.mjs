// What Matex Capital (run by Sesnich Villalonga Cereales S.A., ALyC Integral
// Agroindustrial, CNV matrícula n° 199) sells in Buenos Aires shares and
// CEDEARs, with no login. It publishes no list of its own. Its home page
// names shares and CEDEARs among its investments and shows BYMA among
// "Mercados en los que operamos" (with A3 and MAV):
//
//   https://www.matexcapital.com.ar/
//   "Bonos, Obligaciones Negociables, Acciones y CEDEARs: Inversión directa
//   en renta fija y variable, local e internacional."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: no page
// and no tariff line names cable / CCL settlement or dollars held abroad
// (the only transfer lines are "Transferencias especies in / out"). Block
// lines, closed-end funds, bond CEDEARs, rights, warrants and dormant or
// delisted lines are left out by the shared module. Bonds, ONs, letras,
// futures, options, cauciones, cheques and funds are other products. No
// page names a segment, board or title the broker does not trade.
//
// Fees (table on the home page, "Operaciones Máxima"): "Compra/Venta de
// Acciones / Cedears 1,50% directo", plus IVA; account opening and
// maintenance "Sin cargo":
//   https://www.matexcapital.com.ar/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/matex/matex_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Matex Capital", { cable: false });
fs.writeFileSync(new URL("matex-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Matex Capital: ${rows.length} BYMA lines`);
