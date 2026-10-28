// What Bell Investment S.A. ("Bell Investments", ALyC Propio n° 169 CNV,
// ACyD Integral n° 15) sells in Buenos Aires shares and CEDEARs, with no
// login. It publishes no list of its own. Its products page says it trades
// every instrument enabled on the Argentine markets, local and foreign
// shares included:
//
//   https://www.bellinvestments.com.ar/productos
//   "Negociamos todos los instrumentos financieros habilitados en los
//   principales mercados de Argentina, Latinoamérica y el mundo."
//   "Acciones: ... socio de reconocidas empresas ya sea locales o del
//   exterior."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable lines are kept because
// Bell's client notices explain how its clients trade "modalidad Cable" and
// "dólares MEP y CCL", CEDEARs named among the assets that can settle in
// dollars ("Serie C"):
//   https://www.bellinvestments.com.ar/news-detail/17-importante
//   https://www.bellinvestments.com.ar/news-detail/18-importante
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and dormant
// or delisted lines are left out by the shared module. Bonds, letras, ONs,
// options, futures, cauciones, cheques and funds are other products. No page
// names a segment, board or title the broker does not trade.
//
// Fees ("Aranceles", linked from every page footer): "Compra y venta de
// privados" minimum $50, 0,15% to 1,5%; "Mantenimiento por custodio" $40 a
// month:
//   https://www.bellinvestments.com.ar/download/aranceles.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/bellinvestments/bellinvestments_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Bell Investments", { cable: true });
fs.writeFileSync(new URL("bellinvestments-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Bell Investments: ${rows.length} BYMA lines`);
