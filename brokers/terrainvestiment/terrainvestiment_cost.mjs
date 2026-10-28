// What one round trip costs at Terra Investimentos: buy n shares at
// price p on B3, sell them back at once, in dollars. The self-service
// order ("*Válido para autoatendimento"), not the desk or an adviser.
//
// The fee page, read on 2026-10-26.
//   https://www.terrainvestimentos.com.br/custos/
//
//   Corretagem Bovespa, regressive    "De 1 a 10 ordens R$ 4,50 por
//   on the orders of the month         ordem" · 11 a 40 R$ 4,00 · 41 a 75
//                                      R$ 3,50 · 76 a 500 R$ 1,20 · "De
//                                      501 ordens a ∞ R$ 0,25 por ordem".
//                                      The cost is the first band, R$4.50
//                                      an order; the lower bands are the
//                                      remark. An odd lot is one more
//                                      order.
//   Nota de corretagem, taxes          "ISS – São Paulo 5%", "ISS – Rio de
//                                      Janeiro 2%", "COFINS 4%", "PIS
//                                      0,65%": added on the brokerage, the
//                                      higher ISS (São Paulo) taken, so
//                                      9.65% (withTaxes).
//   Tabela Bovespa                     "Para operações via mesa e
//                                      assessor": not this order.
//   B3                                 0.030% of the amount each side, a
//                                      regular order, first band (see
//                                      ../nubank/b3Cost.mjs).
//
// Formula, each side: R$4.50 × 1.0965 = R$4.93 per order + B3 0.030%;
// then the book's half spread twice.
// Left out: IRRF "dedo-duro" (an income-tax advance); the R$30 forced
// close by risk. No custody fee is printed. The account is funded in
// reais; no FX.
//
//   node brokers/terrainvestiment/terrainvestiment_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/terrainvestiment/terrainvestiment_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost, printB3Cli, perOrder, withTaxes, cutPercent } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.terrainvestimentos.com.br/custos/";
export const BANDS = [
  { from: 1, fee: 4.5 },
  { from: 11, fee: 4.0 },
  { from: 41, fee: 3.5 },
  { from: 76, fee: 1.2 },
  { from: 501, fee: 0.25 },
];
const FIRST = BANDS[0].fee;

// "11 or more orders a month: fees are x% lower; 76 or more: y% lower.",
// x in percent of the round trip's brokerage with its taxes.
function bandRemark({ legs }) {
  const orders = 2 * legs.length;
  const gap = (band) => cutPercent(orders * withTaxes(FIRST), orders * withTaxes(band.fee));
  const a = gap(BANDS[1]);
  const b = gap(BANDS[3]);
  if (!a && !b) return "";
  return `${BANDS[1].from} or more orders a month: fees are ${a}% lower; ${BANDS[3].from} or more: ${b}% lower.`;
}

export const roundTrip = makeB3Cost({
  folder: "terrainvestiment",
  name: "Terra Investimentos",
  catalogue: new URL("terrainvestiment-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs }) => perOrder(legs, () => withTaxes(FIRST)),
  basis:
    "Terra Investimentos : courtage Bovespa dégressive par ordre selon le nombre d'ordres du mois, R$ 4,50 de la 1re à la 10e ordre (retenu), + PIS 0,65 %, COFINS 4 %, ISS 5 % (São Paulo, le plus haut des deux ISS imprimés).",
  remark: bandRemark,
});

printB3Cli(roundTrip, import.meta.url);
