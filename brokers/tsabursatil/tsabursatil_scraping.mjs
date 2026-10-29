// What TSA Bursátil (Transatlántica S.A. Bursátil, ALyC Propio no. 112 at
// the CNV) sells in Buenos Aires shares and CEDEARs online, with no login.
// Its only online place is BYMA (BCBA / XBUE).
//
// Its pages, read 2026-10-28: "¿Cómo operar online en el Mercado de
// Capitales? Realizar operaciones de inversión online y al instante, es
// posible ... herramientas orientadas a inversores ávidos, que buscan
// autonomía e invertir directamente en el Mercado de Capitales". The fee
// page has two tables: "Comisiones por operaciones | Clientes Traders"
// (self-directed): "Acciones y CEDEARs - Compra/Venta 0,50% + IVA", "Sin
// mínimos de arancel para clientes traders"; and "Clientes con asesoramiento
// comercial": "Acciones y CEDEARs - Compra/Venta 1% + IVA" and "Acciones del
// Exterior y ETF - Compra/Venta 1% + IVA + USD 0,02 por título". Foreign
// shares and ETFs are priced only for advised clients (orders through an
// adviser), so they are not an online place and are left out. It publishes
// no list and names no excluded board.
//   https://tsabursatil.com/novedades/Como-operar-online-en-el-Mercado-de-Capitales/
//   https://tsabursatil.com/comisiones/   (fees)
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: local shares and CEDEARs (ETF CEDEARs
// included) that trade, each with its peso line and its MEP-dollar (D)
// line; block lines, closed-end funds, rights, bond CEDEARs and dormant
// lines are left out there. Cable (C) lines are not written: the fee page
// prices MEP transfers and no cable / CCL settlement. broker-list.json
// gives "BYMA".
//
// tsabursatil.com sits behind a bot wall (403 to scripts), so the run does
// not re-read the pages.
//
//   node brokers/tsabursatil/tsabursatil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("TSA Bursátil", { cable: false });
console.error(`TSA Bursátil: ${rows.length} rows`);
fs.writeFileSync(new URL("tsabursatil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
