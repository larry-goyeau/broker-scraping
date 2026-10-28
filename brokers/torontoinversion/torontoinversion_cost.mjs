// What one round trip costs at Toronto Inversiones (Toronto Inversiones
// S.A., formerly BACS Administradora de Activos; ALyC AN Integral CNV no.
// 1398, BYMA agent no. 190): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// through MATRIZ self-service. Lines in pesos and in MEP dollars (D lines);
// the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "ANEXO IV – COMISIONES, CARGOS Y TASAS":
//   https://torontoinversiones.com.ar/wp-content/uploads/2026/04/Aranceles.pdf
//   "ACCIONES Comisión por Operaciones 1,00% sobre importe bruto operado.
//   Min. $500.", each side.
//   "Derechos de Mercado: Acciones - Títulos Privados - Oblig. Neg. –
//   Cedear 0.08%", each side: the broker's own rights line replaces
//   BYMA's 0.05%.
//   "NOTA: Las tarifas consignadas no incluyen IVA": both take 21% IVA,
//   1.21% (at least $605) and 0.0968% a side. The $500 minimum is
//   converted at fx.mjs's peso rate on a D line.
//   No same-session rate is printed.
//
// Formula, each side: max(1% × notional, $500) × 1.21 + 0.08% × notional ×
// 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "Comisión mensual por mantenimiento Cuenta Comitente $ 1000"
// and "Comisión por Custodia 0,10% anual sobre la posición valuada promedio
// al mes" (holding costs, the remark), transfers, and BYMA's day-trade bonus.
//
// Cash: pesos and dollars (FAQ: balances go out "a los CBU que le
// indiques, tanto en pesos como dólares"), so a line settles in its own
// currency and no FX enters the number; the MEP quote's half spread is the
// remark.
//   https://torontoinversiones.com.ar/preguntas-frecuentes/
//
//   node brokers/torontoinversion/torontoinversion_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/torontoinversion/torontoinversion_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/torontoinversion/torontoinversion_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "torontoinversion",
  name: "Toronto Inversiones",
  catalogue: new URL("torontoinversion-parsed.json", import.meta.url),
  schedule: {
    url: "https://torontoinversiones.com.ar/wp-content/uploads/2026/04/Aranceles.pdf",
    page: "https://torontoinversiones.com.ar/autogestion/",
    readOn: "2026-10-26",
    entity: "Toronto Inversiones S.A. (ALyC AN Integral CNV n° 1398)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 500 },
  vatOnCommission: true,
  market: 0.0008,
  marketVat: true,
  basis: "actions : 1,00 % + IVA par sens, minimum 500 pesos + IVA ; droits de marché du courtier 0,08 % + IVA",
  remark: "Custody 0.10% a year plus 1,000 pesos a month.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
