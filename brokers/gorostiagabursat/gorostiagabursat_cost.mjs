// What one round trip costs at Gorostiaga Bursátil (Agente de Negociación
// no. 1636 at the CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars,
// ordered on Inviu (the local platform; Rosario Valores clears). Lines in
// pesos and in MEP dollars (D lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Tabla de aranceles y comisiones", "Vigencia: 13 de
// Septiembre de 2023":
//   https://www.gorostiagabursatil.com/assets/documentos/pdf/TablaDeAranceles.pdf
//   "RENTA VARIABLE - CEDEARS", "Contado": "ARANCEL MÍNIMO 160", "MÍNIMO %
//   0,25", "MÁXIMO % 1", each side. The sheet does not say which client
//   pays which rate, so the figure is the 1% ceiling (owner rule: a range
//   takes the max). The $160 minimum is pesos; a dollar line takes its peso
//   equivalent (fx.mjs) and it never binds on a real order.
//   IVA: the sheet prints none; a broker's commission on a share or a
//   CEDEAR bears 21% IVA in Argentina, as in ../cohen and ../arata. Added,
//   on the fee the minimum sets as well.
//   Market rights: not on the sheet, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "Servicios de Custodia 0". "Apertura de Cuenta" and "Mantenimiento de
//   Cuenta" read "s/c" to 200 / 50 (pesos, a few US cents); the home page
//   says "Abrí tu cuenta 100% online y sin costos de mantenimiento".
//
// Formula, each side: max(1% × notional, $160) × 1.21 + 0.05% × notional ×
// 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: dividends ("Servicios sobre Custodia Acreencias títulos" 0.35%
// to 0.7%, minimum 100), transfers (s/c to 50), and BYMA's day-trade bonus
// on the post-trade part (under 0.01% a side; the figure assumes another
// day). "Contado Block" (0.25% to 0.5%) is for block lines, not on the
// board. The 0.25% floor of the range is the remark, a cut of the
// commission: 1% → 0.25% = 75% lower (IVA scales both alike).
//
// Cash: pesos and dollars ("CEDEARs y Acciones ... Podés hacerlo en pesos o
// dólares"; "dólar MEP" on the home page), so a line settles in its own
// currency and no FX enters the number; the MEP quote's half spread is the
// remark.
//   https://www.gorostiagabursatil.com/
//
//   node brokers/gorostiagabursat/gorostiagabursat_cost.mjs GGAL BCBA ARS --shares=200 --price=7500
//   node brokers/gorostiagabursat/gorostiagabursat_cost.mjs SPY BCBA ARS --shares=70 --price=21500
//   node brokers/gorostiagabursat/gorostiagabursat_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/gorostiagabursat/gorostiagabursat_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "gorostiagabursat",
  name: "Gorostiaga Bursátil",
  catalogue: new URL("gorostiagabursat-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.gorostiagabursatil.com/assets/documentos/pdf/TablaDeAranceles.pdf",
    page: "https://www.gorostiagabursatil.com/",
    readOn: "2026-10-26",
    inForce: "2023-09-13",
    entity: "Gorostiaga Bursátil (AN n° 1636)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 160 },
  vatOnCommission: true,
  basis: "renta variable - CEDEARs, contado : 0,25 % à 1 % (maximum retenu) + IVA par sens, minimum 160 pesos + IVA ; droits BYMA 0,05 % + IVA",
  notes: ["IVA ajouté : le barème n'en dit rien"],
  remark: "Fees might be 75% lower.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
