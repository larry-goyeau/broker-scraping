// What one round trip costs at Leiva Hnos. (Leiva Hermanos S.A., ALyC I
// Agro n° 630 CNV, Paraná): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// through direct market access (DMA, the "App Leiva Hnos" / "Acceso
// Directo al mercado"). Lines in pesos, MEP dollars (D lines) and cable
// dollars (C lines).
//
// Read on 2026-10-26. "Cuadro de aranceles y gastos", "Vigencia a partir
// del 02/06/2026" (the site footer's "COMISIONES Y ARANCELES", a page that
// shows one image):
//   https://apps.leivahnos.com.ar/legales/esquema-de-comisiones/
//   https://apps.leivahnos.com.ar/legales/esquema-de-comisiones/aranceles-y-comisiones.jpeg
//   RENTA VARIABLE, "ACCIONES" and "CEDEARs": "% MAX (Por Mesa) 1%,
//   MINIMA $1500/USD 2" and "% MAX (Por DMA) 0.5%, MINIMA $500/USD1", each
//   side. The DMA column is the online line: 0.50%, at least ARS 500 on a
//   peso line and USD 1 on a dollar line. The desk ("Por Mesa") is the
//   adviser channel; the online line exists, so it is left out.
//   Note (2): "El IVA será aplicado según corresponda, sobre el importe de
//   la comisión o arancel": 21% on a share or CEDEAR commission (0.605%).
//   Note (1): "a los aranceles expuestos se le deberán sumar los derechos
//   de mercado ... (BYMA)": BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate and no cable trade charge is printed.
// (broker-list.json's fees_url, TARIFA-DE-REFERENCIA-ENERO-2026.pdf, is a
// grain freight table, not the securities tariff.)
//
// Formula, each side: max(0.50% × notional, ARS 500 | USD 1) × 1.21 +
// 0.05% × notional × 1.21; plus the book, and a tax when taxMap.mjs names
// one (none on BYMA).
// Left out: custody ("Traslado costos Caja de Valores", "COBRO DE CUSTODIA
// $400"), dividends (1%), CEDEAR conversion (USD 0.12 per certificate),
// transfers ("TRANSFERENCIAS U$S EXTERIOR USD 100", "TRANSFERENCIAS MEP
// $2000"), and BYMA's day-trade bonus on the post-trade part (under 0.01% a
// side; the figure assumes another day).
//
// Cash: pesos and dollars ("Inversiones en Pesos / Dólares", "Dólar MEP";
// note (3) "Los gastos y aranceles serán descontados en la moneda de
// Liquidación de las Operaciones"; "TRANSFERENCIAS EN U$S USD 5"), so a line
// settles in its own currency and no FX enters the number; the MEP quote's
// half spread is the remark (the CCL quote on a C line).
//
//   node brokers/leivahnos/leivahnos_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/leivahnos/leivahnos_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/leivahnos/leivahnos_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/leivahnos/leivahnos_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "leivahnos",
  name: "Leiva Hnos.",
  catalogue: new URL("leivahnos-parsed.json", import.meta.url),
  schedule: {
    url: "https://apps.leivahnos.com.ar/legales/esquema-de-comisiones/aranceles-y-comisiones.jpeg",
    page: "https://apps.leivahnos.com.ar/legales/esquema-de-comisiones/",
    readOn: "2026-10-26",
    inForce: "2026-06-02",
    entity: "Leiva Hermanos S.A. (ALyC I Agro n° 630)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.005, minArs: 500, minUsd: 1 },
  vatOnCommission: true,
  basis: "« Cuadro de aranceles y gastos » du 02/06/2026, colonne DMA : actions / CEDEARs 0,50 % + IVA par sens, minimum 500 pesos ou 1 USD + IVA ; droits BYMA 0,05 % + IVA",
  notes: ["le guichet (« Por Mesa », 1 %, minimum 1 500 pesos / 2 USD) est le canal conseiller, laissé de côté"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
