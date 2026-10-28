// What Finco Capital (Finco Capital S.A., AN ALyC P n° 596 CNV, BYMA agent
// n° 260) sells in Buenos Aires shares and CEDEARs, with no login. Its
// product pages name local shares, CEDEARs and CEDEARs of ETFs, with a
// sample of names only ("Donde podés invertir": AAPL, KO, MELI, SPY, XLP...),
// not a closed list:
//
//   https://finco.com.ar/productos/acciones/
//   https://finco.com.ar/productos/cedears/
//   "Invertí desde Argentina en pesos o dólares." ETFs: "La operatoria es
//   la misma de para operar CEDEARs, están listados de la misma manera"
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable lines are kept because
// the broker sells the cable dollar and prices it: tariff line "Compra/Venta
// Dólar MEP – CCL", and its product page explains "Dólar CABLE o Dólar CCL
// consiste en la compra de un bono en pesos para su posterior venta en
// dólares C", paid to the client's bank account abroad.
//   https://finco.com.ar/productos/dolar-mep-y-ccl/
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and dormant
// or delisted lines are left out by the shared module. Bonds, letras, ONs,
// options, cauciones and funds are other products. No page names a segment,
// board or title the broker does not trade.
//
// Fees ("Tarifas", November 2025, Trading Online): "Compra/Venta Acciones"
// and "Compra/Venta CEDEAR'S" minimum 0 up to 0,30% per trade; "Trading
// Asistido hasta 2%"; account opening and maintenance free; plus IVA and
// BYMA / Caja de Valores fees:
//   https://finco.com.ar/tarifas/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/finco/finco_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Finco Capital", { cable: true });
fs.writeFileSync(new URL("finco-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Finco Capital: ${rows.length} BYMA lines`);
