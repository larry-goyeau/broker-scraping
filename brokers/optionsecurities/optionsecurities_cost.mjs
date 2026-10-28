// What one round trip costs at Option Securities (Option Securities S.A.,
// AN y ALyC Propio n° 147 CNV): buy n shares at price p and sell them back,
// in dollars, ordered on its digital platforms. Two places in the
// catalogue: BYMA (Buenos Aires shares and CEDEARs, ETF certificates
// included; peso, MEP (D) and cable (C) lines) and the US account opened
// through it ("CUENTA EN USA"), the whole US exchange book in dollars.
//
// Read on 2026-10-26. "COMISIONES", linked from the home page:
//   https://www.optionsecurities.com.ar/Listado-de-comisiones.pdf
//
//   "Acciones, CEDEARs, Bonos Opciones y Ejercicios", "MINIMO 0,30%",
//   "MAXIMO 1,00%". The sheet does not say who pays which rate, so the
//   figure takes the maximum (owner rule), 1 % a side; the 0.30 % floor of
//   the range is the remark, a cut of the commission (1 % → 0.30 % = 70 %
//   lower). No amount minimum is printed.
//   IVA: the sheet does not mention it; a broker's commission on a share or
//   a CEDEAR bears 21 % IVA, so it is added, as on the other BYMA files
//   whose sheet is silent.
//   Market rights are not printed: BYMA's 0.05 % + IVA a side
//   (../bancogalicia/bymaCost.mjs, table of 2026-08-14).
//
// US lines: the home page and /cuenta-en-usa sell a US account "a través
// nuestro" but name no US broker and print no price for it; the sheet has
// no line for it. The owner took the local acciones / CEDEARs rate (1 % +
// IVA, the top of the range) as a stand-in (2026-10-26).
//
// Tax: taxMap.mjs names none.
// Left out: dividends (0.20 % to 2 %), custody (no figure printed).
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/optionsecurities/optionsecurities_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/optionsecurities/optionsecurities_cost.mjs QQQ BCBA ARS --shares=20 --price=15000
//   node brokers/optionsecurities/optionsecurities_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/optionsecurities/optionsecurities_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const file = arUsCostFile({
  folder: "optionsecurities",
  name: "Option Securities",
  catalogue: new URL("optionsecurities-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: "https://www.optionsecurities.com.ar/Listado-de-comisiones.pdf",
      page: "https://www.optionsecurities.com.ar/",
      readOn: "2026-10-26",
      entity: "Option Securities S.A. (AN y ALyC Propio n° 147)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.01 },
    vatOnCommission: true,
    basis: "« Comisiones » : acciones / CEDEARs 0,30 % à 1,00 %, maximum retenu, 1 % + IVA par sens ; droits BYMA 0,05 % + IVA",
    remark: "Commission can be up to 70% lower.",
  },
  us: {
    rate: 0.01,
    vat: true,
    url: "https://www.optionsecurities.com.ar/Listado-de-comisiones.pdf",
    readOn: "2026-10-26",
    basis: "aucune ligne US publiée : acciones / CEDEARs 1 % + IVA par sens (maximum de la fourchette) tient lieu (choix du propriétaire, 2026-10-26)",
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
