// What Fiwind sells in Buenos Aires shares and CEDEARs, with no login.
// Fiwind's stock trading runs through Fiwind Capital S.A. ("ALYCI - Registro
// ante CNV N° 2231"). Its help centre, "¿Qué activos puedo operar?": "Con tu
// cuenta comitente vas a poder utilizar tus pesos para operar distintos
// instrumentos financieros, como acciones, CEDEARs, dólar MEP, fondos
// comunes de inversión y letras"; a CEDEAR can be traded "en pesos o en
// dólares, según la especie". Buying: "Buscá el activo que querés comprar".
//   https://help.fiwind.io/es/articles/13836016-que-activos-puedo-operar
//   https://help.fiwind.io/es/articles/13836018-como-puedo-comprar-un-activo
//
// It names no list of its own and leaves no panel out, so the catalogue is
// BYMA's whole share and CEDEAR board, read by ../bancogalicia/bymaBook.mjs:
// every local share and CEDEAR (ETF certificates such as SPY and QQQ
// included), each with its peso line and its MEP-dollar (D) line. Block
// lines, closed-end funds, bond CEDEARs, rights, warrants and lines with no
// trade in months are left out by that module.
//
// The app orders are in pesos ("comprar un activo en fiwind capital usando
// tus pesos"), but clients also get Matriz, a direct market access screen on
// BYMA, free on request ("podés solicitarnos y activar tu acceso a DMA
// gratis"), and the MEP dollar is a product of the account, so the D lines
// stay. Cable (C) lines are not written: no page names cable or CCL
// settlement (its USD transfers abroad are ACH and Wire from the crypto
// side). Letras, cauciones and funds are other products.
//   https://help.fiwind.io/es/articles/14476989-como-solicitar-acceso-a-matriz-dma
//
// Fees (app: "Acciones 0.25%", "CEDEARS 0.25%" as maximums, BYMA market fee
// 0.05%, VAT extra; Fiwind Capital tariff: 0.25% on "DMA / Plataforma",
// 0.75% "Atención comercial"):
//   https://www.fiwind.io/comisiones
//   https://cdn.prod.website-files.com/66266ccf0f7bd06b7698bf0a/6a6ba00d4fcdd5d56a9af793_Tarifario%20Vigente%20-%20FW%20CAPITAL.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/fiwind/fiwind_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Fiwind", { cable: false });
fs.writeFileSync(new URL("fiwind-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Fiwind: ${rows.length} rows`);
