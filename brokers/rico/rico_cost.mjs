// What one round trip costs at Rico (a brand of XP Investimentos CCTVM):
// buy n shares at price p on Rico's digital platforms, sell them back at
// once, in dollars. B3 lines in reais; US lines and the LSE's dollar UCITS
// ETF lines in the Conta Investimento Global, held at XP Investments US,
// LLC ("XP International"). Orders through the service channels are other
// lines.
//
// The cost page, read on 2026-10-26 (the newest Wayback copy; the live page
// answers scripts with 403):
//   https://www.rico.com.vc/custos/
//
// B3, "Mercado de ações": "A corretagem zero é válida apenas para ordens
// executadas pelo próprio cliente nas nossas plataformas digitais": Day
// Trade and Swing Trade, padrão and fracionário, R$ 0,00; "Fundos
// imobiliários, BDRs e ETFs R$ 0,00". Then "Outros Bovespa ... a RICO
// cobra uma taxa operacional de 5,9% sobre o valor da corretagem,
// emolumentos e taxa de liquidação": with no brokerage, 5.9 % of B3's
// negociação (0.005 %) + liquidação (0.0224 %), each side; on the same day
// of the day-trade negociação + liquidação (0.023 %). "Taxa de custódia da
// Rico R$ 0,00". B3 itself: 0.030 % a side (../nubank/b3Cost.mjs).
//
// Conta Investimento Global (../xpbr/xpGlobal.mjs, the table XP prints
// too): US shares, ETFs, REITs and ADRs U$1.00 up to $100, U$1.50 up to
// $1,000, U$4.30 up to $2,000, U$8.60 above, per order; "UCITs Operações
// de compra e venda 0,25% com mínimo de U$ 5,00". No SEC, TAF or CAT line:
// 0. "A partir de setembro/2026, você pode contar com até 2 operações por
// mês com taxa de corretagem zero ... nas Bolsas dos Estados Unidos ... em
// operações de até US$ 1.000 cada": the remark on the US lines. The global
// account holds dollars (deposits.mjs: BRL, USD), so no FX in the total;
// the remark gives the spread (2.25 % at the top of the scale) and the IOF:
// "FX 2.25% + IOF 1.1% when cash ≠ USD."
//
// Book: B3 and the LSE read their own venue's leaf. A US line uses the 606
// of XP Investments US, LLC (CRD 156691) once spreads/rule606.mjs maps
// "rico" to it; until then the quoted NBBO.
//
//   node brokers/rico/rico_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/rico/rico_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/rico/rico_cost.mjs CSPX XLON USD --shares=10 --price=700
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost, real, NEGOTIATION, CCP, DAY_TRADE } from "../nubank/b3Cost.mjs";
import { makeLineCost, printLineCli } from "../xpbr/lineCost.mjs";
import { xpGlobalPrice } from "../xpbr/xpGlobal.mjs";

const PAGE = "https://www.rico.com.vc/custos/";
const CATALOGUE = new URL("rico-parsed.json", import.meta.url);
const OPERATIONAL = 0.059;

const b3 = makeB3Cost({
  folder: "rico",
  name: "Rico",
  catalogue: CATALOGUE,
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ notional, dayTrade }) => real(OPERATIONAL * notional * (dayTrade ? DAY_TRADE : NEGOTIATION + CCP)),
  basis:
    "Rico : courtage zéro sur les plateformes numériques (actions, BDR, ETF), + taxe opérationnelle de 5,9 % sur les émoluments et la liquidation B3 (« Outros Bovespa »), sans droits de garde.",
});

export const roundTrip = makeLineCost({
  folder: "rico",
  name: "Rico",
  catalogue: CATALOGUE,
  url: PAGE,
  price: xpGlobalPrice({ brand: "Rico", usRemark: "2 US trades a month up to $1,000 are free." }),
  delegate: (row) => (row.mic === "BVMF" ? b3 : null),
});

printLineCli(roundTrip, import.meta.url);
