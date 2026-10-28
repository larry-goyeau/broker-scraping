// What one round trip costs at Fescina (Fescina y Cía. S.A., ALyC Propio
// n° 188 CNV, BYMA agent n° 84): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars. Lines
// in pesos and in MEP dollars (D lines); the broker writes no cable (C)
// line.
//
// Read on 2026-10-26. "Tabla de Aranceles vigente desde 01/07/2025":
//   https://fescina.com/download/aranceles.pdf
//   "Acciones Locales - Compra/Venta $ 5.000,00 2,00%" and "Acciones del
//   Exterior - Compra/Venta $ 5.000,00 2,00%" (CEDEARs), columns "Minimo"
//   and "Maximo": a rate up to 2% with a 5,000-peso minimum. The max is
//   taken (owner rule): 2% a side, minimum 5,000 pesos. A dollar line
//   takes the peso equivalent of the minimum.
//   "RG CNV 616 - Los valores no incluyen I.V.A., comisiones de Caja de
//   Valores S.A. y/o Derechos de Bolsa y Mercado": 21% IVA on the fee (the
//   one the minimum sets as well), and BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate is printed.
//
// Formula, each side: max(2% × notional, 5,000 pesos) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: "Mentenimento de Cuenta y Gastos Caja de Valores S.A. $
// 10.000,00" (no period printed), dividends (up to 3.5%, minimum 5,000
// pesos), transfers, and BYMA's day-trade bonus on the post-trade part
// (under 0.01% a side; the figure assumes another day).
//
// Cash: pesos and dollars. The home page sells the MEP dollar ("Dolar MEP:
// Comprá y vendé dolar MEP dentro del mercado financiero") and the tariff
// bills "Transferencia Nacional Dolares USD 10,00" next to "Transferencia
// Nacional Pesos", so a line settles in its own currency and no FX enters
// the number; the MEP quote's half spread is the remark.
//
//   node brokers/fescina/fescina_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/fescina/fescina_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/fescina/fescina_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "fescina",
  name: "Fescina",
  catalogue: new URL("fescina-parsed.json", import.meta.url),
  schedule: {
    url: "https://fescina.com/download/aranceles.pdf",
    page: "https://fescina.com/",
    readOn: "2026-10-26",
    inForce: "2025-07-01",
    entity: "Fescina y Cía. S.A. (ALyC Propio n° 188)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02, minArs: 5000 },
  vatOnCommission: true,
  basis: "acciones locales / exterior : jusqu'à 2,00 % par sens (maximum retenu), minimum 5 000 pesos, + IVA ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
