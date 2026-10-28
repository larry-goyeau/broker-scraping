// What Futuro Bursátil sells in Buenos Aires shares and CEDEARs, with no
// login. It publishes no list of its own. Its site (a single-page app; the
// text below is in its bundle, /assets/index-*.js) names shares and CEDEARs
// and online trading:
//
//   https://www.futurobursatil.com.ar/
//   "Acciones y CEDEARs: Acceso a mercado local y extranjero. Invertí en
//   las principales empresas del mundo."; "Asesoramiento profesional y
//   plataforma de trading online."
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso and MEP-dollar (D) lines of every local share and CEDEAR that
// BYMA quotes and that trades; block lines, closed-end funds, bond CEDEARs,
// rights, warrants and dormant or delisted lines are left out there. The
// tariff's "Accs. Ext. y ETFs - C/V (mandato)" line is shares and ETFs
// bought abroad under mandate, not BYMA, and is not this place. Cable (C)
// lines are not written: the tariff names "Transfer. Receptora USD MEP" and
// no cable / CCL settlement or dollar account abroad. No page names a
// segment, board or title it does not trade on BYMA.
//
// Fees (the "Aranceles" panel of the home page): "Acciones y Cedears -
// Compra/Venta 0.70% + I.V.A. + a)", "SIN MINIMO", with "Derechos Mercado
// a) 0.08% + iva"; account maintenance "$82.64 + IVA" a month:
//   https://www.futurobursatil.com.ar/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/futurobursatil/futurobursatil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Futuro Bursátil", { cable: false });
fs.writeFileSync(new URL("futurobursatil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Futuro Bursátil: ${rows.length} BYMA lines`);
