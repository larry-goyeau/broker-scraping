// What STC Inversiones S.A. (ALyC y AN Propio n° 338 CNV, Rosario; BYMA,
// MAV and Matba Rofex agent) sells in Buenos Aires shares and CEDEARs, with
// no login. It publishes no list of its own. Its services page names local
// shares, CEDEARs and both kinds of stock-market dollars:
//
//   https://stcinversiones.com.ar/servicios/
//   "¿Dónde invertimos? ... Acciones / CEDEARS / Opciones / Fondos Comunes
//   de Inversión / Dólar MEP y CCL (Contado con Liquidación)"
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable lines are kept because
// the broker offers "CCL (Contado con Liquidación)", dollars settled abroad.
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and dormant
// or delisted lines are left out by the shared module. Bonds, ONs, options,
// futures, cauciones, cheques, pagarés and funds are other products. No page
// names a segment, board or title the broker does not trade.
//
// Fees ("Tabla de aranceles y derechos de mercado", October 2026), BYMA
// section: "Contado Renta Variable" arancel maximum 1,30% + IVA, market
// rights 0,05% + IVA; intraday round trips waive the smaller arancel;
// custody (Caja de Valores) free up to $2.000.000 held, then $7.000 or
// $10.000 a month:
//   https://stcinversiones.com.ar/wp-content/uploads/2026/10/STC-Aranceles-Der-Merc.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/stcinversiones/stcinversiones_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("STC Inversiones", { cable: true });
fs.writeFileSync(new URL("stcinversiones-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`STC Inversiones: ${rows.length} BYMA lines`);
