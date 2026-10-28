// What one round trip costs at Álvarez y Cía. (Álvarez y Cía. Actividades
// Bursátiles S.A., ALyC Propio y AN CNV n° 132, BYMA agent code 5): buy n
// Buenos Aires shares or CEDEARs (ETF certificates included) at price p
// and sell them back, in dollars. Lines in pesos and in MEP dollars (D
// lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "CUADRO DE GASTOS, COMISIONES, IMPUESTOS Y
// DERECHOS", "ESTE DETALLE DE GASTOS CORRESPONDE AL AÑO 2024" (still the
// "Descargar PDF" of the ARANCELES page):
//   https://alvarezycia.com.ar/aranceles/
//   https://alvarezycia.com.ar/wp-content/uploads/2024/08/GASTOS-2024.pdf
//   "NEGOCIACION SECUNDARIA (hasta)", "CONTADO", "Titulos Privados y Fondos
//   Cerrados en Acciones - Cedears": "ARANCELES 1% (a)", "DERECHOS/GASTOS
//   0,08% (1) (a)", "TOTAL 1,08%"; "ARANCEL MINIMO: $ 1.000,00 (a)"; "(a)
//   Mas I.V.A.". Each side, one rate for every channel (the site's "ACCESO
//   HOME BROKER" included). A "hasta" rate is taken at its max (owner
//   rule): 1% + 21% IVA = 1.21% a side, at least $1,210. The peso minimum
//   is converted at fx.mjs's peso rate on a D line. The broker prints its
//   own rights line, 0.08% + IVA, which replaces BYMA's 0.05% + IVA.
//   Note (1) lowers the market rights to 0.025% when the same client buys
//   and sells the same species the same day: that is the market's
//   day-trade bonus, left out like BYMA's; the figure assumes the sale is
//   another day. No same-session commission rate is printed.
//
// Formula, each side: max(1% × notional, $1,000) × 1.21 + 0.08% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one
// (none on BYMA). Left out: "MANTENIMIENTO DE CUENTA MENSUAL - SIMPLE $
// 1.000,00" + IVA (about 80 US cents a month), account opening and legal
// review, transfers, Caja de Valores certificates, and dividends (1% + 1%
// + IVA).
//
// Cash: pesos and dollars. The tariff bills "TRANSFERENCIAS BANCARIAS (en
// pesos y/o dolares)", so a line settles in its own currency and no FX
// enters the number; the MEP quote's half spread is the remark.
//
//   node brokers/alvarezycia/alvarezycia_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/alvarezycia/alvarezycia_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/alvarezycia/alvarezycia_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "alvarezycia",
  name: "Álvarez y Cía",
  catalogue: new URL("alvarezycia-parsed.json", import.meta.url),
  schedule: {
    url: "https://alvarezycia.com.ar/wp-content/uploads/2024/08/GASTOS-2024.pdf",
    page: "https://alvarezycia.com.ar/aranceles/",
    readOn: "2026-10-26",
    inForce: "2024",
    entity: "Álvarez y Cía. Actividades Bursátiles S.A. (ALyC Propio y AN CNV n° 132)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 1000 },
  vatOnCommission: true,
  market: 0.0008,
  marketVat: true,
  basis: "contado, titres privés et CEDEARs : arancel jusqu'à 1 % + IVA par sens (maximum retenu), minimum 1 000 pesos + IVA ; droits de marché imprimés par le courtier 0,08 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
