// What one round trip costs at Traders Corretora (Traders Club, through
// Terra Investimentos): buy n shares at price p on the app or web
// platform, sell them back at once, in dollars. A desk order is another
// line.
//
// The fee page, read on 2026-10-26: the FAQ "Qual a corretagem da
// Traders?".
//   https://traders.com.br/investimentos/renda-variavel
//
//   Bovespa                        "R$ 1,99 por ordem executada." One
//                                  line for the whole cash market:
//                                  shares, units, BDRs and ETFs. No
//                                  day-trade line: the same R$1.99. No
//                                  tax is printed on top of it, so none
//                                  is added.
//   Desk / zeroing                 "Zeragem e Mesa de operações = R$
//                                  30,00 por ordem executada". Not an
//                                  online order.
//   Custody                        "sem custos ou taxas de custódia".
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs). A BDR or an ETF is one order.
//
// Formula: R$1.99 × orders, each side, + 2 × B3 + the book. Left out:
// the IRRF advance. The account is funded in reais.
//
//   node brokers/traderscorretora/traderscorretora_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/traderscorretora/traderscorretora_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://traders.com.br/investimentos/renda-variavel";
const PER_ORDER = 1.99;

export const roundTrip = makeB3Cost({
  folder: "traderscorretora",
  name: "Traders",
  catalogue: new URL("traderscorretora-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs }) => perOrder(legs, () => PER_ORDER),
  basis:
    "Traders, Bovespa : R$ 1,99 par ordre exécutée, un ordre par lot rond et un pour le lot fractionnaire ; aucune taxe ajoutée n'est indiquée.",
});

printB3Cli(roundTrip, import.meta.url);
