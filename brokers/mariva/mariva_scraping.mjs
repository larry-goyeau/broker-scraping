// What Mariva Bursátil (Mariva Bursátil S.A., ALyC y AN Integral no. 146 at
// the CNV, BYMA agent no. 109) sells in Buenos Aires shares and CEDEARs
// online, with no login. Its only place is BYMA (BCBA / XBUE); it is also a
// member of the Mercado Argentino de Valores, which has no share segment.
//
// Its pages, read 2026-10-28: "Operá en BYMA con Mariva ProTrader"; the
// ProTrader user manual has screens for "Acciones Locales", "CEDEARS",
// "Bonos", "Cauciones", "Opciones" and a "Módulo Dólar MEP". It publishes
// no list and names no excluded board. Fees ("aranceles mb desde
// 20260908"): "COMPRA Y VENTA DE ACCIONES ... 2,00% Mínimo: ARS 75,00 o USD
// 1,00", and the same 2,00% for "valores negociables públicos y/o privados
// (excepto acciones)", CEDEARs among them.
//   https://www.marivabursatil.com.ar/
//   https://www.marivabursatil.com.ar/comisiones
//   https://www.marivabursatil.com.ar/sites/default/files/aranceles_mb_desde_20260908.pdf   (fees)
//   https://www.marivabursatil.com.ar/sites/default/files/manual_de_usuario_-_mariva_protrader_v2.0.7.0_17.12.2025.pdf
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: local shares and CEDEARs (ETF CEDEARs
// included) that trade, each with its peso line and its MEP-dollar (D)
// line; block lines, closed-end funds, rights, bond CEDEARs and dormant
// lines are left out there. Cable (C) lines are not written: the platform
// and the fee table name the MEP dollar and no cable / CCL settlement.
// broker-list.json gives "BYMA".
//
//   node brokers/mariva/mariva_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.marivabursatil.com.ar/", [/Operá en BYMA con Mariva ProTrader/]);
await evidence("https://www.marivabursatil.com.ar/comisiones", [/aranceles_mb_desde_20260908\.pdf/]);
await pdf("https://www.marivabursatil.com.ar/sites/default/files/aranceles_mb_desde_20260908.pdf");

const { rows } = await bymaBook("Mariva Bursátil", { cable: false });
console.error(`Mariva Bursátil: ${rows.length} rows`);
fs.writeFileSync(new URL("mariva-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
