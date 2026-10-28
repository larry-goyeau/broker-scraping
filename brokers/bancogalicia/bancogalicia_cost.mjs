// What one round trip costs at Banco Galicia (Banco de Galicia y Buenos
// Aires S.A., ALyC Integral no. 22 at the CNV): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered from Online Banking ("Inversiones > Nueva inversión >
// Bonos, Acciones y CEDEAR"). Lines in pesos and in MEP dollars (D lines);
// the bank writes no cable (C) line.
//
// Read on 2026-10-26. "Comisiones y cargos - Individuos. Bonos, Acciones,
// CEDEARs", "Comisiones vigentes", file dated 11/06/2026:
//   https://www.galicia.ar/content/dam/galicia/emails/personas/comisiones-minoristas/Bonos_Acciones_CEDEARs_2026_110626.pdf
//   "Compra / Venta de Acciones y CEDEARs 1,1% + IVA", "Comisión mínima
//   N/A", "Por operación", "La comisión se aplica sobre el valor efectivo
//   de la operación": 1.1% + 21% IVA = 1.331% a side, no minimum.
//   "Custodia de Títulos Valores (Acciones, Bonos, CEDEARs, etc) 0,045% -
//   Bonificado 100%": no holding cost.
//   "Costos asociados al mercado: A las comisiones detalladas podrán
//   adicionarse aranceles, derechos, tasas y demás cargos establecidos por
//   los mercados ... Estos conceptos podrán consultarse en BYMA": the bank
//   prints no rights line of its own, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate is printed.
//
// Formula, each side: 1.1% × notional × 1.21 + 0.05% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: dividends (2.5% + IVA, min $99 + IVA), CEDEAR swaps and other
// corporate events, certificates, and BYMA's day-trade bonus on the
// post-trade part (under 0.01% a side; the figure assumes another day).
//
// Cash: a peso and a dollar savings account ("Invertís en pesos o en
// dólares"; dollars go to the client's "Caja de Ahorro en dólares"), so a
// line settles in its own currency and no FX enters the number; the MEP
// quote's half spread is the remark.
//
//   node brokers/bancogalicia/bancogalicia_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/bancogalicia/bancogalicia_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/bancogalicia/bancogalicia_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "./bymaCost.mjs";

const file = bymaCostFile({
  folder: "bancogalicia",
  name: "Banco Galicia",
  catalogue: new URL("bancogalicia-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.galicia.ar/content/dam/galicia/emails/personas/comisiones-minoristas/Bonos_Acciones_CEDEARs_2026_110626.pdf",
    page: "https://www.galicia.ar/personas/inversiones/bonos-acciones",
    readOn: "2026-10-26",
    inForce: "2026-06-11",
    entity: "Banco de Galicia y Buenos Aires S.A. (ALyC Integral n° 22)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.011 },
  vatOnCommission: true,
  basis: "Online Banking : 1,1 % + IVA par sens, sans minimum ; droits BYMA 0,05 % + IVA",
  notes: ["garde bonifiée à 100 %"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
