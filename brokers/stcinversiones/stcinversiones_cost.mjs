// What one round trip costs at STC Inversiones (STC Inversiones S.A., ALyC
// y AN Propio n° 338 CNV, Rosario): buy n Buenos Aires shares or CEDEARs
// (ETF certificates included) at price p and sell them back, in dollars.
// Lines in pesos, MEP dollars (D lines) and cable dollars (C lines).
//
// Read on 2026-10-26. "TABLA DE ARANCELES Y DERECHOS DE MERCADO" (file
// uploaded 2026-10, linked from the home page):
//   https://stcinversiones.com.ar/wp-content/uploads/2026/10/STC-Aranceles-Der-Merc.pdf
//   BOLSAS Y MERCADOS ARGENTINOS, "Contado Renta Variable": "Arancel
//   Máximo 1,30 % + IVA", "Derechos de Mercado 0,05% + IVA", each side. No
//   minimum is printed. Only the ceiling is printed, so the figure is 1.30%
//   (owner rule: take the max) plus 21% IVA. The rights line is BYMA's own
//   0.05% + IVA (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado
//   sobre Operaciones", 2026-08-14). One schedule for every channel: no
//   separate online rate.
//   "En operaciones intradiarias de compra y venta de títulos públicos y/o
//   privados, se bonificará el arancel de menor importe": the remark; the
//   figure assumes the sale is another day.
//
// Formula, each side: 1.30% × notional × 1.21 + 0.05% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "MANTENIMIENTO DE CUENTA MENSUAL" (free up to $2,000,000 held,
// then $7,000 or $10,000 a month; nothing on a USD 1,000 position),
// "Liquidación de Dividendos 3,00 % + IVA", and BYMA's day-trade bonus on
// the post-trade part (under 0.01% a side).
//
// Cash: pesos and dollars (services page: "Dólar MEP y CCL (Contado con
// Liquidación)"; the tariff has dollar cauciones), so a line settles in its
// own currency and no FX enters the number; the MEP quote's half spread is
// the remark (the CCL quote on a cable line).
//   https://stcinversiones.com.ar/servicios/
//
//   node brokers/stcinversiones/stcinversiones_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/stcinversiones/stcinversiones_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/stcinversiones/stcinversiones_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/stcinversiones/stcinversiones_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "stcinversiones",
  name: "STC Inversiones",
  catalogue: new URL("stcinversiones-parsed.json", import.meta.url),
  schedule: {
    url: "https://stcinversiones.com.ar/wp-content/uploads/2026/10/STC-Aranceles-Der-Merc.pdf",
    page: "https://stcinversiones.com.ar/",
    readOn: "2026-10-26",
    inForce: "2026-10",
    entity: "STC Inversiones S.A. (ALyC y AN Propio n° 338)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.013 },
  vatOnCommission: true,
  market: 0.0005,
  marketVat: true,
  basis: "contado renta variable : jusqu'à 1,30 % + IVA par sens (maximum retenu), sans minimum ; droits de marché imprimés 0,05 % + IVA",
  remark: "If the sale is the same day only one commission is charged.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
