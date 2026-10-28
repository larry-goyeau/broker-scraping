// What one round trip costs at PicPay: buy n shares at price p in the
// app, sell them back at once, in dollars.
//
// The cost article, read on 2026-10-26.
//   https://meajuda.picpay.com/hc/pt-br/articles/52896249054739
//
//   The costs                      "Ao investir em renda variável no
//                                  PicPay, você pode pagar taxas da B3,
//                                  Imposto de Renda sobre o lucro e taxas
//                                  próprias de ETFs e FIIs." No brokerage
//                                  in that list: R$0 each side, so no
//                                  PIS/COFINS/ISS either.
//   B3                             "incluem emolumentos, clearing e
//                                  liquidação": 0.030 % a side, from
//                                  ../nubank/b3Cost.mjs.
//   ETF fees                       "já estão incluídos no preço do ativo".
//                                  Not this order.
// Only the cash market: "O PicPay só permite operações no 'mercado à
// vista'". No custody fee is listed.
//
// Formula: 2 × B3 (0.030 % of the amount, to the centavo) + the book.
// Left out: income tax and the IRRF advance. The account is funded in
// reais.
//
//   node brokers/picpay/picpay_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/picpay/picpay_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli } from "../nubank/b3Cost.mjs";

const PAGE = "https://meajuda.picpay.com/hc/pt-br/articles/52896249054739";

export const roundTrip = makeB3Cost({
  folder: "picpay",
  name: "PicPay",
  catalogue: new URL("picpay-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: () => 0,
  basis:
    "PicPay : les coûts listés sont « taxas da B3, Imposto de Renda sobre o lucro e taxas próprias de ETFs e FIIs », aucun courtage.",
  confidence: "moyenne : courtage nul déduit de la liste des coûts, sans grille chiffrée",
});

printB3Cli(roundTrip, import.meta.url);
