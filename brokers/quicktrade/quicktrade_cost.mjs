// What one round trip costs at Quicktrade (the online platform of SBS
// Trading S.A., ALyC integral n° 53 CNV, Grupo SBS): buy n Buenos Aires
// shares or CEDEARs (ETF certificates included) at price p and sell them
// back, in dollars, ordered on its web platform or app ("experiencia 100%
// digital"). Lines in pesos, in MEP dollars (D lines) and in cable dollars
// (C lines).
//
// Read on 2026-10-28. "Preguntas Frecuentes QT", answer "¿Qué y cuanto me
// van a cobrar por operar con Quicktrade?", table "Comisiones / Aranceles":
//   https://quicktrade.com.ar/preguntas-frecuentes-quicktrade/
//   (the trading FAQ named in broker-list.json,
//   https://quicktrade.com.ar/preguntasfrecuentestrading/, prints no fee)
//   Compra / Venta, columns "Arancel Máximo (3)", "Mínimo $" and "Arancel
//   Cliente Directo Quicktrade (3)(6)": "Acciones Locales 1,00% $50.00
//   0,70%", "CEDEARs 1,00% $50.00 0,70%", each side.
//   Note (6): "Cliente Directo Quicktrade": a person whose account was
//   opened "mediante la web o aplicación de Quicktrade" and is not referred
//   by an Agente Productor. That is the client this ticket is, so 0.70%; the
//   1.00% maximum is the ceiling for the adviser channel ("Con atención
//   personalizada") and stays out. The $50 minimum is printed once, between
//   the two rates; it is kept as the floor of both ($50 + IVA = $60.50 a
//   side, a few cents of a dollar).
//   Note (2): "En los casos que corresponda deberá adicionarse el IVA sobre
//   el importe de la comisión": a share or a CEDEAR takes 21%, 0.847% a
//   side.
//   Note (3): "se le deberán sumar los derechos de mercado ... que fijen
//   los mercados", with no figure: BYMA's own 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, "Derechos de Mercado sobre Operaciones",
//   2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate and no cable execution fee are printed.
//   "Apertura de cuenta: Sin cargo"; "Mantenimiento de cuenta U$S 3,50 por
//   mes ... BONIFICADO" (and "no tiene ningún costo de apertura ni de
//   mantenimiento"); custody is "hasta" what Caja de Valores charges, with
//   no amount.
//
// Formula, each side: max(0.70% × notional, $50) × 1.21 + 0.05% × notional
// × 1.21; plus the book, and a tax when taxMap.mjs names one (none on
// BYMA).
// Left out: transfers abroad ("Hasta USD 50 por transferencia", a
// withdrawal, not the order), CEDEAR / ADR conversions (up to USD 0.10 a
// certificate), dividends (the depositary's charge passed on), and BYMA's
// day-trade bonus on the post-trade part (under 0.01% a side; the figure
// assumes another day).
//
// Cash: pesos and dollars (deposits.mjs ARS and USD; "Para realizar la
// compra de Dólar MEP es necesario contar con una cuenta propia en
// dólares"), so a line settles in its own currency and no FX enters the
// number; the MEP quote's half spread (CCL on a C line) is the remark.
//
//   node brokers/quicktrade/quicktrade_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/quicktrade/quicktrade_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/quicktrade/quicktrade_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/quicktrade/quicktrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "quicktrade",
  name: "Quicktrade",
  catalogue: new URL("quicktrade-parsed.json", import.meta.url),
  schedule: {
    url: "https://quicktrade.com.ar/preguntas-frecuentes-quicktrade/",
    page: "https://quicktrade.com.ar/preguntasfrecuentestrading/",
    readOn: "2026-10-28",
    entity: "SBS Trading S.A. (ALyC integral n° 53)",
  },
  commission: { rate: 0.007, minArs: 50 },
  vatOnCommission: true,
  basis:
    "FAQ Quicktrade, « Arancel Cliente Directo Quicktrade » (compte ouvert en ligne, sans agent producteur) : actions locales et CEDEAR 0,70 % + IVA par sens, " +
    "minimum 50 pesos + IVA ; le 1,00 % est le plafond « con atención personalizada » ; droits BYMA 0,05 % + IVA (note 3 : droits des marchés en sus, sans chiffre)",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
