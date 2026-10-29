// What Banchile Inversiones (Banchile Corredores de Bolsa S.A., Banco de
// Chile group) sells online in shares and ETFs, with no login. Banco de
// Chile's help centre: "Cualquier cliente enrolado en Banchile Inversiones
// ... puede comprar y vender acciones de manera fácil y rápida" from Banco
// en Línea; Banchile's FAQ names the digital channel "App Mi_INVERSIÓN,
// www.banchileinversiones.cl, www.bancochile.cl". Its site sells "Acciones
// Chile", "Acciones Mundo" and "ETFs iShares". It publishes no list.
//
//   https://sitiospublicos.bancochile.cl/personas/centro-de-ayuda/detalle/quiero-comprarvender-acciones-lo-puedo-hacer-desde-banco-en-linea
//   https://sitiospublicos.bancochile.cl/banchileinversiones/acciones-chile
//
// broker-list.json names one place, the Santiago Stock Exchange. So the
// catalogue is the Bolsa de Comercio de Santiago's share and ETF book, read
// by ./santiagoBook.mjs: Chilean shares, the foreign shares and ETFs of the
// exchange's foreign-securities market and the Chilean ETFs, in pesos
// (ordinary investment and mutual-fund lines and dormant lines left out
// there). The dollar lines are left out: "La operativa a través de nuestro
// sitio web Banchileinversiones.cl y nuestra app Mi Inversión solo se
// realiza en pesos, por tanto, si desea comprar acciones mundo en dólares,
// deberá hacerlo a través de un ejecutivo de inversión":
//   https://sitiospublicos.bancochile.cl/banchileinversiones/preguntas-frecuentes/como-comprar-y-vender-acciones
// The iShares ETFs Banchile also sells abroad (BlackRock partnership) have
// no broker-list place and are not added.
//
// Fees (Banchile FAQ): "Comisión de canal digital (App Mi_INVERSIÓN,
// www.banchileinversiones.cl, www.bancochile.cl) : Comisión mínima de 0,12
// UF + IVA Comisión ficha 0,8% + IVA"; executive channel minimum 0,8 UF:
//   https://ww2.banchileinversiones.cl/web/empresas/p-preguntas-frecuentes
// That FAQ answers 503 to scripts and the Banchile product pages are drawn
// by script, so the run checks only the Banco de Chile help page.
//
// The Santiago exchange's site sits behind a bot manager: the price list is
// read in the owner's Chrome on port 9222 (see ./santiagoBook.mjs).
//
//   node brokers/banchile/banchile_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { santiagoBook } from "./santiagoBook.mjs";

await evidence("https://sitiospublicos.bancochile.cl/personas/centro-de-ayuda/detalle/quiero-comprarvender-acciones-lo-puedo-hacer-desde-banco-en-linea", [/enrolado en Banchile Inversiones/, /comprar y vender acciones/]);

const book = await santiagoBook("Banchile", { currencies: ["CLP"] });
const rows = stampRows(withoutObligations(book.map(({ traded, ...row }) => row)));
fs.writeFileSync(new URL("banchile-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`Banchile: ${rows.length} Santiago rows`, book.kinds, `left out ${book.dropped.length}`);
