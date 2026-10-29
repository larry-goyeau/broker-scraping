// What Bci Inversiones (Bci Corredor de Bolsa S.A.) sells online in shares
// and ETFs, with no login. Its page "Invierte 100% online en Acciones"
// says "Más de 80 acciones y 230 ETF disponibles"; it publishes no list.
//
//   https://www.bci.cl/inversiones/soluciones-de-inversion/acciones
//
// broker-list.json names one place, the Santiago Stock Exchange. A stated
// count and no list: by the owner's rule the catalogue is the 80 most
// traded shares and the 230 most traded ETFs of the Bolsa de Comercio de
// Santiago's book (../banchile/santiagoBook.mjs: Chilean shares, the
// foreign shares and ETFs of the exchange's foreign-securities market and
// the Chilean ETFs, in pesos and in dollars as the exchange quotes each
// line; ordinary investment and mutual-fund lines and dormant lines left
// out), ranked by the day's traded amount on the exchange's price list
// (topSantiago; one ticker is one title, all its currency lines kept). The
// counts are per kind as the page gives them.
//
// Fees: Bci's share page says online orders pay a lower commission than
// the other channels without printing it; its share fact page prints
// "Comisión por Transacción: 1,5% + IVA", "Comisión mínima de Transacción:
// $ 18.000 + IVA", "Costo Operacional por Facturación (Diario si hay
// transacciones): $ 7.000 + IVA", custody "Sin costo":
//   http://www.bci.cl/empresarios/inversiones/acciones/conozcamassobreacciones.html
// www.bci.cl/inversiones answers 403 to scripts; the run checks the fact
// page only.
//
// The Santiago exchange's site sits behind a bot manager: the price list is
// read in the owner's Chrome on port 9222 (see ../banchile/santiagoBook.mjs).
//
//   node brokers/bciinversiones/bciinversiones_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { santiagoBook, topSantiago } from "../banchile/santiagoBook.mjs";

const COUNTS = { STOCK: 80, ETF: 230 };
await evidence("http://www.bci.cl/empresarios/inversiones/acciones/conozcamassobreacciones.html", [/1,5% \+ IVA/, /18\.000 \+ IVA/]);

const book = await santiagoBook("Bci Inversiones");
const top = topSantiago(book, COUNTS);
const rows = stampRows(withoutObligations(top.map(({ traded, ...row }) => row)));
const titles = (type) => new Set(rows.filter((row) => row.type === type).map((row) => row.ticker)).size;
if (titles("STOCK") < COUNTS.STOCK * 0.95) throw new Error(`only ${titles("STOCK")} share titles`);
fs.writeFileSync(new URL("bciinversiones-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`Bci Inversiones: ${rows.length} Santiago rows, ${titles("STOCK")} share and ${titles("ETF")} ETF titles of ${book.length} lines`);
