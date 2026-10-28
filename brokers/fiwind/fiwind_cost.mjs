// What one round trip costs at Fiwind (Fiwind Capital S.A., ALYCI n° 2231
// CNV): buy n Buenos Aires shares or CEDEARs (ETF certificates included) at
// price p and sell them back, in dollars, ordered in the app, on the web or
// on the Matriz DMA screen. Lines in pesos and in MEP dollars (D lines).
//
// Read on 2026-10-26. "Comisiones", "Comisiones de Fiwind Capital":
// "Acciones 0.25% * Directo", "CEDEARS 0.25% * Directo"; "Derechos de
// mercado ... Acciones 0.05% * BYMA", "CEDEARS 0.05% * BYMA"; "* Comisiones
// máximas a aplicar por tipo de operación. Los precios indicados no incluyen
// IVA":
//   https://www.fiwind.io/comisiones
// Fiwind Capital's "Tarifario Vigente", "Arancel máximo*": Acciones and
// CEDEARs "Atención comercial 0.75%", "DMA / Plataforma Personas humanas
// 0.25%", "Personas jurídicas 0.40%"; "Mantenimiento de cuenta BONIFICADO";
// "Custodia mensual CVSA ... Proporcional gastos CVSA":
//   https://cdn.prod.website-files.com/66266ccf0f7bd06b7698bf0a/6a6ba00d4fcdd5d56a9af793_Tarifario%20Vigente%20-%20FW%20CAPITAL.pdf
//   The figure is the platform rate for a person, 0.25% + 21% IVA = 0.3025%
//   a side, no minimum; BYMA's 0.05% + IVA = 0.0605% a side (BYMA's August
//   2026 table, same figure). The 0.75% adviser channel ("Atención
//   comercial") is not an online price and is left out.
//   Left out: dividends 1%, cable deposits (USD 20) and sends (USD 25),
//   custody at Caja de Valores' cost: not this order. No same-session rate
//   is printed.
//
// Formula, each side: 0.25% × notional × 1.21 + 0.05% × notional × 1.21, plus
// the book (spreads/byma-touch.mjs) and a tax when taxMap.mjs names one.
//
// Cash: pesos and dollars. "podés depositar y retirar Pesos Argentinos (ARS)
// y Dólares Americanos (USD)"; the comitente account buys and sells the MEP
// dollar ("Si vendés dólar MEP: utilizás dólares para obtener pesos") and
// the tariff prints "Retiro de dólares SIN COSTOS". A line settles in its
// own currency and no FX enters the number; the remark is the MEP quote.
//   https://help.fiwind.io/es/articles/16348618-compra-y-vende-dolar-mep-en-fiwind
//
//   node brokers/fiwind/fiwind_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/fiwind/fiwind_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/fiwind/fiwind_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "fiwind",
  name: "Fiwind",
  catalogue: new URL("fiwind-parsed.json", import.meta.url),
  schedule: {
    url: "https://cdn.prod.website-files.com/66266ccf0f7bd06b7698bf0a/6a6ba00d4fcdd5d56a9af793_Tarifario%20Vigente%20-%20FW%20CAPITAL.pdf",
    page: "https://www.fiwind.io/comisiones",
    readOn: "2026-10-26",
    entity: "Fiwind Capital S.A. (ALYCI n° 2231 CNV)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.0025 },
  vatOnCommission: true,
  basis:
    "« Tarifario Vigente » de Fiwind Capital et page « Comisiones », relus le 2026-10-26 : actions et CEDEAR, DMA / plateforme, personne physique, " +
    "0,25 % maximum + IVA par sens, sans minimum ; droits de marché BYMA 0,05 % + IVA par sens",
  notes: ["canal « Atención comercial » 0,75 % (conseiller) hors calcul", "maintenance de compte bonifiée"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
