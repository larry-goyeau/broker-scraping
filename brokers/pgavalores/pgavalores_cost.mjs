// What one round trip costs at PGA Valores (PGA Valores S.A., ALyC y AN
// Propio n° 1402 CNV): buy n shares at price p and sell them back, in
// dollars, ordered online ("Operatoria Online"). Two places from one
// account: BYMA (Buenos Aires shares and CEDEARs, ETF certificates
// included; peso, MEP (D) and cable (C) lines) and US shares ("acciones de
// EEUU", the whole US exchange book, in dollars).
//
// Read on 2026-10-26. "ANEXO I – TABLA DE ARANCELES Y COMISIONES" of the
// account-opening form, columns "Mínimo" and "Máximo":
//   https://pgavalores.com.ar/wp-content/uploads/2025/01/Comisiones.pdf
//
//   "Acciones Locales $0 – 200 hasta 1,5%"
//   "Acciones Exterior $0 – 200 hasta 1,5%"
//   Both ranges are at the broker's discretion, so the figure takes the top
//   of each (owner rule): 1.5 % a side with a 200-peso minimum (its dollar
//   equivalent on a dollar line; it binds only under 13,333 pesos).
//   "A los valores mencionados deberá adicionarse el Impuesto al Valor
//   Agregado (IVA) en caso de corresponder": 21 % on a share commission,
//   local or foreign.
//   "Los derechos de mercados ... se encuentran establecidos en las
//   respectivas páginas web de los diferentes mercados ... Bolsas y
//   Mercados Argentinos S.A. (www.byma.com.ar)": BYMA's 0.05 % + IVA a side
//   (../bancogalicia/bymaCost.mjs, table of 2026-08-14). No US market fee
//   is printed: SEC, TAF and CAT stay 0.
//   "Custodia de Títulos - 0.5% + Costos trasladados por Caja de Valores
//   (MENSUAL)": a holding cost, the remark.
//
// Book: BYMA's own; on the US the quoted NBBO (no US dealer named). Tax:
// taxMap.mjs names none.
// Left out: dividends (2 %), ADR conversion (up to USD 0.10 an ADR),
// transfers abroad (up to 25 euros + Caja de Valores).
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/pgavalores/pgavalores_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/pgavalores/pgavalores_cost.mjs GGAL BCBA ARS --shares=1 --price=6000
//   node brokers/pgavalores/pgavalores_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/pgavalores/pgavalores_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const PDF = "https://pgavalores.com.ar/wp-content/uploads/2025/01/Comisiones.pdf";
const CUSTODY = "Custody 0.5% a month plus Caja de Valores costs.";

const file = arUsCostFile({
  folder: "pgavalores",
  name: "PGA Valores",
  catalogue: new URL("pgavalores-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: PDF,
      page: "https://pgavalores.com.ar/",
      readOn: "2026-10-26",
      inForce: "2025-01",
      entity: "PGA Valores S.A. (ALyC y AN Propio n° 1402)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.015, minArs: 200 },
    vatOnCommission: true,
    basis: "Anexo I : « Acciones Locales $0 – 200 hasta 1,5% », haut de fourchette retenu, 1,5 % + IVA par sens, minimum 200 pesos + IVA ; droits BYMA 0,05 % + IVA",
    remark: CUSTODY,
  },
  us: {
    rate: 0.015,
    minArs: 200,
    vat: true,
    url: PDF,
    readOn: "2026-10-26",
    basis: "Anexo I : « Acciones Exterior $0 – 200 hasta 1,5% », haut de fourchette retenu, 1,5 % + IVA par sens, minimum 200 pesos + IVA",
    remark: CUSTODY,
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
