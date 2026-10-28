// What one round trip costs at Monte Bravo Corretora: buy n shares at
// price p on the electronic platforms ("Autoatendimento"), sell them back
// at once, in dollars. Monte Bravo is a PNA; XP Investimentos is its
// clearing partner (PNP). Desk and adviser orders are other lines.
//
// The cost document, read on 2026-10-26.
//   https://www.montebravo.com.br/wp-content/uploads/2026/09/Custos_Monte_Bravo.pdf
//
//   Ações e BDRs, Autoatendimento  "Ordens executadas nas plataformas
//                                  eletrônicas de negociação diretamente
//                                  pelo cliente": "Swing Trade: R$ 4,90",
//                                  "Day Trade não aderindo ao RLP:
//                                  R$ 2,90", "Day Trade aderindo ao RLP:
//                                  R$ 0,00". "Corretagem por ordem
//                                  executada". ETFs at the same rates:
//                                  Monte Bravo's cut to R$4,90 was for
//                                  "operações em Ações, BDRs e ETFs
//                                  realizadas pelo Home Broker e
//                                  Aplicativo XP" (InfoMoney, 2020-09-17,
//                                  https://www.infomoney.com.br/?p=1522179).
//                                  RLP is an opt-in: R$2.90 used. The
//                                  "Preço fixo padrão" R$18,90 is the
//                                  undiscounted price, for other channels.
//   Taxes                          "As corretagens ... exibidas na nota são
//                                  líquidas de impostos (ISS – 5%, PIS –
//                                  0,65% e COFINS – 4%)", and in the same
//                                  document "terão um acréscimo referente
//                                  ao ISS, PIS, COFINS": × 1.0965.
//   Outros Bovespa                 "cobra uma taxa operacional de 5,9%
//                                  sobre o valor da corretagem,
//                                  emolumentos e taxa de liquidação": on
//                                  the brokerage and on B3's negociação
//                                  (0.005 %) + liquidação (0.0224 %), not
//                                  on the transfer fee.
//   Desk / adviser                 "Tabela Bovespa", minimum R$100 (lote
//                                  padrão) / R$20 (fracionário). Not online.
//   Custody                        none printed for shares.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs). A BDR or an ETF is one order.
//
// Formula, each side: R$4.90 × orders × 1.0965 + 5.9 % × (R$4.90 ×
// orders + 0.0274 % of the amount), + 2 × B3 + the book. Same day: R$2.90
// an order and B3's day-trade rate (negociação 0.005 % + liquidação
// 0.018 %). Left out: the IRRF advance. The account is funded in reais.
//
//   node brokers/montebravo/montebravo_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/montebravo/montebravo_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, withTaxes, real, NEGOTIATION, CCP, DAY_TRADE } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.montebravo.com.br/wp-content/uploads/2026/09/Custos_Monte_Bravo.pdf";
const SWING = 4.9;
const DAY = 2.9;
const OPERATIONAL = 0.059;

export const roundTrip = makeB3Cost({
  folder: "montebravo",
  name: "Monte Bravo",
  catalogue: new URL("montebravo-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, notional, dayTrade }) => {
    const brokerage = legs.length * (dayTrade ? DAY : SWING);
    const b3 = notional * (dayTrade ? DAY_TRADE : NEGOTIATION + CCP);
    return real(withTaxes(brokerage) + OPERATIONAL * (brokerage + b3));
  },
  basis:
    "Monte Bravo autoatendimento : actions, BDR et ETF R$ 4,90 par ordre (R$ 2,90 en day trade hors RLP), + ISS 5 %, PIS 0,65 %, COFINS 4 %, + taxe opérationnelle de 5,9 % sur le courtage, les émoluments et la liquidation.",
  confidence: "medium",
});

printB3Cli(roundTrip, import.meta.url);
