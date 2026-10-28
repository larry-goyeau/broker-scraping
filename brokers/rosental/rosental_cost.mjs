// What one round trip costs at Rosental (Rosental S.A., ALyC y AN Propio
// no. 313 at the CNV, Rosario): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// on-line through its Direct Market Access system ("Operatoria online a
// través del sistema Direct Market Access (DMA)"). Lines in pesos, in MEP
// dollars (D lines) and in cable dollars (C lines).
//
// Read on 2026-10-26. "LISTADO DE COMISIONES", September 2026:
//   https://www.rosental.com/wp-content/uploads/2026/09/comisiones-sept-26.pdf
//   (the capital-markets page still links the April 2026 edition,
//   https://www.rosental.com/comisiones-abril-2026/, with the same 0.60% /
//   0.80% and 0.08% lines and a lower monthly fee; September is newer)
//   "Acciones - Compra / Venta": GENERAL "0.80 % + IVA", DMA "0.60 % +
//   IVA", each side. DMA is the on-line channel; GENERAL is the order
//   through the firm's desk and is left out. No minimum is printed:
//   0.60% × 1.21 = 0.726% a side.
//   "DERECHOS DE MERCADO (Todos + IVA)": "ACCIONES 0,08%", each side. The
//   firm prints its own rights line, so it is the figure (0.0968% a side),
//   as at Banco Santa Cruz; BYMA's own August 2026 table is 0.05%:
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "PARA LA COMPRA: MONTO BRUTO DE LA OPERACIÓN + (COMISIONES + IVA) +
//   (DERECHOS DE MERCADO + IVA)", and the same less for a sale.
//   Fixed costs, in the remark: "Mantenimiento Mensual $ 3.801,65.- + IVA"
//   and "Servicio DMA U$D 10 + IVA".
//   "MEP / CCL 1 %": turning pesos into dollars (or back) through the firm
//   costs 1%, in the remark.
//   No same-session rate is printed.
//
// Formula, each side: 0.60% × notional × 1.21 + 0.08% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: dividends (0.50%, minimum $2,000 + IVA), CEDEAR issue and
// cancellation (USD 0.01 / 0.03 + $30,000 + IVA), transfers (cable USD 20),
// holding certificates, and BYMA's day-trade bonus (the figure assumes
// another day).
//
// Cash: pesos and dollars (dividends on "Acciones en pesos" and "Acciones
// en dólares"; "Transferencia de fondos en Dólares vía MEP" and "en
// Dólares Cable"), so a line settles in its own currency and no FX enters
// the number; the MEP quote's half spread (CCL on a C line) is the remark,
// with the firm's 1% MEP / CCL commission.
//
//   node brokers/rosental/rosental_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/rosental/rosental_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/rosental/rosental_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/rosental/rosental_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "rosental",
  name: "Rosental",
  catalogue: new URL("rosental-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.rosental.com/wp-content/uploads/2026/09/comisiones-sept-26.pdf",
    page: "https://www.rosental.com/mercado-de-capitales/",
    readOn: "2026-10-26",
    inForce: "2026-09",
    entity: "Rosental S.A. (ALyC y AN Propio n° 313)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.006 },
  vatOnCommission: true,
  market: 0.0008,
  marketVat: true,
  basis: "listado de comisiones de septembre 2026, canal DMA : actions 0,60 % + IVA par sens, sans minimum ; droits de marché imprimés par Rosental 0,08 % + IVA",
  remark: "MEP / CCL conversion is 1% more. Account fee ARS 3,801.65 + VAT a month; DMA service USD 10 + VAT.",
  notes: ["entretien 3 801,65 pesos + IVA par mois et service DMA 10 USD + IVA (remarque)"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
