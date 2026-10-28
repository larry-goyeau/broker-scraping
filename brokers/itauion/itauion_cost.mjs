// What one round trip costs at Itaú íon: buy n shares at price p in the
// íon app or Itaú Corretora's digital channels, sell them back at once,
// in dollars. A phone or desk order (Mesa Assessoria, Mesa Private) is
// another line.
//
// The fee page, read on 2026-10-26 (meu.itau/custosoperacionais redirects
// to an itau.com.br page that refuses scripts; the Itaú Corretora copy is
// public).
//   https://www.itaucorretora.com.br/explore/custosoperacionais.aspx
//
//   Ações, opções, ETFs e BDRs     "Taxa zero de corretagem",
//                                  "exclusivamente via canais digitais da
//                                  Itaú Corretora e app íon Itaú", for
//                                  Agências, Uniclass, Personnalité,
//                                  Itaú Corretora and Private clients.
//                                  R$0 each side. No day-trade line.
//   Custody                        "Taxa zero de custódia" (Private
//                                  clients excepted: not this account).
//   ISS                            5 % on the brokerage: nothing on zero.
//   Desk and phone                 the Bovespa table per day. Not online.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Formula: 2 × B3 (0.030 % of the amount, to the centavo) + the book.
// Left out: the IRRF advance. The account is funded in reais.
//
//   node brokers/itauion/itauion_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07

import { makeB3Cost, printB3Cli } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.itaucorretora.com.br/explore/custosoperacionais.aspx";

export const roundTrip = makeB3Cost({
  folder: "itauion",
  name: "Itaú íon",
  catalogue: new URL("itauion-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: () => 0,
  basis: "Itaú íon : « Taxa zero de corretagem » sur actions, ETF et BDR via l'app íon et les canaux numériques d'Itaú Corretora, garde à zéro.",
});

printB3Cli(roundTrip, import.meta.url);
