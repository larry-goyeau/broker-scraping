// What one round trip costs at EQI Investimentos: buy n shares at price
// p on B3, sell them back at once, in dollars. The self-service order
// ("Autoatendimento (Home Broker e Plataformas)"), not the desk.
//
// The fee page, read on 2026-10-26 (the "bovespa" option of the cost
// selector; the table sits in the page's script bundle).
//   https://eqi.com.br/renda-variavel/custos
//
//   Bovespa (Ações, Opções, ETF's,   regressive per order, the count
//   BDR's ...), self-service          "reiniciada mensalmente":
//                                     1 a 10 R$ 4,50 · 11 a 40 R$ 4,00 ·
//                                     41 a 75 R$ 3,50 · 76 a 500 R$ 1,20 ·
//                                     501 a ∞ R$ 0,25.
//                                     The cost is the first band, R$4.50
//                                     an order; the lower bands are the
//                                     remark. "Fracionário" counts in the
//                                     same group, so an odd lot is one
//                                     more order.
//   Taxes on the brokerage            none printed; nothing added.
//   Custody                           "Você não paga taxa de custódia
//                                     para investir em ... Renda Variável."
//   Assessoria / Mesa                 0.5%, minimum R$90: a desk line,
//                                     not this order.
//   B3                                0.030% of the amount each side, a
//                                     regular order, first band (see
//                                     ../nubank/b3Cost.mjs).
//
// Formula, each side: R$4.50 per order + B3 0.030%; then the book's half
// spread twice.
// Left out: IRRF "dedo-duro" (an income-tax advance); a forced close by
// risk. The account is funded in reais; no FX.
//
//   node brokers/eqiinvestimentos/eqiinvestimentos_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/eqiinvestimentos/eqiinvestimentos_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost, printB3Cli, perOrder, cutPercent } from "../nubank/b3Cost.mjs";

const PAGE = "https://eqi.com.br/renda-variavel/custos";
export const BANDS = [
  { from: 1, fee: 4.5 },
  { from: 11, fee: 4.0 },
  { from: 41, fee: 3.5 },
  { from: 76, fee: 1.2 },
  { from: 501, fee: 0.25 },
];
const FIRST = BANDS[0].fee;

// "11 or more orders a month: fees are x% lower; 76 or more: y% lower.",
// x in percent of the round trip's brokerage (R$4.50 an order).
function bandRemark({ legs }) {
  const orders = 2 * legs.length;
  const gap = (band) => cutPercent(orders * FIRST, orders * band.fee);
  const a = gap(BANDS[1]);
  const b = gap(BANDS[3]);
  if (!a && !b) return "";
  return `${BANDS[1].from} or more orders a month: fees are ${a}% lower; ${BANDS[3].from} or more: ${b}% lower.`;
}

export const roundTrip = makeB3Cost({
  folder: "eqiinvestimentos",
  name: "EQI Investimentos",
  catalogue: new URL("eqiinvestimentos-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs }) => perOrder(legs, () => FIRST),
  basis:
    "EQI Investimentos : courtage dégressive par ordre selon le nombre d'ordres du mois, R$ 4,50 de la 1re à la 10e ordre (retenu), jusqu'à R$ 0,25 au-delà de 500 ; aucune taxe ajoutée n'est imprimée.",
  remark: bandRemark,
});

printB3Cli(roundTrip, import.meta.url);
