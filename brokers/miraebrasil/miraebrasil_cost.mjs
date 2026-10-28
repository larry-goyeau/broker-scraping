// What one round trip costs at Mirae Asset Brasil: buy n shares at
// price p on B3, sell them back at once, in dollars. The self-service
// order (Home Broker or the Mi-Trade app), not the desk.
//
// The fee page, read on 2026-10-26 (the tables sit in the page's
// __NEXT_DATA__ JSON).
//   https://corretora.miraeasset.com.br/costs
//
//   HomeBroker            "Ações | BDR | Opções  R$ 0,99*" per executed
//                         order; an order filled over several days is
//                         charged "apenas uma vez".
//   Plataformas Mobile    "À Vista R$ 0,99* | ISS 5% R$ 0,15 | Corretagem
//                         Bruta R$ 1,14", and "Fracionário" the same. The
//                         gross R$1.14 is the figure charged per order;
//                         taken as is (it is above 0.99 + 5% ISS = 1.04).
//   Custos e Taxas        "Custo de ISS 5% Sobre a corretagem."
//   Custody               "taxa zero em ... Custódia de Ações, Fundo
//                         Imobiliário e ETF".
//   Mesa de Operações     Bovespa table + 5% ISS, minimum R$25: a desk
//                         line, not this order.
//   B3                    0.030% of the amount each side, a regular order,
//                         first band (see ../nubank/b3Cost.mjs).
//
// Formula, each side: R$1.14 per order (round lot and odd lot are two
// orders) + B3 0.030%; then the book's half spread twice.
// Left out: the 30-day free-brokerage offer for new accounts; IRRF
// "dedo-duro" (an income-tax advance); a forced close by risk (0.5%).
// The account is funded in reais; no FX.
//
//   node brokers/miraebrasil/miraebrasil_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/miraebrasil/miraebrasil_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://corretora.miraeasset.com.br/costs";
export const PER_ORDER_GROSS = 1.14;

export const roundTrip = makeB3Cost({
  folder: "miraebrasil",
  name: "Mirae Asset Brasil",
  catalogue: new URL("miraebrasil-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs }) => perOrder(legs, () => PER_ORDER_GROSS),
  basis:
    "Mirae Asset Brasil : courtage R$ 0,99 par ordre exécutée, « Corretagem Bruta » R$ 1,14 avec l'ISS 5 % (barème des plateformes, fractionnaire compris).",
});

printB3Cli(roundTrip, import.meta.url);
