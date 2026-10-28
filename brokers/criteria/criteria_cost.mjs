// What one round trip costs at Criteria (Criteria WM S.A., ALyC integral
// n° 591 CNV, Buenos Aires): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars,
// ordered on the Criteria Digital app. Lines in pesos, MEP dollars (D lines)
// and cable dollars (C lines, "U$D-C" in the app).
//
// Read on 2026-10-26. "Tarifas Vigentes" (page modified 2026-05-13), one
// table for every channel, "COMISIONES POR OPERACIONES (Las comisiones
// mencionadas son +IVA cuando corresponda)":
//   https://criteria.com.ar/tarifas/
//   Renta Variable       "Contado Inmediato ... Hasta 1.5%", each side, no
//                        minimum printed. A ceiling with no rule for who
//                        pays less, so the figure is 1.5% (owner's rule:
//                        take the maximum), plus 21% IVA: 1.815% a side.
//   Cable / MEP          "Contado Inmediato Cable/MEP ... 1.5% + entre 100
//                        y 150 USD" sits under the "Renta Fija" heading
//                        (bonds), not under Renta Variable: not a share
//                        fee, left out. "Las comisiones originadas en dólar
//                        cable y dólar MEP se cobran en la misma moneda":
//                        a dollar line pays its commission in dollars.
//   Market rights        "Esta tabla no contempla gastos, aranceles, y
//                        comisiones de mercados": BYMA's August 2026 table,
//                        contado PPT, 0.05% on a private share or a CEDEAR,
//                        each side, plus IVA (../bancogalicia/bymaCost.mjs).
//   Left out             "Mantenimiento de Cuenta ... Hasta 2%" (no base or
//                        period; the account-opening page says the account
//                        "No tiene gastos de apertura ni de mantenimiento"),
//                        custody at Caja de Valores' own tariff, dividends
//                        "$20 – 1%", USD transfers (USD 25 / 50) and
//                        transfers abroad (USD 300): not this order. No
//                        same-session rate is printed.
//
// Formula, each side: 1.5% × notional × 1.21 + 0.05% × notional × 1.21, plus
// the book (spreads/byma-touch.mjs) and a tax when taxMap.mjs names one.
//
// Cash: pesos and dollars ("Para operar dólar MEP, es necesario que tengas
// configuradas tu cuenta en pesos y dólares", FAQ; dollar commissions are
// charged in dollars), so a line settles in its own currency and no FX
// enters the number; the remark is the MEP quote (the CCL quote on a C
// line).
//   https://criteria.com.ar/preguntas-frecuentes/
//
//   node brokers/criteria/criteria_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/criteria/criteria_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/criteria/criteria_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/criteria/criteria_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "criteria",
  name: "Criteria",
  catalogue: new URL("criteria-parsed.json", import.meta.url),
  schedule: {
    url: "https://criteria.com.ar/tarifas/",
    readOn: "2026-10-26",
    inForce: "2026-05-13",
    entity: "Criteria WM S.A. (ALyC integral n° 591 CNV)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.015 },
  vatOnCommission: true,
  basis:
    "« Tarifas Vigentes » (page du 2026-05-13), relue le 2026-10-26 : renta variable contado inmediato « Hasta 1.5% » + IVA par sens, " +
    "plafond retenu (règle du maximum), sans minimum ; droits de marché BYMA 0,05 % + IVA par sens (la table les exclut)",
  notes: [
    "la ligne « Cable/MEP 1.5% + entre 100 y 150 USD » est sous Renta Fija : non appliquée aux actions",
    "maintenance « Hasta 2% » sans base ni période, la page d'ouverture dit sans frais de maintenance : hors calcul",
  ],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
