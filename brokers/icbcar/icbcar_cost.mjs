// What one round trip costs at ICBC Argentina (Industrial and Commercial
// Bank of China (Argentina) S.A.U., ALyC y AN Integral no. 74 at the CNV):
// buy n Buenos Aires shares or CEDEARs (ETF certificates included) at
// price p and sell them back, in dollars, ordered from ICBC Online Banking
// or ICBC Mobile Banking. Lines in pesos and in MEP dollars (D lines); the
// bank writes no cable (C) line.
//
// Read on 2026-10-26. "Catálogo de Comisiones", OPTATA07 09/25, "vigencia
// 09/2025":
//   https://www.icbc.com.ar/form/OPTATA07.pdf
//   "Compra Venta de Títulos Valores - Bolsas y Mercados Argentinos
//   (BYMA)": "Compra/Venta de Acciones 0,70% 0,08 % 0,78 %" (Comisión ICBC
//   S.A.U., Derechos de Mercado, Total); "Los porcentajes no incluyen IVA";
//   "Las comisiones y derechos de mercado se aplicarán sobre el valor
//   monetario de la operación". So 0.70% + 21% IVA = 0.847% commission and
//   the bank's own rights line, 0.08% + 21% IVA = 0.0968%, each side, no
//   minimum. The bank's 0.08% stands in for BYMA's 0.05%.
//   No same-session rate is printed.
//
// Formula, each side: 0.70% × notional × 1.21 + 0.08% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: custody (0.09% a year, minimum $180 a month, about 12 US cents),
// dividends (1.5% to 3.5%), and BYMA's day-trade bonus.
//
// Cash: pesos and dollars ("Los montos de tus transacciones, en pesos o en
// dólares, se acreditan de forma online en tus cuentas"), so a line settles
// in its own currency and no FX enters the number; the MEP quote's half
// spread is the remark.
//
//   node brokers/icbcar/icbcar_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/icbcar/icbcar_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/icbcar/icbcar_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "icbcar",
  name: "ICBC Argentina",
  catalogue: new URL("icbcar-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.icbc.com.ar/form/OPTATA07.pdf",
    page: "https://www.icbc.com.ar/personas/productos-servicios/inversiones/acciones-titulos",
    readOn: "2026-10-26",
    inForce: "2025-09",
    entity: "Industrial and Commercial Bank of China (Argentina) S.A.U. (ALyC y AN Integral n° 74)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.007 },
  vatOnCommission: true,
  market: 0.0008,
  marketVat: true,
  basis: "actions : commission ICBC 0,70 % + IVA par sens, sans minimum ; droits de marché de la banque 0,08 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
