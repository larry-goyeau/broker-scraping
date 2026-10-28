// What Omega Bursátil (Omega Bursatil S.A., Agente de Negociación n° 636
// CNV, BYMA member n° 810; Rosario Valores S.A., ALyC Integral n° 39,
// clears its trades) sells in Buenos Aires shares and CEDEARs, with no
// login. It publishes no list of its own. Its products page names local
// shares, CEDEARs and both the MEP and the cable dollar:
//
//   https://www.omegabursatil.com/productos
//   "Instrumentos financieros para tus inversiones de largo y corto plazo:
//   Acciones / Bonos / Opciones / ... / Dolar CCL / ... / Dolar Mep /
//   CEDEARs / ..."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable lines are kept because
// the broker offers the cable dollar ("Dolar CCL") next to the MEP dollar.
// The same page's "Instrumentos del mercado internacional" (ETFs, shares,
// Treasury bills abroad) are a foreign market, not read here. Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module. Bonds, ONs, options, futures,
// cauciones, pagarés, letras and funds are other products. No page names a
// segment, board or title the broker does not trade.
//
// Fees ("Tabla de aranceles (Jun 2026)", the "Aranceles" link of the
// products page): "Contado / Privado" maximum 3,00% (General) or 0,25%
// (Online), "Arancel Mínimo por operación: AR$ 0.00", plus IVA and the
// Buenos Aires market fee 0,08%:
//   https://www.omegabursatil.com/_files/ugd/71fa66_18fe373342ba40e9883876c5efcbe124.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/omegabursatil/omegabursatil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Omega Bursátil", { cable: true });
fs.writeFileSync(new URL("omegabursatil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Omega Bursátil: ${rows.length} BYMA lines`);
