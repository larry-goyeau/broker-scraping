// What one round trip costs at Sita Corretora: buy n shares at price p on
// the Home Broker, sell them back another day, in dollars.
//
// The fee page, read on 2026-10-26.
//   https://sita.com.br/sita/custos/
//
//   Corretagem                     "Os custos das operações calculadas
//                                  sobre o volume financeiro, ou seja, a
//                                  soma das compras e vendas no dia":
//                                  "TABELA DE CORRETAGEM" up to
//                                  R$ 498,62 2,00%, R$ 498,63 to
//                                  R$ 1514,69 1,50% + R$ 2,49, to
//                                  R$ 3029,38 1,00% + R$ 10,06, above
//                                  0,50% + R$ 25,21 (the Bovespa table),
//                                  "Corretagem mínima R$ 10,00". One
//                                  table for the Home Broker and the
//                                  desk. On the day's volume, so the
//                                  round lot and the odd lot are one
//                                  amount, and a same-day buy and sell
//                                  are charged once on their sum.
//   Taxes                          none printed on top of the table.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Formula: max(R$10, Bovespa table on the side's volume), each side,
// + 2 × B3 + the book. Same day: the table once on buy + sell, half a
// side. Left out: the IRRF advance; the page prints no custody fee of
// its own. The account is funded in reais.
//
//   node brokers/sitacorretora/sitacorretora_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/sitacorretora/sitacorretora_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, bovespaTable, real } from "../nubank/b3Cost.mjs";

const PAGE = "https://sita.com.br/sita/custos/";
const MINIMUM = 10;

const dayFee = (volume) => Math.max(MINIMUM, bovespaTable(volume));

export const roundTrip = makeB3Cost({
  folder: "sitacorretora",
  name: "Sita",
  catalogue: new URL("sitacorretora-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ notional, dayTrade }) => (dayTrade ? real(dayFee(2 * notional) / 2) : dayFee(notional)),
  basis:
    "Sita : table Bovespa sur le volume du jour (somme des achats et ventes : 2 % jusqu'à R$ 498,62, 1,5 % + R$ 2,49, 1 % + R$ 10,06, 0,5 % + R$ 25,21), minimum R$ 10,00.",
});

printB3Cli(roundTrip, import.meta.url);
