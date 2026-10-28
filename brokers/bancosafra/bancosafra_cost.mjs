// What one round trip costs at Safra Corretora (Banco Safra): buy n
// shares at price p on the Homebroker (app or desktop), sell them back
// at once, in dollars. A desk order is another line.
//
// The fee page, read on 2026-10-26.
//   https://www.safra.com.br/corretora/custos-operacionais.htm
//
//   Ações (Homebroker)             "O valor da corretagem à vista,
//                                  através do Homebroker (aplicativo ou
//                                  desktop), é de R$ 4,50 sobre cada
//                                  ordem executada." The page prints
//                                  this under "Ações e fundos
//                                  imobiliários"; ETFs and BDRs go
//                                  through the same cash ticket. No
//                                  day-trade line: the same R$4.50.
//   Taxes                          "Os valores acima informados serão
//                                  acrescidos de PIS (0,65%), COFINS
//                                  (4%) e ISS (5%)": R$4.50 × 1.0965 =
//                                  R$4.93 an order.
//   Custody                        B3 custody waived: "a Safra Corretora
//                                  isenta todos os clientes que possuem
//                                  posições em Bolsa".
//   Desk                           "0,5% do valor operado + R$ 25 fixo".
//                                  Not online.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs). A BDR or an ETF is one order.
//
// Formula: R$4.93 × orders, each side, + 2 × B3 + the book. Left out:
// the IRRF advance. The account is funded in reais.
//
//   node brokers/bancosafra/bancosafra_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/bancosafra/bancosafra_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, withTaxes, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.safra.com.br/corretora/custos-operacionais.htm";
const PER_ORDER = 4.5;

export const roundTrip = makeB3Cost({
  folder: "bancosafra",
  name: "Safra",
  catalogue: new URL("bancosafra-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs }) => perOrder(legs, () => withTaxes(PER_ORDER)),
  basis:
    "Safra Homebroker : R$ 4,50 par ordre exécutée, + PIS 0,65 %, COFINS 4 %, ISS 5 % (R$ 4,93), un ordre par lot rond et un pour le lot fractionnaire.",
});

printB3Cli(roundTrip, import.meta.url);
