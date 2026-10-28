// What Fescina (Fescina y Cía. S.A., ALyC Propio n° 188 CNV, BYMA agent
// n° 84) sells in Buenos Aires shares and CEDEARs, with no login. It
// publishes no list of its own. Its home page names local shares, CEDEARs
// and ETFs, and the MEP dollar:
//
//   https://fescina.com/
//   "Acciones / Renta Variable: Invertí en empresas ..."
//   "Cedears - ETF / Mercados Globales: Invertí en grandes empresas
//   internacionales desde Argentina."
//   "Dolar MEP: Comprá y vendé dolar MEP dentro del mercado financiero."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: the
// site names only the MEP dollar, and the tariff has no CCL / cable line
// (international transfers are "Consultar"). Block lines, closed-end funds,
// bond CEDEARs, rights, warrants and dormant or delisted lines are left out
// by the shared module. Bonds, ONs, options, futures, cauciones, cheques and
// funds are other products. No page names a segment, board or title the
// broker does not trade (the FAQ page says "Próximamente").
//
// Fees ("Tabla de Aranceles vigente desde 01/07/2025"): "Acciones Locales -
// Compra/Venta" and "Acciones del Exterior - Compra/Venta" minimum $5.000,
// maximum 2,00%, plus IVA, Caja de Valores and market fees:
//   https://fescina.com/download/aranceles.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/fescina/fescina_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Fescina", { cable: false });
fs.writeFileSync(new URL("fescina-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Fescina: ${rows.length} BYMA lines`);
