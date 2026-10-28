// What Bancor (Banco de la Provincia de Córdoba S.A., through "Bancor
// Inversiones") sells in Buenos Aires shares and CEDEARs, with no login. It
// publishes no list of its own. Its pages, read 2026-10-25:
//
//   https://www.bancor.com.ar/personas/inversiones/compra-venta-de-valores-negociables
//   "Operaciones con valores negociables en mercado secundario"; its FAQ
//   lists "Mercado Secundario: Compra – Venta de Valores Negociables" and
//   asks for "una caja de ahorro en $ y/o en dólares para operar".
//   https://www.bancor.com.ar/downloads/empresas/tutorial-como-operar-bonos-y-acciones_bancor-inversiones-3.pdf
//   orders in Bancón, "Inversiones > Bonos y Acciones", instrument "Bonos" or
//   "Acciones" (its example is "CEDEAR MERCADO LIBRE MELI"), with a
//   "Moneda" field on the order.
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs from BYMA's open data
// (https://open.bymadata.com.ar/): the peso and MEP dollar (D) lines of
// every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable (C) lines are not
// written: no Bancor page nor its tariff names cable / CCL settlement or
// dollars held abroad. Block lines, closed-end funds, bond CEDEARs, rights,
// warrants and dormant or delisted lines are left out by the shared module.
// Bonds, letras, licitaciones, cheques, FCIs and derivatives are other
// products. No page names a segment, board or title the bank does not
// trade.
//
// Fees ("Comisiones cuenta de inversión", June 2024): "Compra / Venta rueda
// Garantizada (o por cuenta y orden) Hasta 0,80% Mín $200 por operación"
// ($242 with VAT); custody "0,025% sobre el saldo valuado a fin de mes Min
// $180":
//   https://www.bancor.com.ar/assets-e2/uploads/cuenta_de_inversion_junio2024_c802974cb9.pdf
//
// broker-list.json names one place, Argentina, with no restriction.
//
//   node brokers/bancor/bancor_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Bancor", { cable: false });
fs.writeFileSync(new URL("bancor-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Bancor: ${rows.length} BYMA lines`);
