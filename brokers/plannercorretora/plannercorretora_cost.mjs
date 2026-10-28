// What one round trip costs at Planner Corretora: buy n shares at price p
// on its electronic platforms, sell them back another day, in dollars.
//
// The fee page, read on 2026-10-26.
//   https://www.planner.com.br/tarifas-custos-operacionais/
//
//   Corretagem Bovespa             "A Planner segue a Tabela Bovespa como
//                                  política de corretagem, com o mínimo de
//                                  R$ 20,00/dia de corretagem nota."
//                                  "Financeiro no dia": up to R$ 135,07
//                                  R$ 2,70; to R$ 498,62 2,0000%; to
//                                  R$ 1.514,69 1,5000% + 2,49; to
//                                  R$ 3.029,38 1,0000% + 10,06; from
//                                  R$ 3.029,39 0,5000% + 25,21. One table,
//                                  no separate line for the platforms. On
//                                  the day's volume, so the round lot and
//                                  the odd lot are one amount, and a
//                                  same-day buy and sell are charged once
//                                  on their sum.
//   Taxes                          "Repasse de imposto sobre a corretagem
//                                  gerada – alíquota atual de 9,65%."
//   Custody (B3 equities)          0,0500% a year up to R$ 100.000, but
//                                  "Investidores com posições até
//                                  R$ 23.084,39 são isentos": nothing at
//                                  this size, and small. Not counted.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Formula: max(R$20, Bovespa table on the side's volume) × 1.0965, each
// side, + 2 × B3 + the book. Same day: the table once on buy + sell, half
// a side. Left out: the IRRF advance, custody. The account is funded in
// reais.
//
//   node brokers/plannercorretora/plannercorretora_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/plannercorretora/plannercorretora_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, bovespaTable, withTaxes, real } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.planner.com.br/tarifas-custos-operacionais/";
const MINIMUM = 20;

const dayFee = (volume) => withTaxes(Math.max(MINIMUM, bovespaTable(volume)));

export const roundTrip = makeB3Cost({
  folder: "plannercorretora",
  name: "Planner",
  catalogue: new URL("plannercorretora-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ notional, dayTrade }) => (dayTrade ? real(dayFee(2 * notional) / 2) : dayFee(notional)),
  basis:
    "Planner : table Bovespa sur le volume du jour (R$ 2,70 jusqu'à R$ 135,07, 2 % jusqu'à R$ 498,62, 1,5 % + R$ 2,49, 1 % + R$ 10,06, 0,5 % + R$ 25,21), minimum R$ 20,00 par jour, + 9,65 % d'impôts sur le courtage.",
});

printB3Cli(roundTrip, import.meta.url);
