// What one round trip costs at Aeromar Valores (Aeromar Valores S.A., ALyC
// y AN Propio n° 171 CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// from the "matriz by Primary" app. Lines in pesos and in MEP dollars (D
// lines); the broker writes no cable (C) line.
//
// Read on 2026-10-26. "ARANCELES, Comisiones y Recuperos en Oficinas de
// Agentes y Sociedades de Bolsa", "Vigencia 1 de Julio de 2026" (CNV RG
// 616 table, one price for every channel):
//   https://www.aeromarvalores.com.ar/comisiones.php
//   "RENTA VARIABLE - CEDEARS", "Operaciones de Contado": ARANCEL MÍNIMO
//   "160,00", MÍNIMO % "0,50", MÁXIMO % "1,00". The rate is discretionary
//   between 0.50% and 1.00%, so the max is taken (owner rule): 1% a side,
//   minimum 160 pesos. A dollar line takes the peso equivalent of the
//   minimum.
//   IVA: the page prints none. Commission is IVA-taxable in Argentina, so
//   21% is added, on the fee the minimum sets as well (as ../cohen does).
//   "Servicios de Custodia 0,00": no holding cost.
//   The page prints no rights line, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate is printed.
//
// Formula, each side: max(1% × notional, 160 pesos) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: "Contado Block" (0.50%, block lines are not on the board),
// coupon / dividend collection (0.35% to 0.70%), account maintenance
// ("s/c" to 50 pesos), bank transfer charges, and BYMA's day-trade bonus
// on the post-trade part (under 0.01% a side; the figure assumes another
// day).
//
// Cash: pesos and dollars. The tariff bills "Gastos Bancarios por
// transferencia $" and "Gastos Bancarios por transferencia USD", so the
// account takes and pays out both; a line settles in its own currency and
// no FX enters the number; the MEP quote's half spread is the remark.
//
//   node brokers/aeromarvalores/aeromarvalores_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/aeromarvalores/aeromarvalores_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/aeromarvalores/aeromarvalores_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "aeromarvalores",
  name: "Aeromar Valores",
  catalogue: new URL("aeromarvalores-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.aeromarvalores.com.ar/comisiones.php",
    page: "https://www.aeromarvalores.com.ar/productos.php",
    readOn: "2026-10-26",
    inForce: "2026-07-01",
    entity: "Aeromar Valores S.A. (ALyC y AN Propio n° 171)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 160 },
  vatOnCommission: true,
  basis: "renta variable - CEDEARs, contado : 0,50 % à 1,00 % par sens (maximum retenu), minimum 160 pesos, + IVA 21 % (non imprimé, ajouté) ; droits BYMA 0,05 % + IVA",
  notes: ["garde 0,00"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
