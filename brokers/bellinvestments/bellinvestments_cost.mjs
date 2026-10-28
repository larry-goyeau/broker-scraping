// What one round trip costs at Bell Investments (Bell Investment S.A., ALyC
// Propio n° 169 CNV, ACyD Integral n° 15): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars. Lines in pesos, MEP dollars (D lines) and cable dollars (C
// lines).
//
// Read on 2026-10-26. "Aranceles" (linked from every page footer), one
// sheet with no date:
//   https://www.bellinvestments.com.ar/download/aranceles.pdf
//   "Compra y venta de privados": MÍNIMO "$50", MÍNIMO "0,15%", MÁXIMO
//   "1,5%". The rate is discretionary between 0.15% and 1.5%, so the max
//   is taken (owner rule): 1.5% a side, minimum 50 pesos. A dollar line
//   takes the peso equivalent of the minimum.
//   IVA: the sheet prints none. Commission is IVA-taxable in Argentina, so
//   21% is added, on the fee the minimum sets as well (as ../cohen does).
//   The sheet prints no rights line, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate and no cable charge is printed.
//
// Formula, each side: max(1.5% × notional, 50 pesos) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: "Mantenimiento por custodio $40 mensual" (a few cents a month),
// dividend / coupon collection (0.5% to 1%), and BYMA's day-trade bonus on
// the post-trade part (under 0.01% a side; the figure assumes another day).
//
// Cash: pesos and dollars. Bell's client notices explain its "modalidad
// MEP" and "modalidad Cable" trades and "dólares MEP y CCL"
// (https://www.bellinvestments.com.ar/news-detail/17-importante,
// https://www.bellinvestments.com.ar/news-detail/18-importante), so a line
// settles in its own currency and no FX enters the number; the MEP quote's
// half spread is the remark (the CCL quote on a C line).
//
//   node brokers/bellinvestments/bellinvestments_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/bellinvestments/bellinvestments_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/bellinvestments/bellinvestments_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/bellinvestments/bellinvestments_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "bellinvestments",
  name: "Bell Investments",
  catalogue: new URL("bellinvestments-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.bellinvestments.com.ar/download/aranceles.pdf",
    page: "https://www.bellinvestments.com.ar/",
    readOn: "2026-10-26",
    entity: "Bell Investment S.A. (ALyC Propio n° 169)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.015, minArs: 50 },
  vatOnCommission: true,
  basis: "titres privés : 0,15 % à 1,5 % par sens (maximum retenu), minimum 50 pesos, + IVA 21 % (non imprimé, ajouté) ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
