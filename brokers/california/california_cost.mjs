// What one round trip costs at La California (PSA La California S.A.,
// Pergamino, Agente de Negociación n° 498 CNV, clearing through its ALyC
// integral Rosario Valores S.A.): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars,
// ordered on BYMA's DMA Anima screen. Lines in pesos and in MEP dollars (D
// lines).
//
// Read on 2026-10-26. "Listado de Aranceles - Septiembre 2022", the only
// list on the page, one for every channel:
//   https://lacalifornia.com.ar/aranceles/
//   Contado – Renta      "Arancel", "Porcentaje", "Todo en pesos", "IVA %
//   variable             21", "0,12": 0.12% + 21% IVA = 0.1452% a side, no
//                        minimum. "Todo en pesos": a dollar line's
//                        commission is debited in pesos at its equivalent;
//                        the client holds pesos, so no conversion is forced.
//   Footnote             "Los aranceles informados no incluyen a los de los
//                        Mercados y ALYC, respectivamente": the clearing
//                        agent's and the market's charges come on top.
// ALyC's charge. Rosario Valores, "Aranceles para Operaciones de Mercado de
// Valores", Junio de 2026, "Arancel ROSVAL en BYMA", CONTADO, "Títulos
// Privados y Fondos Cerrados en Acciones ... 0,20" %, "Se deberá adicionar
// el Impuesto al Valor Agregado (IVA) cuando corresponda": 0.20% + IVA =
// 0.242% a side, in parts.frais (part of brokerFees).
//   https://www.rosval.com.ar/aranceles-para-operaciones-de-mercado-de-valores/
// Market rights: BYMA's August 2026 table, contado PPT, 0.05% on a private
// share or a CEDEAR, each side, plus IVA (../bancogalicia/bymaCost.mjs).
// No same-session rate, custody or account fee is printed by La California;
// Rosario Valores' day-trade line is the same 0.20%.
//
// Formula, each side: 0.12% × notional × 1.21 + 0.20% × notional × 1.21 +
// 0.05% × notional × 1.21, plus the book (spreads/byma-touch.mjs) and a tax
// when taxMap.mjs names one.
//
// Cash: Rosario Valores' Banco Comafi accounts for La California's clients,
// "Moneda: ARS" (alias Rosvalpesos) and "Moneda: USD" (alias RosvalUSD), so
// a line settles in its own currency and no FX enters the number; the remark
// is the MEP quote.
//   https://lacalifornia.com.ar/cuentas-bancarias/
//
//   node brokers/california/california_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/california/california_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/california/california_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const ROSVAL = 0.002;

const file = bymaCostFile({
  folder: "california",
  name: "La California",
  catalogue: new URL("california-parsed.json", import.meta.url),
  schedule: {
    url: "https://lacalifornia.com.ar/aranceles/",
    alyc: "https://www.rosval.com.ar/aranceles-para-operaciones-de-mercado-de-valores/",
    readOn: "2026-10-26",
    inForce: "2022-09",
    entity: "PSA La California S.A. (AN n° 498 CNV ; ALyC Rosario Valores S.A., n° 39)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.0012 },
  vatOnCommission: true,
  extras: ({ notional }) => [{ label: "arancel ALyC Rosario Valores 0,20 %", amount: notional * ROSVAL, vat: true }],
  basis:
    "« Listado de Aranceles - Septiembre 2022 », relu le 2026-10-26 : contado renta variable 0,12 % + IVA 21 % par sens, sans minimum ; " +
    "la liste exclut ALyC et marchés : arancel Rosario Valores en BYMA, actions, 0,20 % + IVA par sens (juin 2026) ; droits BYMA 0,05 % + IVA par sens",
  notes: ["commission débitée en pesos (« Todo en pesos ») : même montant en dollars, pas de change forcé"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
