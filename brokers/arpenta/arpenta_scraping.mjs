// What Arpenta (Arpenta Valores S.A., ALyC at the CNV) sells in Buenos
// Aires shares and CEDEARs online, with no login. Its only place is BYMA
// (BCBA / XBUE).
//
// Its pages, read 2026-10-28: the client platform Arpenta+, "PODÉS: Operar
// de manera directa. Consultar tu Estado de Cuenta ... Ver cotizaciones en
// tiempo real y la profundidad del Mercado"; "Activos disponibles: Acciones,
// Bonos, Opciones", "CEDEARs y ETF" ("Invertí en ETF. Los mejores retornos
// del mercado americano", "Cedears: operá en pesos, y recibí dividendos en
// dólares"). It publishes no list and names no excluded board. Fees ("Tabla
// aranceles Arpenta Valores S.A."): "Acciones y CEDEARs Compra / Venta Hasta
// 1,50 %", minimum $150 (a ceiling: the cost file takes 1.50%).
//   https://www.arpenta.com.ar/
//   https://www.arpenta.com.ar/empezar/
//   https://www.arpenta.com.ar/static/files/aranceles.pdf   (fees)
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: local shares and CEDEARs (ETF CEDEARs
// included) that trade, each with its peso line and its MEP-dollar (D)
// line; block lines, closed-end funds, rights, bond CEDEARs and dormant
// lines are left out there. Cable (C) lines are not written: no page or fee
// line names a cable / CCL settlement. broker-list.json gives "BYMA".
//
//   node brokers/arpenta/arpenta_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.arpenta.com.ar/empezar/", [/Operar de manera directa/i]);
await evidence("https://www.arpenta.com.ar/", [/CEDEARs y ETF/, /aranceles\.pdf/]);
await pdf("https://www.arpenta.com.ar/static/files/aranceles.pdf");

const { rows } = await bymaBook("Arpenta", { cable: false });
console.error(`Arpenta: ${rows.length} rows`);
fs.writeFileSync(new URL("arpenta-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
