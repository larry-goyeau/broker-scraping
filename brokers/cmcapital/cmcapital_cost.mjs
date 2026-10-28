// What one round trip costs at CM Capital (CM Capital Markets CCTVM): buy
// n shares at price p on B3, sell them back at once, in dollars. The order
// sent online (home broker or platform). A desk order is another line.
//
// The fee pages, read on 2026-10-26.
//   https://mkt.cmcapital.com.br/abertura-de-conta-versao-2
//   https://ajuda.cmcapital.com.br/hc/pt-br/articles/360043007933
//   https://ajuda.cmcapital.com.br/hc/pt-br/articles/360043008373
//
//   Brokerage, shares, BDRs, ETFs   "Ações, Opções, ... BDRs, ETFs ... Tudo
//                                   com corretagem zero." Help centre: "A
//                                   corretagem na CM Capital para operações
//                                   no lote cheio e no lote fracionário é
//                                   ZERO!" R$0 each side, so no tax on it.
//   Account                         "sua conta não tem tarifas de
//                                   manutenção".
//   Desk / forced close             "0,5% sobre o volume negociado, com
//                                   mínimo de R$ 45,00". Not an online order.
//   B3                              0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Formula: 2 × B3 (0.030 % of the amount, to the centavo) + the book.
// Left out: the IRRF advance, paid trading platforms (Profit, Tryd; a
// software subscription, not an order cost). The account is funded in
// reais; no FX.
//
//   node brokers/cmcapital/cmcapital_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/cmcapital/cmcapital_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost, printB3Cli } from "../nubank/b3Cost.mjs";

const PAGE = "https://ajuda.cmcapital.com.br/hc/pt-br/articles/360043007933";

export const roundTrip = makeB3Cost({
  folder: "cmcapital",
  name: "CM Capital",
  catalogue: new URL("cmcapital-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: () => 0,
  basis:
    "CM Capital : « corretagem zero » sur actions, BDR et ETF, lot rond comme lot fractionnaire, sans frais de tenue de compte ; seuls les frais B3 restent.",
});

printB3Cli(roundTrip, import.meta.url);
