// What one round trip costs at Unicred (its broker ZIIN, Unicred DTVM):
// buy n shares at price p on the Home Broker or a platform
// ("Autoatendimento"), sell them back another day, in dollars. A desk
// order ("Assessoria", 0.5 % with R$90 minimum) is another line.
//
// The fee page, read on 2026-10-26 (an Angular app: the text sits in its
// main-es2015 script bundle).
//   https://www.unicred.com.br/solucoes/ziin/custos
//
//   "Bovespa (Ações, Opções,       "corretagem regressiva", counted per
//   Fracionário, ETF, BDR etc.)",  month: "1 a 10 R$ 4,50", "11 a 40
//   Autoatendimento (Home Broker   R$ 4,00", "41 a 75 R$ 3,50", "76 a 500
//   e Plataformas)                 R$ 1,20", "501 a ∞ R$ 0,25" per order.
//                                  One round trip is within the first ten.
//   Day trade                      "Para clientes que aderirem ao RLP, não
//                                  haverá custo de corretagem no módulo
//                                  Day Trade para operações em ações e
//                                  ETFs através do Autoatendimento."
//   Taxes                          the page adds nothing on top.
//   Renda Variável custody         "ZERO"; "Taxa de Custódia B3: ZERO".
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs) and pay R$4.50 twice. A BDR or an ETF is one order.
//
// Formula: R$4.50 × orders, each side, + 2 × B3 + the book. Same day (with
// RLP): no brokerage. Remark: from the 11th order of the month, R$4.00, a
// cut on the brokerage itself (R$4.50 → R$4.00, 11 % lower).
// Left out: the IRRF advance. The account is funded in reais.
//
//   node brokers/unicred/unicred_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/unicred/unicred_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder, cutPercent } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.unicred.com.br/solucoes/ziin/custos";
const FIRST_TEN = 4.5;
const FROM_ELEVEN = 4;

export const roundTrip = makeB3Cost({
  folder: "unicred",
  name: "Unicred",
  catalogue: new URL("unicred-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, dayTrade }) => (dayTrade ? 0 : perOrder(legs, () => FIRST_TEN)),
  basis:
    "ZIIN (Unicred) Home Broker et plateformes : courtage dégressif par ordre, R$ 4,50 pour les ordres 1 à 10 du mois, un ordre par lot rond et un pour le lot fractionnaire ; garde à zéro.",
  remark: ({ legs }) => {
    const orders = 2 * legs.length;
    const gap = cutPercent(orders * FIRST_TEN, orders * FROM_ELEVEN);
    return gap ? `11 or more orders a month: fees are ${gap}% lower.` : "";
  },
});

printB3Cli(roundTrip, import.meta.url);
