// What one round trip costs at Argentina Valores (Argentina Valores S.A.,
// ALyC y AN Integral n° 156 CNV): buy n shares at price p and sell them
// back, in dollars, ordered on its online trading platform. Two places from
// one account: BYMA (Buenos Aires shares and CEDEARs, ETF certificates
// included; peso, MEP (D) and cable (C) lines) and Wall Street (the whole
// US exchange book, in dollars).
//
// Read on 2026-10-26. "Tabla de aranceles", October 2019, the one the home
// page links; no later table is published:
//   https://www.avsa.com.ar/wp-content/uploads/2019/10/AVSA_TABLA-ARANCELES_2019-10.pdf
//
//   "Acciones ‐ Compra/Venta (3)": "ARANCEL MINIMO $ 150", "ARANCEL MAXIMO
//   1,25% + $ 100", "% sobre el monto bruto de la operación".
//   "Operaciones mercados internacionales": "U$D 10", "1.25% + U$D 10".
//   The maximum is the figure (owner rule): a side is
//   max(1.25 % × notional + 100 pesos, 150 pesos) on BYMA (the peso amounts
//   converted for a dollar line) and 1.25 % × notional + USD 10 on the US
//   (the USD 10 minimum never binds then).
//   "(1) Los precios no incluyen IVA ni derechos de mercado": 21 % IVA on
//   the commission, and BYMA's 0.05 % + IVA a side (../bancogalicia/
//   bymaCost.mjs, BYMA "Derechos de Mercado sobre Operaciones",
//   2026-08-14). No US market fee is printed: SEC, TAF and CAT stay 0.
//   "(2) ... se reserva el derecho de otorgar bonificaciones", "(3) Existen
//   bonificaciones por volúmenes y operaciones intradiarias": no figure, no
//   remark.
//   "Mantenimiento de cuenta /Custodia CV y otras depositarias": minimum
//   $ 400, "0,20% % anual sobre el valor de la custodia": the remark.
//
// Book: BYMA's own; on the US the quoted NBBO (no US dealer is named). Tax:
// taxMap.mjs names none.
// Left out: dividends (1 %), transfers of securities abroad (2 %, min
// USD 100), cash transfers (USD 10 / 0.10 %), management fees.
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/argentinavalores/argentinavalores_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/argentinavalores/argentinavalores_cost.mjs GGAL BCBA ARS --shares=1 --price=2000
//   node brokers/argentinavalores/argentinavalores_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/argentinavalores/argentinavalores_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const URL_PDF = "https://www.avsa.com.ar/wp-content/uploads/2019/10/AVSA_TABLA-ARANCELES_2019-10.pdf";
const RATE = 0.0125;
const FIXED_ARS = 100;
const MIN_ARS = 150;
const CUSTODY = "Custody 0.20% a year, min 400 pesos.";

const file = arUsCostFile({
  folder: "argentinavalores",
  name: "Argentina Valores",
  catalogue: new URL("argentinavalores-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: URL_PDF,
      page: "https://www.avsa.com.ar/productos-y-servicios/",
      readOn: "2026-10-26",
      inForce: "2019-10",
      entity: "Argentina Valores S.A. (ALyC y AN Integral n° 156)",
    },
    cash: ["ARS", "USD"],
    commission: ({ notional, currency, floorIn }) => {
      const fixed = floorIn(FIXED_ARS, currency);
      const floor = floorIn(MIN_ARS, currency);
      if (fixed == null || floor == null) return { fee: null, why: `pas de taux pour convertir les montants en pesos en ${currency}` };
      const raw = notional * RATE + fixed;
      return { fee: Math.max(raw, floor), floorBites: floor > raw };
    },
    vatOnCommission: true,
    basis: "tableau d'octobre 2019 : 1,25 % + 100 pesos (maximum retenu), minimum 150 pesos, + IVA par sens ; droits BYMA 0,05 % + IVA",
    remark: CUSTODY,
  },
  us: {
    rate: RATE,
    fixedUsd: 10,
    minUsd: 10,
    vat: true,
    url: URL_PDF,
    readOn: "2026-10-26",
    basis: "tableau d'octobre 2019, « Operaciones mercados internacionales » : 1,25 % + 10 USD (maximum retenu), minimum 10 USD, + IVA par sens",
    remark: CUSTODY,
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
