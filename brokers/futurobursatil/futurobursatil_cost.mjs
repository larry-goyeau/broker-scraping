// What one round trip costs at Futuro Bursátil (Futuro Bursátil S.A.,
// sociedad de bolsa): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// from its online trading platform. Lines in pesos and in MEP dollars (D
// lines); the broker writes no cable (C) line.
//
// Read on 2026-10-26. The "Aranceles" panel of the home page (a single-page
// app; the table is in its bundle, /assets/index-DLzNyvR7.js):
//   https://www.futurobursatil.com.ar/
//   "Acciones y Cedears - Compra/Venta" "0.70% + I.V.A. + a)", minimum
//   "SIN MINIMO", each side. One price; no channel is named.
//   Footnote: "Derechos Mercado a) 0.08% + iva": the broker prints its own
//   rights line for shares and CEDEARs, so 0.08% + 21% IVA a side replaces
//   BYMA's 0.05% (as at ../bancosantacruz).
//   "Mantenimiento de Cuenta (mensual)" "$82.64 + IVA" (about 100 pesos, a
//   few US cents a month); "Custodia Euros y Dólares" "SIN COSTO": no
//   sizeable holding cost.
//   No same-session rate is printed.
//
// Formula, each side: 0.70% × notional × 1.21 + 0.08% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "Accs. Ext. y ETFs - C/V (mandato)" (0.70% + IVA + USD 0.02 a
// share, minimum USD 35 + IVA; shares bought abroad, not BYMA), account
// maintenance, transfers, and BYMA's day-trade bonus (the figure assumes
// another day).
//
// Cash: pesos and dollars. The bank panel lists peso accounts and a "CTA.
// CTE. SOLO Transferencias USD" (Banco de Valores), and the tariff prints
// "Transfer. Receptora USD MEP" "SIN COSTO", so a line settles in its own
// currency and no FX enters the number; the MEP quote's half spread is the
// remark.
//
//   node brokers/futurobursatil/futurobursatil_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/futurobursatil/futurobursatil_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/futurobursatil/futurobursatil_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "futurobursatil",
  name: "Futuro Bursátil",
  catalogue: new URL("futurobursatil-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.futurobursatil.com.ar/",
    page: "https://www.futurobursatil.com.ar/",
    readOn: "2026-10-26",
    inForce: "",
    entity: "Futuro Bursátil S.A.",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.007 },
  vatOnCommission: true,
  market: 0.0008,
  marketVat: true,
  basis: "actions et CEDEARs : 0,70 % + IVA par sens, sans minimum ; droits de marché du courtier 0,08 % + IVA par sens",
  notes: ["entretien de compte 82,64 pesos + IVA par mois, négligeable"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
