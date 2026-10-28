// What one round trip costs at Sailing Inversiones (Sailing S.A., ALyC
// Propio n° 578 CNV): buy n shares at price p and sell them back, in
// dollars, ordered from the web page or the app. Two places from one
// account: BYMA (Buenos Aires shares and CEDEARs, ETF certificates
// included; peso, MEP (D) and cable (C) lines) and the US ("Sailing
// Internacional", the whole US exchange book, in dollars).
//
// Read on 2026-10-26, "Aranceles", "COMISIONES (máximas)":
//   https://www.sailinginversiones.com/operar/aranceles/
//
//   "Acciones 1.00% + I.V.A.", "Cedears 1.00% + I.V.A.": the ceiling is the
//   figure (owner rule), 1 % + IVA a side, no minimum printed.
//   "(i) Para todas las operaciones se adicionarán los gastos por derechos
//   de mercado que éste cobre, mas el IVA salvo instrumentos exentos":
//   BYMA's 0.05 % + IVA a side (../bancogalicia/bymaCost.mjs, table of
//   2026-08-14).
//   "Apertura de Cuenta Sin Cargo", "Mantenimiento de cuenta Sin Cargo".
//
// US lines: "Tarifas para operatoria en Estados Unidos", "Acciones, ETFs y
// otros instrumentos del Exterior (ii) A consutar con Sailing", "(ii) Se
// adicionarán los gastos y costos de los brokers intermediaros" (none
// named). No price is published: the owner took the local acciones /
// cedears 1 % + IVA as a stand-in (2026-10-26).
//
// Tax: taxMap.mjs names none.
// Left out: the managed-portfolio fee (up to 2 % a year + IVA), dividends
// (Caja de Valores pass-through), transfers abroad (from USD 50).
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/sailing/sailing_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/sailing/sailing_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/sailing/sailing_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const file = arUsCostFile({
  folder: "sailing",
  name: "Sailing Inversiones",
  catalogue: new URL("sailing-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: "https://www.sailinginversiones.com/operar/aranceles/",
      readOn: "2026-10-26",
      entity: "Sailing S.A. (ALyC Propio n° 578)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.01 },
    vatOnCommission: true,
    basis: "aranceles Sailing (maximums) : acciones / cedears 1,00 % + IVA par sens, sans minimum ; droits BYMA 0,05 % + IVA",
  },
  us: {
    rate: 0.01,
    vat: true,
    url: "https://www.sailinginversiones.com/operar/aranceles/",
    readOn: "2026-10-26",
    basis: "tarif américain « A consutar con Sailing » : acciones / cedears 1 % + IVA par sens tient lieu (choix du propriétaire, 2026-10-26) ; les frais des courtiers intermédiaires annoncés ne sont pas chiffrés",
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
