// What one round trip costs at PagBank: buy n shares at price p on the
// digital platform (app), sell them back at once, in dollars. An order
// through "Atendimento PAG" is another line.
//
// The fee page, read on 2026-10-26.
//   https://pagbank.com.br/conta-digital/investimentos/custos-operacionais
//
//   Bovespa (Ações, ETF, BDR e FIIs), Plataforma Digital:
//                                  "De 0 a 4 ordens por mês: custo zero |
//                                  Acima de 5 ordens por mês: R$2,99 por
//                                  ordem (swingtrade) e R$1,99 por ordem
//                                  (daytrade)."
//   ISS                            "varia de 2% a 5% de acordo com a
//                                  cidade", on the brokerage: the max,
//                                  5 % (owner rule). R$3.14 / R$2.09.
//   Custody                        PagBank and B3 custody "Zero".
//   Atendimento PAG                "0,5% sobre o volume negociado, com
//                                  valor mínimo de R$40,00". Not online.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// The row is the free tier: the first four orders of the month cost R$0,
// each side. Past four orders a month every order costs R$3.14 (R$2.09
// when sold the same day); the remark gives that gap at this size, one
// order per round lot and one for the odd lot (splitLegs).
//
// Formula: 2 × B3 (0.030 % of the amount, to the centavo) + the book.
// Left out: the IRRF advance. The account is funded in reais.
//
//   node brokers/pagbank/pagbank_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07

import { makeB3Cost, printB3Cli, withTaxes } from "../nubank/b3Cost.mjs";

const PAGE = "https://pagbank.com.br/conta-digital/investimentos/custos-operacionais";
const ISS = 0.05;
const SWING = withTaxes(2.99, ISS); // R$3.14

export const roundTrip = makeB3Cost({
  folder: "pagbank",
  name: "PagBank",
  catalogue: new URL("pagbank-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: () => 0,
  basis:
    "PagBank, plateforme numérique : courtage zéro de 0 à 4 ordres par mois, puis R$ 2,99 par ordre (R$ 1,99 en day trade) + ISS jusqu'à 5 %.",
  remark: ({ legs, notional }) => {
    const gap = Number(((100 * 2 * legs.length * SWING) / notional).toFixed(2));
    return gap ? `Above 4 orders a month: fees are ${gap}% higher.` : "";
  },
});

printB3Cli(roundTrip, import.meta.url);
