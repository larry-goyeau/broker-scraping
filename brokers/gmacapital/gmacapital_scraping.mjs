// What GMA Capital S.A. (ALyC y AN Propio n° 139 CNV, "Agente BYMA N°22")
// sells in Buenos Aires shares and CEDEARs, with no login. Its individuals
// page sells trading online through its home broker (home.gmacap.com):
// "Negociá acciones, bonos, Cedears, etc., con un solo click."
//
//   https://www.gmacap.com/que-hacemos/individuos
//
// broker-list.json gives GMA the country place "Argentina". The only
// exchange GMA names is BYMA (its fee schedule signs "Agente BYMA N°22"),
// and BYMA is the only Argentine exchange with a share and CEDEAR board (MAV
// and A3 list none), so the catalogue is BYMA's whole share and CEDEAR
// board, read by ../bancogalicia/bymaBook.mjs: the peso and MEP-dollar (D)
// lines of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and
// QQQ included) that BYMA quotes and that trades; block lines, closed-end
// funds, bond CEDEARs, rights, warrants and dormant or delisted lines are
// left out there. GMA publishes no list and names no restriction. Cable (C)
// lines are not written: the fee schedule's only dollar transfer is
// "Transferencia Dólares (MEP)"; "Mandatos en el Exterior" (orders placed
// abroad on the client's mandate) is not an online product and no foreign
// place is in broker-list.json.
//
// Fees ("Detalle de comisiones y aranceles", served by GMA's own CMS,
// legal-files "COMISIONES & ARANCELES"): "Compra / Venta de Acciones Hasta
// 2,0% + IVA – Comisión Mínima $ 19,90 + IVA"; "Derechos de Mercado –
// Acciones 0,08% + IVA":
//   https://res.cloudinary.com/dzahonrdb/image/upload/v1733341827/GMA_production/comisiones_y_aranceles2_compressed_1_5e530c4475.pdf
//   (linked from https://www.gmacap.com/terminos-y-condiciones)
//
//   node brokers/gmacapital/gmacapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.gmacap.com/que-hacemos/individuos", [/Negoci[aá] acciones, bonos, Cedears/]);
await pdf("https://res.cloudinary.com/dzahonrdb/image/upload/v1733341827/GMA_production/comisiones_y_aranceles2_compressed_1_5e530c4475.pdf");

const { rows } = await bymaBook("GMA Capital", { cable: false });
if (rows.length < 500) throw new Error(`only ${rows.length} BYMA lines`);
fs.writeFileSync(new URL("gmacapital-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`GMA Capital: ${rows.length} BYMA lines`);
