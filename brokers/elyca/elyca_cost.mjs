// What one round trip costs at ELYCA (Elyca Servicios Globales S.A.,
// Agente de Negociación n° 1148 CNV, BYMA participant n° 828, Bahía Blanca),
// which clears through Rosario Valores S.A. (Rosval, ALyC-I n° 39): buy n
// Buenos Aires shares or CEDEARs (ETF certificates included) at price p and
// sell them back, in dollars, ordered on its client portal (VirtualBroker,
// virtualbroker-elyca.aunesa.com). Lines in pesos and in MEP dollars (D
// lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Tabla de aranceles máximos", dated "Marzo 2021"
// (the footer's "Tabla de Aranceles" link):
//   https://www.elyca.com.ar/PDF/tab_aran_2024.pdf
//   CONTADO, "TÍTULOS PRIVADOS 1,00% $800 Directo": 1% a side, at least
//   ARS 800 a side. "A las presentes comisiones debe adicionársele el IVA
//   (cuando corresponda)": 21% (1.21%, at least ARS 968). A dollar line
//   takes the ARS 800 floor at its dollar equivalent (fx.mjs); it never
//   binds near USD 1,000.
//   "Además, a tales comisiones, deberán sumarse ciertos cargos, aranceles
//   que cobra el ALYC I, incluyendo sin limitación los derechos que
//   perciben las bolsas y los mercados ... y gastos de Caja de Valores."
// The ALyC is Rosval (the FAQ's deposit accounts are "Cuentas Rosario
// Valores SA – Banco COMAFI", ARS and USD). Its "Aranceles para Operaciones
// de Mercado de Valores", "Junio de 2026":
//   https://www.rosval.com.ar/aranceles-para-operaciones-de-mercado-de-valores/
//   CONTADO, "Títulos Privados y Fondos Cerrados en Acciones", "Arancel
//   ROSVAL en BYMA 0,20" (%), each side; "Se deberá adicionar el Impuesto
//   al Valor Agregado (IVA) cuando corresponda": 0.242% a side. Notes (5)
//   and (6) say that only the bilateral rows exclude the destination
//   market's rights ("Arancel de RosVal no incluye Derecho de Mercado de
//   destino"), so the contado 0.20% carries BYMA's 0.05% and replaces it
//   here (in parts.bourse, as a broker's own rights line).
//   No same-session rate is printed (Rosval's DAY TRADE row is the same
//   0.20%).
//
// Formula, each side: max(1% × notional, ARS 800) × 1.21 + 0.20% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: Caja de Valores custody and Rosval's dividend charge (0.50%),
// CEDEAR conversion, and transfers (not this order). Account opening and
// maintenance "$0".
//
// Cash: pesos and dollars (FAQ "¿Cómo realizar depósitos de dinero?":
// "Moneda: ARS ... ALIAS: Rosvalpesos" and "Moneda: USD ... ALIAS:
// RosvalUSD"; "Invertí en Dólar MEP"), so a line settles in its own currency
// and no FX enters the number; the MEP quote's half spread is the remark.
//
//   node brokers/elyca/elyca_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/elyca/elyca_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/elyca/elyca_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "elyca",
  name: "ELYCA",
  catalogue: new URL("elyca-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.elyca.com.ar/PDF/tab_aran_2024.pdf",
    page: "https://www.rosval.com.ar/aranceles-para-operaciones-de-mercado-de-valores/",
    readOn: "2026-10-26",
    inForce: "2021-03",
    entity: "Elyca Servicios Globales S.A. (AN n° 1148), liquidé par Rosario Valores S.A. (ALyC-I n° 39)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 800 },
  vatOnCommission: true,
  market: 0.002,
  marketVat: true,
  basis:
    "« Tabla de aranceles máximos » : contado titres privés 1,00 % + IVA par sens, minimum 800 pesos + IVA ; " +
    "arancel Rosval (ALyC) en BYMA 0,20 % + IVA par sens, droits BYMA compris",
  notes: ["ouverture et tenue de compte sans frais"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
