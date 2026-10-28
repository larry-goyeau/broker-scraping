// What one round trip costs at IEB+ (the app and web platform of Invertir
// en Bolsa S.A., ALyC y AN Integral n° 246 CNV): buy n shares at price p
// and sell them back, in dollars. Two places from one account: BYMA (Buenos
// Aires shares and CEDEARs, ETF certificates included; peso, MEP (D) and
// cable (C) lines) and the US (the whole US exchange book, in dollars,
// "plazo 24hs").
//
// Read on 2026-10-26, FAQ "Costos y comisiones":
//   https://www.iebmas.com.ar/preguntas-frecuentes/
//
//   "Las comisiones para operar con nosotros son cero." "IEB+ te permite
//   operar sin comisiones en todos los planes". Commission 0 on both places.
//   Plan Investor (every local instrument): "Debitaremos la membresía de
//   $5.000 + IVA ... al día siguiente hábil de tu primer operación en
//   Acciones, Bonos, Cauciones, CEDEARs, ONs, Letras, y Opciones del mes.
//   Si ese mes no operás, ¡no abonas la membresía!"
//   Plan Global (adds the US): "la membresía de USD 15 + IVA ... al día
//   siguiente hábil de tu primer operación en el mercado internacional,
//   únicamente el mes que operás."
//   The membership is a monthly fee in a month with trades, not a charge on
//   the order: it is the remark (6,050 pesos / USD 18.15 with IVA), as
//   other monthly fees with trades are. The plans differ only by what can
//   be traded; a line has one price, so one row.
//   "Derecho de mercado e IVA": "Acciones 0,05% (0,03% Negociacion + 0,02%
//   Post-Trade) + IVA", "CEDEAR 0,05% ... + IVA", "Estas comisiones corren
//   por parte de BYMA": BYMA's 0.05 % + IVA a side (../bancogalicia/
//   bymaCost.mjs, table of 2026-08-14), the same figure. No US market fee
//   is printed: SEC, TAF and CAT stay 0.
//
// Book: BYMA's own; on the US the quoted NBBO (IEB names no US dealer).
// Tax: taxMap.mjs names none.
//
// Cash: pesos and dollars ("Pesos (ARS)", "Dólar Local", "Dólar Exterior";
// deposits.mjs); a line settles in its own currency and no FX enters the
// number. US trades are paid with "Dólares EXT" bought on the CCL board:
// the remark is the CCL half spread on a cable or US line, the MEP one on a
// peso or MEP line.
//
//   node brokers/ieb/ieb_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/ieb/ieb_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/ieb/ieb_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const FAQ = "https://www.iebmas.com.ar/preguntas-frecuentes/";

const file = arUsCostFile({
  folder: "ieb",
  name: "IEB+",
  catalogue: new URL("ieb-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: FAQ,
      readOn: "2026-10-26",
      entity: "Invertir en Bolsa S.A. (ALyC y AN Integral n° 246)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0 },
    vatOnCommission: true,
    basis: "FAQ IEB+ : commission zéro sur tous les plans ; droits BYMA 0,05 % + IVA imprimés ; abonnement Investor 5 000 pesos + IVA par mois avec opération (remarque)",
    remark: "Account fee is 6,050 pesos a month with trades.",
  },
  us: {
    rate: 0,
    vat: true,
    url: FAQ,
    readOn: "2026-10-26",
    basis: "FAQ IEB+, plan Global : commission zéro ; abonnement 15 USD + IVA par mois avec opération internationale (remarque)",
    remark: "Account fee is USD 18.15 a month with US trades.",
    notes: ["IEB+ ne nomme pas de courtier américain : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
