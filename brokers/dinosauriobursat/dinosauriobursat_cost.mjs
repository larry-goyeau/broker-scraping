// What one round trip costs at Dinosaurio Bursátil (Paez Bursátil, ALyC
// Propio n° 235 CNV, agente BYMA n° 168): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered from the HomeBroker. Lines in pesos and in MEP dollars
// (D lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Tarifario de Comisiones" (no date printed):
//   https://www.dinosauriobursatil.com.ar/comisiones
//   "Acciones * | Comisión por web 0.40% + IVA | Comisión por mesa 1% (Máx)
//   + IVA", and the same on "Cedears *", each side, no minimum. The web
//   line is the online price; the desk line is left out. "* Bonificación
//   del 50% de las comisiones para trading intradía por operatoria web":
//   the remark. No market-rights line is printed, so BYMA's 0.05% + IVA a
//   side (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "Costo de apertura cuenta $0", "Costo de mantenimiento de cuenta $0".
//
// Formula, each side: 0.40% × notional × 1.21 + 0.05% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: the desk rate, the intraday bonus (remark), dividends (1%),
// title transfers ($10,000 + IVA), and BYMA's day-trade bonus.
//
// Cash: pesos and dollars. The "Dólar MEP" page: "Los dólares resultantes
// de la venta se transfieren a tu cuenta bancaria en dólares", with "una
// cuenta bancaria en pesos y otra en dólares" required, and CEDEARs
// "Cotizan en pesos o dólares"; so a line settles in its own currency and
// no FX enters the number; the MEP quote's half spread is the remark.
//   https://www.dinosauriobursatil.com.ar/productos/dolar-mep
//
//   node brokers/dinosauriobursat/dinosauriobursat_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/dinosauriobursat/dinosauriobursat_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/dinosauriobursat/dinosauriobursat_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "dinosauriobursat",
  name: "Dinosaurio Bursátil",
  catalogue: new URL("dinosauriobursat-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.dinosauriobursatil.com.ar/comisiones",
    readOn: "2026-10-26",
    inForce: "",
    entity: "Paez Bursátil (ALyC Propio n° 235 CNV, agente BYMA n° 168)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.004 },
  vatOnCommission: true,
  basis: "acciones / cedears par web : 0,40 % + IVA par sens, sans minimum ; droits BYMA 0,05 % + IVA",
  remark: "If the sale is the same day the commission is half.",
  notes: ["bonification de 50 % des commissions en intraday web, hors chiffre"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
