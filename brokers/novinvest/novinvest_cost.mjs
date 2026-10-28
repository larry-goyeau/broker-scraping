// What one round trip costs at NovInvest: buy n shares at price p on the
// Home Broker, sell them back another day, in dollars. A desk or phone
// order (the B3 table, R$20 a day minimum) is another line.
//
// The fee page, read on 2026-10-26.
//   https://novinvest.com.br/custos-operacionais/
//
//   Corretagem – Ações e Opções,   "R$ 12,00, por ordem enviada,
//   Home Broker                    independente do valor investido." "O
//                                  valor de corretagem não é alterado
//                                  mesmo que a ordem seja parcialmente
//                                  executada".
//   Day trade                      "Promoção Para operações day trade: a
//                                  segunda ordem é isenta de taxa de
//                                  corretagem." The closing orders pay 0.
//   Taxes                          the page adds nothing on top.
//   Custody, renda variável        "de R$ 0 a R$ 300.000,00 Isento".
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs) and pay the R$12 twice. A BDR or an ETF is one order.
//
// Formula: R$12 × orders, each side, + 2 × B3 + the book. Same day: the
// sell orders pay no brokerage. Left out: the IRRF advance. The account
// is funded in reais.
//
//   node brokers/novinvest/novinvest_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/novinvest/novinvest_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://novinvest.com.br/custos-operacionais/";
const PER_ORDER = 12;

export const roundTrip = makeB3Cost({
  folder: "novinvest",
  name: "NovInvest",
  catalogue: new URL("novinvest-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, side, dayTrade }) => (dayTrade && side === "sell" ? 0 : perOrder(legs, () => PER_ORDER)),
  basis:
    "NovInvest Home Broker : R$ 12,00 par ordre envoyé, quel que soit le montant, un ordre par lot rond et un pour le lot fractionnaire ; en day trade le second ordre est gratuit.",
});

printB3Cli(roundTrip, import.meta.url);
