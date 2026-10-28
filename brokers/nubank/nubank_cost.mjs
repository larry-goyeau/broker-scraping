// What one round trip costs at Nubank (NuInvest): buy n shares at price p
// in the app, sell them back at once, in dollars. The order in the app.
// A trading-desk order is another line.
//
// The fee page, read on 2026-10-26.
//   https://nubank.com.br/sobre-investimentos/taxas-e-precos
//
//   Brokerage, shares and BDRs     "O Nubank não cobra taxa de serviço
//                                  para investimentos em Ações" (and the
//                                  same for BDR). ETFs trade on the same
//                                  Bolsa ticket; the scraper's Bolsa page
//                                  gives "corretagem ZERO em ... Renda
//                                  Variável" in the app. R$0 each side.
//   Custody                        "não cobra taxa de manutenção de conta
//                                  ou qualquer taxa de custódia".
//   Trading desk                   "0,5% sobre o volume negociado mais
//                                  R$ 25,21, com valor mínimo de R$ 50,00"
//                                  for orders outside the NuInvest
//                                  platform. Not an online order.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Formula: 2 × B3 (0.030 % of the amount, to the centavo) + the book.
// No brokerage, so no PIS/COFINS/ISS. Left out: the R$50 share-transfer
// (OTA) fee and the IRRF advance. The account is funded in reais.
//
//   node brokers/nubank/nubank_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07

import { makeB3Cost, printB3Cli } from "./b3Cost.mjs";

const PAGE = "https://nubank.com.br/sobre-investimentos/taxas-e-precos";

export const roundTrip = makeB3Cost({
  folder: "nubank",
  name: "Nubank",
  catalogue: new URL("nubank-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: () => 0,
  basis: "Nubank : courtage zéro dans l'app sur actions, BDR et ETF (« não cobra taxa de serviço »), sans droits de garde.",
});

printB3Cli(roundTrip, import.meta.url);
