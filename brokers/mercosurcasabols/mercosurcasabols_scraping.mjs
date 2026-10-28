// What Mercosur Casa de Bolsa sells in shares, with no login.
// Mercosur is a member of the Bolsa de Valores de Caracas (BVC) and deals on
// that exchange only. Its "Intermediación Bursátil" page sells "Compra venta
// de Acciones listadas en la Bolsa de Valores de Caracas, tanto en el mercado
// primario como en el secundario", and its support page answers "¿Es posible
// comprar acciones en el mercado Internacional?" with "En estos momentos no
// disponemos de ese servicio". The page names no board, segment or share it
// leaves out, so the book is the whole BVC equity board, read by the shared
// module bvcBook.mjs (in this folder).
//
// Left out, as in the other BVC scrapers (see bvcBook.mjs):
// - suspended lines (BVC sheet not ACTIVO);
// - dormant lines: no trade this year and no bid or offer on the board
//   (on 2026-10-24: CIE, GZL.A, GZL.B, IMP.A, PIV.A). Mercosur publishes no
//   price list that would name one of them;
// - the closed-end mutual and private-equity funds (PER, RFM, FFV.A, FFV.B).
// The BVC lists no ETF. Renta fija (papeles comerciales, obligaciones…) is
// not a share and stays out.
//
// Fees (support page, "Tarifas y Comisiones"): "Operaciones hasta 500 Bs.
// Comisión fija de 20 Bs. Operaciones superiores a 501Bs, se aplica un %
// equivalente al 4%", plus the BVC's 0.1% registration right, IVA and 1%
// ISLR on sales.
//
//   https://mercosur.com.ve/home/intermediacion-bursatil/
//   https://mercosur.com.ve/home/centrode-sopore/   (FAQ and fees)
//
//   node brokers/mercosurcasabols/mercosurcasabols_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bvcBook } from "./bvcBook.mjs";
import fs from "node:fs";

const rows = await bvcBook({ quiet: true });
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("mercosurcasabols-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
console.error(`${stamped.length} listings. ${rows.report.text}`);
