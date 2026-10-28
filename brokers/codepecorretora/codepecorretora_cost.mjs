// What one round trip costs at Codepe Corretora: buy n shares at price p
// on the Home Broker, sell them back at once, in dollars.
//
// The fee page, read on 2026-10-26.
//   https://www.codepe.com.br/custos-operacionais
//
//   Corretagem, "Mesa de           "Volume operado de R$ 0,00 até
//   Operações e Home Broker B3     R$ 135,07 = 0,00% + R$ 2,70" ... "a
//   (Segmento Bovespa)"            partir de R$ 3.029,39 = 0,50% +
//                                  R$ 25,21": the Bovespa table, whole.
//                                  "descontos poderão ser aplicados
//                                  previamente com o cliente": a
//                                  negotiated discount, not a price, so
//                                  the full table. The band is read on
//                                  the volume of the side (the round lot
//                                  and the odd lot together), not per
//                                  order. No day-trade brokerage line.
//   Taxes                          "+ISS - Alíquota de 5% cobrada no valor
//                                  da corretagem": × 1.05.
//   Custody                        "R$ 10,00 por mês + percentuais"
//                                  but "Investidores com posições até
//                                  R$ 300 mil são isentos": not this size.
//   Home broker access             "O acesso ao home broker não é cobrado."
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Formula: Bovespa table on the side's volume × 1.05, each side, + 2 × B3
// + the book. Left out: the IRRF advance. The account is funded in reais.
//
//   node brokers/codepecorretora/codepecorretora_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/codepecorretora/codepecorretora_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, bovespaTable, withTaxes } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.codepe.com.br/custos-operacionais";
const ISS = 0.05;

export const roundTrip = makeB3Cost({
  folder: "codepecorretora",
  name: "Codepe",
  catalogue: new URL("codepecorretora-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ notional }) => withTaxes(bovespaTable(notional), ISS),
  basis:
    "Codepe Home Broker : table Bovespa pleine sur le volume de l'ordre (R$ 2,70 jusqu'à R$ 135,07, puis 2 % / 1,5 % + R$ 2,49 / 1 % + R$ 10,06 / 0,5 % + R$ 25,21), + ISS 5 %.",
});

printB3Cli(roundTrip, import.meta.url);
