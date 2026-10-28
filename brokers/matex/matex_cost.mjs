// What one round trip costs at Matex Capital (Sesnich Villalonga Cereales
// S.A., ALyC Integral Agroindustrial n° 242, ACyDI n° 199 CNV, Rosario):
// buy n Buenos Aires shares or CEDEARs (ETF certificates included) at price
// p and sell them back, in dollars. Lines in pesos and in MEP dollars (D
// lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. Home page, table "Operaciones / Máxima":
//   https://www.matexcapital.com.ar/
//   "Compra/Venta de Acciones / Cedears 1,50% directo", each side, and
//   "Costos más IVA, con excepción a Títulos Público y Letras": 1.50% + 21%
//   IVA = 1.815% a side. One figure, no minimum, no separate channel rate.
//   "Apertura de cuenta Sin cargo", "Mantenimiento de cuenta Sin cargo".
//   No rights line of its own: BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate is printed.
// Channel: "Contactás a tu asesor y comenzás a operar. Invertí de forma
// simple y ágil con el acompañamiento de un especialista"; the client
// login (extranet.svmatesur.com.ar) is for following the portfolio
// ("Monitoreá tus movimientos"). Orders go through the adviser, so
// onlineBuy is false.
//
// Formula, each side: 1.50% × notional × 1.21 + 0.05% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: cash dividends ("1% directo"), "Transferencias especies out
// $5.000", and BYMA's day-trade bonus on the post-trade part (under 0.01% a
// side; the figure assumes another day).
//
// Cash: pesos and dollars (an ALyC Integral; its tariff prices dollar
// products, "Opciones compradas USD 0,35 x TN", and it offers "renta fija y
// variable, local e internacional"), so a line settles in its own currency
// and no FX enters the number; the MEP quote's half spread is the remark.
//
//   node brokers/matex/matex_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/matex/matex_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/matex/matex_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "matex",
  name: "Matex Capital",
  catalogue: new URL("matex-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.matexcapital.com.ar/",
    readOn: "2026-10-26",
    entity: "Sesnich Villalonga Cereales S.A. (ALyC Integral Agroindustrial n° 242)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.015 },
  vatOnCommission: true,
  onlineBuy: false,
  basis: "tableau « Operaciones / Máxima » : actions / CEDEARs 1,50 % + IVA par sens (« Costos más IVA »), sans minimum ; droits BYMA 0,05 % + IVA",
  notes: ["ordres passés par le conseiller (le portail client sert au suivi)", "ouverture et tenue de compte sans frais"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
