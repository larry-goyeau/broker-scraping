// What Portfolio Investment S.A. (PISA, ALyC Integral n° 282 CNV, ACyDI
// n° 130) sells in Buenos Aires shares and CEDEARs, with no login. It
// publishes no list of its own; its pages name CEDEARs and the MEP dollar,
// and its tariff prices "Contado (Renta Fija y Renta Variable)":
//
//   https://portfolioinvestment.com.ar/inversion/
//   "Cedears: Dolarizá tu cartera invirtiendo en acciones de empresas
//   extranjeras en el mercado local."; "Dólar Mep: Operá Dolar Mep con
//   nosotros".
//   https://portfolioinvestment.com.ar/
//   "Fondos, CEDEARS, Cauciones Colocadoras, Echeqs y más instrumentos";
//   "A través de nuestra web o descargá la APP para acceder al Mercado de
//   Capitales de forma directa."
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso and MEP-dollar (D) lines of every local share and CEDEAR that
// BYMA quotes and that trades; block lines, closed-end funds, bond CEDEARs,
// rights, warrants and dormant or delisted lines are left out there. Local
// shares stay: the pages list examples ("y más instrumentos") and the
// tariff's "Renta Variable" covers them. Cable (C) lines are not written:
// no page nor the tariff names cable / CCL settlement or dollars held
// abroad, only the MEP dollar. No page names a segment, board or title it
// does not trade.
//
// Fees ("Aranceles, Comisiones y Recupero", image on the Aranceles page):
// "Contado (Renta Fija y Renta Variable)" minimum 0,01%, maximum 3,00%,
// plus BYMA / A3 / MAV market fees; custody "NO SE COBRA ARANCEL":
//   https://portfolioinvestment.com.ar/aranceles/
//   https://portfolioinvestment.com.ar/wp-content/uploads/2026/05/PI_Aranceles_4_05_2026.png
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/portfolio/portfolio_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Portfolio Investment", { cable: false });
fs.writeFileSync(new URL("portfolio-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Portfolio Investment: ${rows.length} BYMA lines`);
