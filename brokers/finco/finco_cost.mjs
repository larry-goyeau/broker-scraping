// What one round trip costs at Finco Capital (Finco Capital S.A., AN ALyC P
// n° 596 CNV, BYMA agent n° 260): buy n Buenos Aires shares or CEDEARs
// (ETF certificates included) at price p and sell them back, in dollars,
// ordered online ("Trading Online"). Lines in pesos, MEP dollars (D lines)
// and cable dollars (C lines).
//
// Read on 2026-10-26. "Tarifas", "Última actualización: Noviembre 2025":
//   https://finco.com.ar/tarifas/
//   Trading Online, "Compra/Venta Acciones" and "Compra/Venta CEDEAR'S",
//   "Por operación", "Mínimo 0 hasta 0,30%". The "hasta" rate is taken at
//   its max (owner rule): 0.30% a side, no minimum.
//   "Trading Asistido hasta 2% para todas las operaciones" is the adviser
//   channel; the online line exists, so it is left out.
//   "Se adicionará ... sobre los importes correspondientes a comisiones o
//   aranceles el Impuesto al Valor Agregado (IVA)": 21%.
//   "Los aranceles aquí expuestos no incluyen los derechos de mercado ...
//   (BYMA)": BYMA's 0.05% + IVA a side (../bancogalicia/bymaCost.mjs, BYMA
//   "Derechos de Mercado sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   Account opening, maintenance, transfers and local security transfers
//   "Sin costo". No same-session rate and no cable charge is printed.
//
// Formula, each side: 0.30% × notional × 1.21 + 0.05% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: Caja de Valores corporate-event charges ("Acreencias") and
// BYMA's day-trade bonus on the post-trade part (under 0.01% a side; the
// figure assumes another day).
//
// Cash: pesos and dollars ("Operá desde Argentina, en pesos o dólares";
// "Dólar MEP y CCL", the cable dollar paid to the client's bank account
// abroad: https://finco.com.ar/productos/dolar-mep-y-ccl/), so a line
// settles in its own currency and no FX enters the number; the MEP quote's
// half spread is the remark (the CCL quote on a C line).
//
//   node brokers/finco/finco_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/finco/finco_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/finco/finco_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/finco/finco_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "finco",
  name: "Finco Capital",
  catalogue: new URL("finco-parsed.json", import.meta.url),
  schedule: {
    url: "https://finco.com.ar/tarifas/",
    page: "https://finco.com.ar/productos/cedears/",
    readOn: "2026-10-26",
    inForce: "2025-11",
    entity: "Finco Capital S.A. (AN ALyC P n° 596)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.003 },
  vatOnCommission: true,
  basis: "Trading Online, acciones / CEDEARs : jusqu'à 0,30 % + IVA par sens (maximum retenu), sans minimum ; droits BYMA 0,05 % + IVA",
  notes: ["ouverture et tenue de compte sans frais"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
