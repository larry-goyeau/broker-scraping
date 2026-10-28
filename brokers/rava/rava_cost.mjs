// What one round trip costs at Rava Bursátil (Rava Bursátil S.A., ALyC y
// AN Propio n° 332 CNV): buy n shares at price p and sell them back, in
// dollars, ordered from the web or the app. Two places from one account:
// BYMA (Buenos Aires shares and CEDEARs, ETF certificates included; peso,
// MEP (D) and cable (C) lines) and Wall Street (the whole US exchange book,
// in dollars).
//
// Read on 2026-10-26, "Aranceles y gastos", "Estos son los aranceles
// máximos por tipo de operación", columns "Arancel Mínimo" and "Máximo %":
//   https://www.rava.com/nuestros-servicios/aranceles
//
//   Renta variable, "Contado* $0 0,80% + IVA + DM 0,08%": 0.80 % + IVA a
//   side, no minimum, and market rights ("DM: Derechos de Mercado de
//   Valores de Buenos Aires") 0.08 % as printed, with no IVA written on
//   them. The ceiling is the figure (owner rule).
//   "Mandatos en el exterior u$s 20 + IVA 0,80% + IVA": a US order,
//   max(0.80 % × notional, USD 20) + IVA a side. No US market fee is
//   printed: SEC, TAF and CAT stay 0.
//   "* Las operaciones de trading diario -compra y venta de la misma
//   especie en el día- en acciones y títulos públicos locales pagan un sólo
//   arancel, el que sea mayor": the figure assumes another day; the waiver
//   is the remark on a local share line (not on a CEDEAR).
//   "Apertura de cuenta Sin cargo", "Mantenimiento de cuenta Sin cargo".
//
// Book: BYMA's own; on the US the quoted NBBO (no US dealer named). Tax:
// taxMap.mjs names none.
// Left out: dividends (1 % + IVA + Caja de Valores), ADR conversion
// (USD 70 + IVA min, 0.50 %).
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/rava/rava_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/rava/rava_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/rava/rava_cost.mjs US0378331005 XNAS USD --shares=1 --price=250
//   node brokers/rava/rava_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const PAGE = "https://www.rava.com/nuestros-servicios/aranceles";

const file = arUsCostFile({
  folder: "rava",
  name: "Rava Bursátil",
  catalogue: new URL("rava-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: PAGE,
      page: "https://www.rava.com/que-ofrecemos",
      readOn: "2026-10-26",
      entity: "Rava Bursátil S.A. (ALyC y AN Propio n° 332)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.008 },
    vatOnCommission: true,
    market: 0.0008,
    marketVat: false,
    basis: "aranceles Rava (maximums) : contado renta variable 0,80 % + IVA par sens, sans minimum ; droits de marché imprimés 0,08 %",
    // "en acciones y títulos públicos locales": shares, not CEDEARs.
    remark: ({ cedear }) => (cedear ? "" : "If the sale is the same day only one commission is charged."),
  },
  us: {
    rate: 0.008,
    minUsd: 20,
    vat: true,
    url: PAGE,
    readOn: "2026-10-26",
    basis: "aranceles Rava : « Mandatos en el exterior » 0,80 % + IVA par sens, minimum 20 USD + IVA",
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
