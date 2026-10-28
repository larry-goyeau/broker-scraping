// What one round trip costs at Ágora (Bradesco): buy n shares at price p
// on the Home Broker, the Ágora app or site, sell them back at once, in
// dollars. A desk order and the advanced trading platforms are other
// lines.
//
// The fee page and its Bolsa/Balcão tariff PDF, read on 2026-10-26.
//   https://www.agorainvestimentos.com.br/content/agora/home/investimentos/outros/custos-operacionais.html
//   https://www.agorainvestimentos.com.br/content/dam/banco-bradesco/agora/staticfiles/dist/pdf/taxasparanegociacaobolsabalcaov4_140725.pdf
//
//   Home Broker, app and site      "Zeramos a taxa de corretagem para
//                                  operações no mercado de ações, BDR,
//                                  ETF, FII e opções pelo app e pelo site
//                                  da Ágora." R$0 each side.
//   Advanced platforms             "R$ 4,50 para ordens Swing trade e
//                                  R$ 2,50 para Day trade". An optional
//                                  platform, not the default ticket.
//   Trading desk                   "0,5% sobre o volume operado no dia +
//                                  valor fixo de R$ 25,21". Not online.
//   Taxes                          ISS, PIS and COFINS, 9.65 % on the
//                                  brokerage: nothing on zero.
//   Custody                        "Isenção de taxa de custódia sobre
//                                  ações". The B3 custody passed on
//                                  concerns gold and Tesouro: not this.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Formula: 2 × B3 (0.030 % of the amount, to the centavo) + the book.
// Left out: the IRRF advance. The account is funded in reais.
//
//   node brokers/agorabr/agorabr_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07

import { makeB3Cost, printB3Cli } from "../nubank/b3Cost.mjs";

const PAGE =
  "https://www.agorainvestimentos.com.br/content/agora/home/investimentos/outros/custos-operacionais.html";

export const roundTrip = makeB3Cost({
  folder: "agorabr",
  name: "Ágora",
  catalogue: new URL("agorabr-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: () => 0,
  basis: "Ágora : courtage zéro sur actions, BDR et ETF via le Home Broker, l'app et le site (« Zeramos a taxa de corretagem »), garde des actions exonérée.",
});

printB3Cli(roundTrip, import.meta.url);
