// What Benedit Bursátil S.A. (ALyC y AN Propio n° 271 CNV, BYMA and MAV
// member) sells in Buenos Aires shares and CEDEARs, with no login. It
// publishes no list of its own. Its products page names local shares and
// CEDEARs, traded in pesos and in foreign currency:
//
//   https://www.beneditsa.com.ar/productos
//   "Invertir en acciones permite asociarse a grandes empresas ..."
//   CEDEARs: "certificados de acciones de empresas del exterior que cotizan
//   en el mercado argentino." "Negociación en moneda local y extranjera".
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable lines are kept because
// the tariff lets clients hold dollars abroad: "Recepción/transferencia de
// dólares en las cuentas monetarias de Benedit en el exterior U$S 40", and
// its share line has a dollar minimum (U$S 2,50). The tariff's share line is
// for BYMA's PPT segment ("Valores Negociables Privados
// (ON/Acciones/cupones/certificados) en segmento PPT"), which is the board
// read here. Block lines, closed-end funds, bond CEDEARs, rights, warrants
// and dormant or delisted lines are left out by the shared module. Bonds,
// ONs, options, futures, cauciones, cheques, pagarés and funds are other
// products. No page names a title the broker does not trade.
//
// Fees ("ARANCELES, GASTOS E IMPUESTOS", November 2025): "Compra/Venta -
// Contado /plazo Valores Negociables Privados ... en segmento PPT" minimum
// $500 / U$S 2,50, maximum 1,5%, plus market fees and IVA; custody passes on
// the Caja de Valores tariff:
//   https://beneditsa.com.ar/sites/default/files/descargas/Comisiones-NOVIEMBRE-2025.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/beneditbursatil/beneditbursatil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Benedit Bursátil", { cable: true });
fs.writeFileSync(new URL("beneditbursatil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Benedit Bursátil: ${rows.length} BYMA lines`);
