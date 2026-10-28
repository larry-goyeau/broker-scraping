// What one round trip costs at RIG Valores (RIG Valores S.A., ALyC y AN
// Propio n° 122 CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars. Lines
// in pesos and in MEP dollars (D lines); the catalogue holds no cable (C)
// line.
//
// Read on 2026-10-26. "Listado de Aranceles Generales", "Fecha: 2026":
//   https://rigvalores.com/wp-content/uploads/2026/03/aranceles-ultima.pdf
//   "Compra/Venta de Acciones / Por c/operación / Arancel hasta 2% /
//   MINIMA $ 500" (the same for "Compra/Venta de Acciones Exterior", the
//   CEDEARs); "A los aranceles y derechos indicados se les debe agregar el
//   IVA (21%), excepto en operaciones con Títulos Públicos y Obligaciones
//   Negociables". Each side. A discretionary "hasta" rate is taken at its
//   max (owner rule): 2% + 21% IVA = 2.42% a side, at least $605. The peso
//   minimum is converted at fx.mjs's peso rate on a D line. The table
//   names market rights without a figure, so BYMA's own 0.05% + IVA
//   applies (../bancogalicia/bymaCost.mjs). No same-session rate is
//   printed.
//   "Custodia Local y/o en el Exterior / Anual, a fracción mensual
//   adelantada, sobre el promedio de la valuación de cartera diaria / 2% /
//   $500 (mensual)": up to 2% a year on the holding, a real cost kept as
//   the remark.
//
// Formula, each side: max(2% × notional, $500) × 1.21 + 0.05% × notional
// × 1.21; plus the book, and a tax when taxMap.mjs names one (none on
// BYMA). Left out: custody (remark), dividends and exchanges (up to 2%),
// ADR conversion, transfers, and BYMA's day-trade bonus on the post-trade
// part.
//
// Cash: pesos and dollars. The FAQ: "¿Puedo invertir en dólares? Sí.
// Disponemos de instrumentos en pesos y en dólares", so a line settles in
// its own currency and no FX enters the number; the MEP quote's half
// spread is the remark.
//   https://rigvalores.com/preguntas-frecuentes/
//
//   node brokers/rigvalores/rigvalores_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/rigvalores/rigvalores_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/rigvalores/rigvalores_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "rigvalores",
  name: "RIG Valores",
  catalogue: new URL("rigvalores-parsed.json", import.meta.url),
  schedule: {
    url: "https://rigvalores.com/wp-content/uploads/2026/03/aranceles-ultima.pdf",
    readOn: "2026-10-26",
    inForce: "2026",
    entity: "RIG Valores S.A. (ALyC y AN Propio CNV n° 122)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02, minArs: 500 },
  vatOnCommission: true,
  remark: "Custody up to 2% a year.",
  basis: "actions et actions de l'extérieur : jusqu'à 2 % + IVA par sens (maximum retenu), minimum 500 pesos + IVA ; droits BYMA 0,05 % + IVA",
  notes: ["garde jusqu'à 2 % par an (minimum 500 pesos par mois), hors aller-retour, en remarque"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
