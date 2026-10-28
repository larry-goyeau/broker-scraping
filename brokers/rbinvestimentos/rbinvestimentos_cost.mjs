// What one round trip costs at RB Investimentos: buy n shares at price p
// on the Home Broker, sell them back another day, in dollars. A desk order
// (the Bovespa table) is another line.
//
// The fee page, read on 2026-10-26.
//   https://www.rbinvestimentos.com/custos-operacionais/
//
//   Renda Variável, "Para Ações,   "Via HB: R$ 14,90 por ordem (também
//   ETF e FII"                     fracionária e opções)." No day-trade
//                                  line for shares: the same fee.
//   Desk                           "Via Mesa: tabela Bovespa". Not an
//                                  online order.
//   Taxes                          the page adds nothing on top.
//   Custody                        none printed for shares.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs) and pay the R$14.90 twice. A BDR or an ETF is one order.
//
// Formula: R$14.90 × orders, each side, + 2 × B3 + the book. Left out:
// the IRRF advance. The account is funded in reais.
//
//   node brokers/rbinvestimentos/rbinvestimentos_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/rbinvestimentos/rbinvestimentos_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.rbinvestimentos.com/custos-operacionais/";
const PER_ORDER = 14.9;

export const roundTrip = makeB3Cost({
  folder: "rbinvestimentos",
  name: "RB Investimentos",
  catalogue: new URL("rbinvestimentos-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs }) => perOrder(legs, () => PER_ORDER),
  basis:
    "RB Investimentos Home Broker : R$ 14,90 par ordre (fractionnaire compris), un ordre par lot rond et un pour le lot fractionnaire.",
});

printB3Cli(roundTrip, import.meta.url);
