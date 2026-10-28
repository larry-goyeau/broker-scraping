// What Macro Securities (Macro Securities S.A.U., ALyC y AN Integral no. 59
// at the CNV, the broker of Banco Macro) sells in Buenos Aires shares and
// CEDEARs, with no login. Its only place is BYMA (BCBA / XBUE).
//
// Its brokerage page, read 2026-10-25, offers the whole market: "Operá de
// manera ágil la totalidad de los productos financieros" (products page),
// and under "Brokerage": "Acciones locales y extranjeras", "Títulos públicos
// ... Operatoria en pesos y dólares", "Productos derivados (Opciones,
// Futuros, ETFs)" and "CEDEARs". It publishes no list of its own and names
// no excluded board.
//   https://www.macro.com.ar/macrosecurities/intermediacion-bursatil
//   https://www.macro.com.ar/macrosecurities/productos
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: local shares and CEDEARs (ETF CEDEARs
// included) that trade, each with its peso line and its MEP-dollar (D)
// line; block lines, closed-end funds, rights, bond CEDEARs and dormant
// lines are left out there. Cable (C) lines are not written: the site and
// the tariff name no cable / CCL settlement or transfer abroad; the tariff
// only says fees are computed "en $ o U$S según la moneda de la operación".
// Bonds, ONs, options, futures and cauciones are other products.
//
// Fees ("Tabla de Aranceles Indicativos"): "Compra/ Venta de Títulos
// Privados 1,00 %", "Arancel Mínimo $ 5", plus IVA on private securities and
// the market rights:
//   https://www.macro.com.ar/macrosecurities/documento/1517351172498
//
//   node brokers/macro/macro_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Macro Securities", { cable: false });
console.error(`Macro Securities: ${rows.length} rows`);
fs.writeFileSync(new URL("macro-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
