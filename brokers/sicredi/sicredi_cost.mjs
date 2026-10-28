// What one round trip costs at Sicredi: buy n shares at price p through
// the Sicredi Home Broker, sell them back at once, in dollars. A desk
// order ("com o apoio de um especialista") is another line.
//
// The fee pages, read on 2026-10-26.
//   https://www.sicredi.com.br/site/investimentos/renda-variavel/acoes/
//   https://www.sicredi.com.br/site/investimentos/renda-variavel/
//   https://www.sicredi.com.br/site/investimentos/renda-variavel/etf-exchange-traded-funds/
//
//   Home Broker                    "Ações: R$ 2,20 | BDRs (Brazilian
//                                  Depositary Receipts): R$ 2,20 | ETF
//                                  (Exchange Traded Funds): sem custo";
//                                  "taxa de corretagem de R$ 2,20 para
//                                  ações e BDRs e taxa zero para ETFs".
//                                  Per operation, read as per order. No
//                                  day-trade line: the same fee.
//                                  A BDR of a foreign ETF or ETP is both
//                                  a BDR and an ETF; the higher, R$2.20,
//                                  is taken. A Brazilian ETF is R$0.
//   Taxes                          the pages add nothing on top.
//   Desk                           "0,5% do valor transacionado (por
//                                  operação) + R$ 25,21 (ao dia)". Not an
//                                  online order.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book (ticker + F) as its own order, so 106.6 PETR4 are two
// orders a side (splitLegs). A BDR or an ETF is one order.
//
// Formula: R$2.20 × orders, each side (R$0 on a Brazilian ETF), + 2 × B3
// + the book. Left out: the IRRF advance. The account is funded in reais.
//
//   node brokers/sicredi/sicredi_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/sicredi/sicredi_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.sicredi.com.br/site/investimentos/renda-variavel/acoes/";
const PER_ORDER = 2.2;

const isBdr = (row) => String(row?.isin || "").toUpperCase().slice(6, 9) === "BDR";
const charged = (row) => isBdr(row) || String(row?.type || "").toUpperCase() === "STOCK";

export const roundTrip = makeB3Cost({
  folder: "sicredi",
  name: "Sicredi",
  catalogue: new URL("sicredi-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, row }) => (charged(row) ? perOrder(legs, () => PER_ORDER) : 0),
  basis:
    "Sicredi Home Broker : R$ 2,20 par ordre sur actions et BDR (BDR d'ETF compris, tarif le plus haut), ETF brésiliens sans courtage ; un ordre par lot rond et un pour le lot fractionnaire.",
});

printB3Cli(roundTrip, import.meta.url);
