// What one round trip costs at Valiant Bursátil (Valiant Bursátil S.A.U.,
// ALyC Integral CNV no. 120, owned by the Bolsa de Comercio de Bahía
// Blanca): buy n Buenos Aires shares or CEDEARs (ETF certificates
// included) at price p and sell them back, in dollars, ordered from the app
// or the web. Lines in pesos, in MEP dollars (D lines) and in cable dollars
// (C lines).
//
// Read on 2026-10-26. "TABLA DE COMISIONES VALIANT BURSÁTIL S.A.U.",
// printed "Vigente a partir del 22/09/2026" (the file name reads 26-09-22):
//   https://valiantbursatil.com/pdf/apertura/valiantbursatil-tabla-de-comisiones-26-09-22.pdf
//   "C/V TÍTULOS PRIVADOS", columns "DER. MERC. %" 0,08, "ARANCEL %" 0,9,
//   "MINIMO $ 45 + IVA", each side. The commission takes 21% IVA (the
//   minimum is printed "+ IVA"): 1.089% a side. The broker's own 0.08%
//   market-rights column replaces BYMA's 0.05%; BYMA's table adds IVA to
//   rights on shares and CEDEARs, so 0.0968% a side. The $45 minimum is
//   converted at fx.mjs's peso rate on a dollar line and never binds on a
//   real order. One rate for every channel; no same-session rate printed.
//
// Formula, each side: max(0.9% × notional, $45) × 1.21 + 0.08% × notional ×
// 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "CUSTODIA MENSUAL" by holding band, $1,800 (under $60,000) to
// $6,600 (over $5,000,000) a month (the remark), dividends (1% + IVA),
// transfers, and BYMA's day-trade bonus on the post-trade part.
//
// Cash: pesos and dollars (FAQ: "Podrás vincular tus cuentas bancarias en
// pesos y en dólares"; it trades MEP and CCL dollars), so a line settles in
// its own currency and no FX enters the number; the MEP quote's half
// spread (CCL on a C line) is the remark.
//   https://valiantbursatil.com/institucional/preguntas-frecuentes.html
//
//   node brokers/valiantbursatil/valiantbursatil_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/valiantbursatil/valiantbursatil_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/valiantbursatil/valiantbursatil_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/valiantbursatil/valiantbursatil_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "valiantbursatil",
  name: "Valiant Bursátil",
  catalogue: new URL("valiantbursatil-parsed.json", import.meta.url),
  schedule: {
    url: "https://valiantbursatil.com/pdf/apertura/valiantbursatil-tabla-de-comisiones-26-09-22.pdf",
    page: "https://valiantbursatil.com/productos.html",
    readOn: "2026-10-26",
    inForce: "2026-09-22",
    entity: "Valiant Bursátil S.A.U. (ALyC Integral CNV n° 120)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.009, minArs: 45 },
  vatOnCommission: true,
  market: 0.0008,
  marketVat: true,
  basis: "titres privés : 0,9 % + IVA par sens, minimum 45 pesos + IVA ; droits de marché du courtier 0,08 % + IVA",
  remark: "Custody 1,800 to 6,600 pesos a month by holding size.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
