// What one round trip costs at StoneX DTVM (Brazil): buy n shares at price
// p through its electronic channels (home broker, DMA), sell them back
// another day, in dollars.
//
// The client information page, read on 2026-10-26 (behind a Cloudflare
// check that a plain request does not pass).
//   https://www.stonex.com/pt-br/empresas/dtvm/informacoes-ao-cliente/
//
//   "Tabela de Corretagem –        "Volume diário entre": R$ 0,01 to
//   Ações B3"                      R$ 135,07 0,00% + R$ 2,70; to R$ 498,62
//                                  2,00%; to R$ 1.514,69 1,50% + R$ 2,49;
//                                  to R$ 3.029,38 1,00% + R$ 10,06; above
//                                  0,50% + R$ 25,21 (the Bovespa table;
//                                  the page misprints R$ 438,62 as the
//                                  top of band 2). On the day's volume,
//                                  so the round lot and the odd lot are
//                                  one amount, and a same-day buy and sell
//                                  are charged once on their sum.
//   ISS                            "O valor de ISS equivale à 5% do valor
//                                  total da taxa de corretagem": "ISS =
//                                  Taxa de Corretagem / 0,95 – Taxa de
//                                  Corretagem", so the brokerage / 0.95.
//   Rules ("Regras e Parâmetros")  "A taxa de corretagem será negociada
//                                  com o Cliente ... A tabela com os custos
//                                  máximos de corretagem ... está
//                                  disponível ... no site": the table is
//                                  the maximum and is used whole (owner
//                                  rule: a range takes its maximum).
//                                  Orders may come through "home broker,
//                                  aplicativos" and DMA.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//   https://www.filesandimages.com/Brand/StoneXBrasil/RPA_OperatingRulesandParameters_v12.pdf
//
// Formula: Bovespa table on the side's volume / 0.95, each side, + 2 × B3
// + the book. Same day: the table once on buy + sell, half a side. Left
// out: the IRRF advance; no custody fee is printed. The account is funded
// in reais.
//
//   node brokers/stonexdtvm/stonexdtvm_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/stonexdtvm/stonexdtvm_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, bovespaTable, withTaxes, real } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.stonex.com/pt-br/empresas/dtvm/informacoes-ao-cliente/";
const ISS_GROSS_UP = 1 / 0.95 - 1; // ISS 5 % of the brokerage including ISS

const dayFee = (volume) => withTaxes(bovespaTable(volume), ISS_GROSS_UP);

export const roundTrip = makeB3Cost({
  folder: "stonexdtvm",
  name: "StoneX DTVM",
  catalogue: new URL("stonexdtvm-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ notional, dayTrade }) => (dayTrade ? real(dayFee(2 * notional) / 2) : dayFee(notional)),
  basis:
    "StoneX DTVM : table Bovespa (barème maximal, courtage négociable) sur le volume du jour (R$ 2,70 jusqu'à R$ 135,07, 2 % jusqu'à R$ 498,62, 1,5 % + R$ 2,49, 1 % + R$ 10,06, 0,5 % + R$ 25,21), ISS 5 % inclus (courtage / 0,95).",
});

printB3Cli(roundTrip, import.meta.url);
