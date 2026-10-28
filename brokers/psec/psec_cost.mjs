// What one round trip costs at PSEC (Prosecurities S.A., ALyC y AN Propio
// n° 30 CNV, BYMA member n° 163): buy n shares at price p and sell them
// back, in dollars, ordered on its web platform. Two places from one
// account: BYMA (Buenos Aires shares and CEDEARs, ETF certificates
// included; peso, MEP (D) and cable (C) lines) and the US ("todas las
// acciones negociadas en USA", in dollars).
//
// Read on 2026-10-26, "Aranceles y comisiones", columns "Mínimo" and
// "Máximo":
//   https://psec.com.ar/aranceles-y-comisiones.html
//
//   "Contado 0,10% + IVA 1,00% + IVA". The page does not say who pays which
//   rate, so the figure takes the maximum (owner rule), 1 % + IVA a side;
//   the 0.10 % floor of the range is the remark, 90 % under the 1 %. "No
//   hay comisión mínima de operaciones."
//   "Mandatos del exterior", "Arancel mín. $50 + IVA", "0,10% + IVA",
//   "1,00% + IVA": a US order, 1 % + IVA a side with a 50-peso minimum (a
//   few cents, it never binds on a real order).
//   Market rights are not printed: BYMA's 0.05 % + IVA a side
//   (../bancogalicia/bymaCost.mjs, table of 2026-08-14). No US market fee
//   is printed: SEC, TAF and CAT stay 0.
//   "Apertura y mantenimiento de cuenta 100% bonificados."
//
// Book: BYMA's own; on the US the quoted NBBO (no US dealer named). Tax:
// taxMap.mjs names none.
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/psec/psec_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/psec/psec_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/psec/psec_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const PAGE = "https://psec.com.ar/aranceles-y-comisiones.html";
const RANGE = "Commission can be up to 90% lower.";

const file = arUsCostFile({
  folder: "psec",
  name: "PSEC",
  catalogue: new URL("psec-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: PAGE,
      readOn: "2026-10-26",
      entity: "Prosecurities S.A. (ALyC y AN Propio n° 30)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.01 },
    vatOnCommission: true,
    basis: "aranceles PSEC : contado 0,10 % à 1,00 % + IVA, maximum retenu, 1 % + IVA par sens, sans minimum ; droits BYMA 0,05 % + IVA",
    remark: RANGE,
  },
  us: {
    rate: 0.01,
    minArs: 50,
    vat: true,
    url: PAGE,
    readOn: "2026-10-26",
    basis: "aranceles PSEC : « Mandatos del exterior » 0,10 % à 1,00 % + IVA, maximum retenu, 1 % + IVA par sens, minimum 50 pesos + IVA",
    remark: RANGE,
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
