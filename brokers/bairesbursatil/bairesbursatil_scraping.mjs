// What Baires Bursátil S.A. (ALyC n° 195 CNV, BYMA agent n° 60) sells in
// Buenos Aires shares and CEDEARs, with no login. It publishes no list of
// its own; its pages say it takes part in every operation BYMA authorises:
//
//   https://www.bairesbursatil.com.ar/servicios.php
//   "Participamos de las operatorias autorizadas por Bolsas y Mercados
//   Argentinos S.A. (BYMA) tanto en la Negociación Primaria como
//   Secundaria."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: no page
// and no tariff line names cable / CCL settlement or dollars held abroad
// (the only transfer lines are "Transferencias internas" and "Transferencias
// a Otros Depositantes"). Block lines, closed-end funds, bond CEDEARs,
// rights, warrants and dormant or delisted lines are left out by the shared
// module. Bonds, options, cauciones, pases and loans are other products. No
// page names a segment, board or title the broker does not trade.
//
// Fees ("Cuadros de Aranceles", in force from 01/12/2024): "Compra / Venta
// de Acciones hasta 2.00% +IVA (minimo: $1000 + IVA)"; custody / account
// maintenance $2000 + IVA:
//   https://www.bairesbursatil.com.ar/aranceles.php
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/bairesbursatil/bairesbursatil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Baires Bursátil", { cable: false });
fs.writeFileSync(new URL("bairesbursatil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Baires Bursátil: ${rows.length} BYMA lines`);
