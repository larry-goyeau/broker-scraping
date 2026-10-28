// What one round trip costs at Banrisul Corretora: buy n shares at
// price p through the home broker or the app, sell them back at once,
// in dollars. A desk order (B3's table at -30 %) and an adviser's
// client (the full table) are other lines.
//
// The fee page, read on 2026-10-26.
//   https://www.banrisulcorretora.com.br/lxa/link/custos-tarifas.html
//
//   Renda Variável, new clients    "Cobrança de R$ 3,00 por ordem + 0,09%
//   ("Corretagem Padrão")          sobre o volume operado", for orders
//                                  "pelos canais digitais – Home Broker e
//                                  APP". Shares, BDRs and ETFs alike. No
//                                  day-trade line: the same fee.
//   Taxes                          the page adds nothing on top.
//   "Custódia de bolsa"            "TAXA ZERO".
//   Desk                           "Tabela padrão B3 com 30% de desconto".
//                                  Not an online order.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs) and pay the R$3 twice. A BDR or an ETF is one order.
//
// Formula: (R$3 × orders + 0.09 % of the amount), each side, + 2 × B3 +
// the book. Left out: the IRRF advance. The account is funded in reais.
//
//   node brokers/banrisulcorretor/banrisulcorretor_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/banrisulcorretor/banrisulcorretor_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.banrisulcorretora.com.br/lxa/link/custos-tarifas.html";
const PER_ORDER = 3;
const RATE = 0.0009;

export const roundTrip = makeB3Cost({
  folder: "banrisulcorretor",
  name: "Banrisul",
  catalogue: new URL("banrisulcorretor-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs }) => perOrder(legs, (leg) => PER_ORDER + RATE * leg.notional),
  basis:
    "Banrisul Home Broker et app : R$ 3,00 par ordre + 0,09 % du montant, un ordre par lot rond et un pour le lot fractionnaire ; garde à zéro.",
});

printB3Cli(roundTrip, import.meta.url);
