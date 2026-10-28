// What one round trip costs at AG Valores (AG Valores S.A., ALyC y AN
// Propio n° 141 CNV, ACyDI n° 101): buy n Buenos Aires shares or CEDEARs
// (ETF certificates included) at price p and sell them back, in dollars,
// ordered from its online account (micuenta.agonline.com.ar). Lines in
// pesos and in MEP dollars (D lines); the broker writes no cable (C) line.
//
// Read on 2026-10-26. "TABLA VIGENTE DE ARANCELES COMISIONES Y/O GASTOS",
// "ANEXO I – Aranceles y Comisiones", linked from its "Aranceles" page:
//   https://agvalores.com.ar/assets/Pdf/ANEXO-I.pdf
//   "Acciones Locales $0 – 100 hasta 1,5%" and "Acciones Exterior $0 – 100
//   hasta 1,5%" (CEDEARs). Both the "hasta" rate and the minimum range are
//   taken at their max (owner rule): 1.5% a side, minimum 100 pesos. A
//   dollar line takes the peso equivalent of the minimum.
//   "A los valores mencionados deberá adicionarse el Impuesto al Valor
//   Agregado (IVA) en caso de corresponder": 21%, on the fee the minimum
//   sets as well.
//   "Los derechos de mercados ... se encuentran establecidos en las
//   respectivas páginas web de los diferentes mercados ... Bolsas y
//   Mercados Argentinos S.A.": BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate is printed.
//
// Formula, each side: max(1.5% × notional, 100 pesos) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: custody ("$ 900 + Costos trasladados por Caja de Valores ...
// (MENSUAL)", about sixty cents a month), cash dividends (2%), CEDEAR
// conversion ("hasta U$D 0,1 por ADR"), transfers, and BYMA's day-trade
// bonus on the post-trade part (under 0.01% a side; the figure assumes
// another day).
//
// Cash: pesos and dollars. The home page sells "Dólar mep" ("Operá con AG
// Valores: Dólar mep, acciones, bonos, cedears ..."), so a line settles in
// its own currency and no FX enters the number; the MEP quote's half
// spread is the remark.
//
//   node brokers/valoresar/valoresar_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/valoresar/valoresar_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/valoresar/valoresar_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "valoresar",
  name: "AG Valores",
  catalogue: new URL("valoresar-parsed.json", import.meta.url),
  schedule: {
    url: "https://agvalores.com.ar/assets/Pdf/ANEXO-I.pdf",
    page: "https://agvalores.com.ar/",
    readOn: "2026-10-26",
    entity: "AG Valores S.A. (ALyC y AN Propio n° 141)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.015, minArs: 100 },
  vatOnCommission: true,
  basis: "acciones locales / exterior : jusqu'à 1,5 % par sens (maximum retenu), minimum 0 à 100 pesos (100 retenu), + IVA ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
