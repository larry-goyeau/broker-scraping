// What one round trip costs at Ualá (Ualá Inversiones S.A.U., formerly
// Ualintec Capital, ALyC Integral no. 1283 at the CNV, BYMA member no.
// 161): buy n Buenos Aires shares or CEDEARs (ETF certificates included)
// at price p and sell them back, in dollars, ordered from the Ualá app.
// Peso lines only (the catalogue holds no D or C line).
//
// Read on 2026-10-26. "Nuestras comisiones":
//   https://www.ualainversiones.com.ar/comisiones (was www.ualintec.com.ar/comisiones)
//   "Compra/Venta de Títulos Privados Hasta 1% + IVA"; the FAQ says this
//   line is the CEDEAR one. A discretionary "hasta" rate is taken at its
//   max (owner rule): 1% + 21% IVA = 1.21% a side, no minimum printed.
//   The page prints no rights line, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate, no custody or account fee is printed.
//
// Formula, each side: 1% × notional × 1.21 + 0.05% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: dividends (up to 0.5% + IVA) and BYMA's day-trade bonus on the
// post-trade part (under 0.01% a side; the figure assumes another day).
//
// Cash: pesos, and dollars bought as "Dólar MEP" (AL30) kept in the Ualá
// dollar account; every line here is in pesos, so no FX enters the number
// and the MEP quote's half spread is the remark.
//
//   node brokers/uala/uala_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/uala/uala_cost.mjs AAPL BCBA ARS --shares=40 --price=27000
//   node brokers/uala/uala_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "uala",
  name: "Ualá",
  catalogue: new URL("uala-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.ualainversiones.com.ar/comisiones",
    page: "https://www.uala.com.ar/inversiones/acciones-bonos-cedears",
    readOn: "2026-10-26",
    entity: "Ualá Inversiones S.A.U. (ALyC Integral n° 1283)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01 },
  vatOnCommission: true,
  basis: "titres privés : jusqu'à 1 % + IVA par sens (maximum retenu), sans minimum ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
