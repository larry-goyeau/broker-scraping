// What Listro Valores (Listro Valores S.A., Agente de Negociación n° 155
// CNV, Rosario) sells in Buenos Aires shares and CEDEARs, with no login. It
// publishes no list of its own. Its services page names shares and CEDEARs
// among its instruments, and its tariff charges BYMA (and MAV) market fees
// on private securities:
//
//   https://listrovalores.com/servicios
//   "INSTRUMENTOS DE INVERSIÓN / Acciones y Cedears / Títulos Públicos /
//   Bonos / Cauciones Bursátiles / ..."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included:
// the site names CEDEARs without excluding any) that BYMA quotes and that
// trades. Cable (C) lines are not written: no page nor the tariff names
// cable / CCL settlement or dollars held abroad. Block lines, closed-end
// funds, bond CEDEARs, rights, warrants and dormant or delisted lines are
// left out by the shared module. Bonds, letras, ONs, options, futures,
// cauciones, cheques and fideicomisos are other products. No page names a
// segment, board or title the broker does not trade.
//
// Fees ("ARANCELES Y GASTOS PARA OPERATORIA DE MERCADO", updated January
// 2026; the "Comisiones y Derechos de mercado" link of the home page):
// "Compra/Venta de Títulos Privados" maximum 1 % + IVA (minimum $50 + IVA),
// BYMA market fee 0,08% + IVA; account maintenance free for general
// accounts:
//   https://img1.wsimg.com/blobby/go/048e81c1-c434-409c-8d68-42baebd015d1/cuadro%20gastos%20enero%202026.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/listrovalores/listrovalores_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Listro Valores", { cable: false });
fs.writeFileSync(new URL("listrovalores-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Listro Valores: ${rows.length} BYMA lines`);
