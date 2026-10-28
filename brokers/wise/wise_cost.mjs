// What one round trip costs at Wise Capital (Wise Capital Securities S.A.,
// ALyC Integral no. 2368 at the CNV, Pilar): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered on its execution platform (app onboarding online). Lines
// in pesos and in MEP dollars (D lines); the catalogue holds no cable (C)
// line.
//
// Read on 2026-10-26. "Comisiones, aranceles y gastos de la cuenta
// comitente" (file of March 2026):
//   https://wise.com.ar/wp-content/uploads/2026/03/Tabla-de-Aranceles-%E2%80%93-Wise-Securities.pdf
//   Column "Arancel Máximo": "Compra / Venta de Acciones y Cedears 2% Por
//   operación", each side. Only a ceiling is printed, so the figure is 2%
//   (owner rule: a discretionary rate takes the max). No minimum.
//   IVA: "A las comisiones expuestas previamente se le deberá adicionar el
//   IVA (impuesto al valor agregado) en caso de corresponder": a share or a
//   CEDEAR takes 21%, so 2.42% a side.
//   "Las comisiones detalladas, serán percibidas en la moneda de cada
//   operación": a dollar line pays its fee in dollars.
//   Market rights: not on the sheet, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "Custodia de Títulos Privados 0", "Apertura de Cuenta 0",
//   "Mantenimiento de Cuenta 0".
//
// Formula, each side: 2% × notional × 1.21 + 0.05% × notional × 1.21; plus
// the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: dividends ("Rentas de Títulos Privados" 2%), transfers ($10
// local, EUR 25 abroad) and code conversions (EUR 25), and BYMA's
// day-trade bonus on the post-trade part (under 0.01% a side; the figure
// assumes another day).
//
// Cash: pesos and dollars (fees taken "en la moneda de cada operación";
// the investments page buys and sells dollars for clients, "compra y venta
// de dólares"; deposits by bank transfer to the ALyC's own accounts), so a
// line settles in its own currency and no FX enters the number; the MEP
// quote's half spread is the remark.
//   https://wise.com.ar/inversiones/
//
//   node brokers/wise/wise_cost.mjs GGAL BCBA ARS --shares=200 --price=7500
//   node brokers/wise/wise_cost.mjs SPY BCBA ARS --shares=70 --price=21500
//   node brokers/wise/wise_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/wise/wise_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "wise",
  name: "Wise Capital",
  catalogue: new URL("wise-parsed.json", import.meta.url),
  schedule: {
    url: "https://wise.com.ar/wp-content/uploads/2026/03/Tabla-de-Aranceles-%E2%80%93-Wise-Securities.pdf",
    page: "https://wise.com.ar/inversiones/",
    readOn: "2026-10-26",
    inForce: "2026-03",
    entity: "Wise Capital Securities S.A. (ALyC Integral n° 2368)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02 },
  vatOnCommission: true,
  basis: "compra-venta de acciones y CEDEARs : arancel máximo 2 % + IVA par sens (maximum retenu), sans minimum ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
