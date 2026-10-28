// What Integrar Inversiones (Integrar S.A., "Agente de Liquidación y
// Compensación y Agente de Negociación Propio Matrícula CNV 261", Santa Fe)
// sells in Buenos Aires shares and CEDEARs, with no login. Its only place
// is BYMA (BCBA / XBUE).
//
// Its pages, read 2026-10-25:
//   https://integrarinversiones.com.ar/instrumentos-bursatiles/
//   the instrument list names "Acciones" and "CEDEARs" next to bonds,
//   funds, options and futures.
//   https://integrarinversiones.com.ar/preguntas-frecuentes/
//   orders "de manera ON LINE a través del Home Broker o la App", by phone,
//   e-mail or WhatsApp, or at its offices.
//   https://integrarinversiones.com.ar/servicios/dolar-mep/
//   dollars are bought and sold as MEP ("la compra de activos en pesos y su
//   posterior venta en dólares"; "Al momento de la venta en D ...").
//
// No list, panel or kind of share is left out, so the catalogue is BYMA's
// whole share and CEDEAR board, read by ../bancogalicia/bymaBook.mjs: the
// leader and general panels and every CEDEAR (ETF certificates such as SPY
// and QQQ included), each with its peso line and its MEP-dollar (D) line.
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and lines
// with no trade in months are left out by that module.
//
// Cable (C) lines are not written: the pages name only the MEP dollar, and
// the fee grid has no cable, CCL or foreign-transfer line. Bonds, letras,
// ONs, options, futures, cauciones, cheques and funds are other products.
//
// Fees ("ANEXO II - GRILLA COMISIONAL", from 1 May 2026): "Acciones - Bonos
// - CEDEARs" 1.00% by desk, 0,50% "Por Plataforma (HB o App)", $300
// minimum, plus VAT and market fees:
//   https://integrarinversiones.com.ar/wp-content/uploads/ANEXO-II-ARANCELES-.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/integrarinversio/integrarinversio_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Integrar Inversiones", { cable: false });
fs.writeFileSync(new URL("integrarinversio-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Integrar Inversiones: ${rows.length} rows`);
