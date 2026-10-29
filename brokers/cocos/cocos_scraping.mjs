// What Cocos Capital (Cocos Capital S.A., ALyC Propio no. 688 at the CNV)
// sells in Buenos Aires shares and CEDEARs, with no login. Its only place
// is BYMA (BCBA / XBUE); orders are placed in the Cocos app.
//
// Its pages, read 2026-10-28: "Acciones" and "CEDEARs" pages ("Descargá la
// app de Cocos y abrí tu cuenta", "Transferí pesos o dólares", "Elegí tu
// CEDEAR"; the CEDEAR quotes shown include the ETF CEDEAR EWZ "ETF Brasil
// (iShares)"; "Estos son solo algunos de los más conocidos"). The
// tarifario: "Compra / Venta de acciones en pesos ... Web/app · Personas
// humanas 0,45%", "Compra / Venta de CEDEARs en pesos ... Web/app ·
// Personas humanas 0,45%", "Compra / Venta activos liquidación USD ...
// Web/app · Personas humanas 0,45%" ("Comisiones máximas a aplicar por tipo
// de operación", "Los precios indicados no incluyen IVA"). It publishes no
// list and names no excluded board.
//   https://cocos.capital/tarifario   (fees)
//   https://cocos.capital/inversiones/acciones
//   https://cocos.capital/inversiones/cedears
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: local shares and CEDEARs (ETF CEDEARs
// included) that trade, each with its peso line and its MEP-dollar (D)
// line; block lines, closed-end funds, rights, bond CEDEARs and dormant
// lines are left out there. Cable (C) lines are not written: the tarifario
// prices "activos liquidación USD" and an incoming cable transfer
// ("Transferencia dólares cable entrante USD 10"), but no cable / CCL
// trading or settlement abroad. broker-list.json gives "BYMA".
//
// cocos.capital sits behind a bot wall (403 to scripts), so the run does
// not re-read the pages.
//
//   node brokers/cocos/cocos_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Cocos Capital", { cable: false });
console.error(`Cocos Capital: ${rows.length} rows`);
fs.writeFileSync(new URL("cocos-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
