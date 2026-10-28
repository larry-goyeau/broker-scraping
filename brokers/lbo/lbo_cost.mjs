// What one round trip costs at LBO (LBO S.A., ALyC Integral Agroindustrial
// n° 160 CNV, Rosario): buy n shares at price p and sell them back, in
// dollars, ordered from the client platform. Two places from one account:
// BYMA (Buenos Aires shares and CEDEARs, ETF certificates included; peso,
// MEP (D) and cable (C) lines) and NYSE / Nasdaq shares and ETFs bought
// directly, in dollars.
//
// Read on 2026-10-26, "Listado de comisiones LBO", "Arancel (máx)" and
// "Mínimo":
//   https://www.lbo.com.ar/listado-de-comisiones
//
//   "Acciones Directo 1,00 % $ 50,00", "Cedears Directo 1,00 % $ 50,00":
//   1 % a side, minimum 50 pesos (its peso equivalent on a dollar line).
//   "Acciones - ETF NYSE / NASDAQ Directo 1,00 % U$S 1,00": 1 % a side,
//   minimum USD 1.
//   "* A todos los aranceles se les debe adicionar el IVA, a excepción de
//   Títulos Públicos y Letras": 21 % on both.
//   Market rights are not printed: BYMA's 0.05 % + IVA a side
//   (../bancogalicia/bymaCost.mjs, table of 2026-08-14). No US market fee
//   is printed: SEC, TAF and CAT stay 0.
//   "LBO podrá aplicar al COMITENTE un fee de administración ... no podrá
//   exceder el dos por ciento (2%) anual sobre el valor de los AUM ... un
//   cargo mínimo anual equivalente a dólares estadounidenses cien (USD
//   100)": a holding fee, the remark.
//
// Book: BYMA's own; on the US the quoted NBBO (no US dealer named). Tax:
// taxMap.mjs names none.
// Left out: dividends (1 %), custody (Caja de Valores pass-through, no
// figure), dollar withdrawals (USD 5), transfers of securities.
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/lbo/lbo_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/lbo/lbo_cost.mjs GGAL BCBA ARS --shares=1 --price=2000
//   node brokers/lbo/lbo_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/lbo/lbo_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const PAGE = "https://www.lbo.com.ar/listado-de-comisiones";
const AUM = "Account fee up to 2% a year, min $100.";

const file = arUsCostFile({
  folder: "lbo",
  name: "LBO",
  catalogue: new URL("lbo-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: PAGE,
      readOn: "2026-10-26",
      entity: "LBO S.A. (ALyC Integral Agroindustrial n° 160)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.01, minArs: 50 },
    vatOnCommission: true,
    basis: "listado de comisiones LBO : acciones / cedears 1 % + IVA par sens (arancel máx.), minimum 50 pesos + IVA ; droits BYMA 0,05 % + IVA",
    remark: AUM,
  },
  us: {
    rate: 0.01,
    minUsd: 1,
    vat: true,
    url: PAGE,
    readOn: "2026-10-26",
    basis: "listado de comisiones LBO : « Acciones - ETF NYSE / NASDAQ » 1 % + IVA par sens, minimum 1 USD + IVA",
    remark: AUM,
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
