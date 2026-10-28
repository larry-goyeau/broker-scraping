// What one round trip costs at Win Securities (Win Securities S.A., ALyC y
// AN Propio n° 298 CNV, Agente ByMA 118): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered online (app / clientes.winsa.com.ar). Lines in pesos and
// in MEP dollars (D lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Aranceles y comisiones" (no date printed):
//   https://winsa.com.ar/aranceles-y-comisiones/
//   "Acciones Locales | Mínimo $0 – 50 | Máximo hasta 1,5%" (CEDEARs trade
//   as local shares on BYMA; "Acciones Exterior" is the foreign-market row).
//   Both figures are ranges, so the owner's rule takes the top of each:
//   1.5% with a 50-peso minimum, each side. "A los valores mencionados
//   deberá adicionarse el Impuesto al Valor Agregado (IVA) en caso de
//   corresponder": a share commission takes 21% IVA. Market rights are not
//   printed ("se encuentran establecidos en las respectivas páginas web de
//   los diferentes mercados ... Bolsas y Mercados Argentinos S.A."), so
//   BYMA's 0.05% + IVA a side (../bancogalicia/bymaCost.mjs, BYMA "Derechos
//   de Mercado sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate is printed. The FAQ: "Tu cuenta en Win Securities
//   no tiene costo de apertura ni de mantenimiento"
//   (https://winsa.com.ar/quienes-somos/#faq).
//
// Formula, each side: max(1.5% × notional, $50) × 1.21 + 0.05% × notional
// × 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// On a D line the 50-peso minimum is converted at fx.mjs's peso rate.
// Left out: custody "$ 100 + Costos trasladados por Caja de Valores
// (MENSUAL)" (about 0.07 USD a month), dividends (2%), conversion ("hasta
// U$D 0,1 por ADR"), transfers, and BYMA's day-trade bonus.
//
// Cash: pesos and dollars. The fee page prices foreign shares, ADR
// conversion in dollars and transfers to foreign depositaries, and the site
// names DTCC and Euroclear custody, which a dollar balance settles; a D
// line settles in its own currency and no FX enters the number; the MEP
// quote's half spread is the remark.
//
//   node brokers/winsecurities/winsecurities_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/winsecurities/winsecurities_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/winsecurities/winsecurities_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "winsecurities",
  name: "Win Securities",
  catalogue: new URL("winsecurities-parsed.json", import.meta.url),
  schedule: {
    url: "https://winsa.com.ar/aranceles-y-comisiones/",
    readOn: "2026-10-26",
    inForce: "",
    entity: "Win Securities S.A. (ALyC y AN Propio n° 298 CNV, Agente ByMA 118)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.015, minArs: 50 },
  vatOnCommission: true,
  basis: "acciones locales : jusqu'à 1,5 % + IVA par sens (maximum retenu), minimum 0-50 pesos (50 retenu) + IVA ; droits BYMA 0,05 % + IVA",
  notes: ["tarif plafond « hasta 1,5% » : règle du maximum"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
