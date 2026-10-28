// What one round trip costs at Inter Invest: buy n shares at price p in the
// Inter app, sell them back at once, in dollars. B3 lines through Inter
// DTVM, in reais; US lines and the LSE's dollar UCITS ETF lines through
// Inter Securities LLC (FINRA, CRD 317278; clearing by DriveWealth and
// Pershing), the Conta Global de Investimentos. Desk orders are other lines.
//
// Read on 2026-10-26.
//   https://static.bancointer.com.br/idtvm/home/files/b901066a474a448f8c680040460a955c_politica-de-corretagem-inter-dtvm.pdf
//     "Custos Operacionais e Corretagem na Inter DTVM", v1.7 of 06/05/2026:
//     "Valores das operações com ações — Operações via Home Broker e demais
//     plataformas: Custo zero". The Bovespa-type scale beside it (R$2.70 up
//     to R$135.05 ... 0.50 % + R$25.21) and the R$50 minimum are the desk,
//     compulsory close-out and unit cancellation: not an online order. No
//     operating fee on top is printed.
//   B3: 0.030 % a side (../nubank/b3Cost.mjs).
//
//   https://static.bancointer.com.br/site/inter-co-securities/1fc1cfd3beea49c1b21df0ff92e3f055_resumo-do-relacionamento-com-o-cliente-crs.pdf
//     Inter Securities CRS (effective June 2026): "A Inter Securities não
//     cobra comissões pela execução de ordens de compra e venda de ações e
//     ETFs", with commission, markup or mark-down only on "fundos mútuos /
//     títulos / ordens de renda fixa". The same document lists "determinados
//     produtos de investimento emitidos fora dos Estados Unidos, como ETFs
//     UCITS" among what the platform executes. No SEC, TAF or CAT line is
//     printed: 0.
//
//   https://ajuda.inter.co/investimentos/qual-a-taxa-de-negociacao-de-ucits
//     UCITS ETFs: "A taxa mínima é de $ 2 (dois dólares) ou 0,2%* do valor
//     total da ordem. *Atualizado em 13/08/2026": 0.2 % of the order, at
//     least $2, a side.
//
// The Conta Global holds dollars (deposits.mjs: BRL, USD), so a US or LSE
// dollar line pays no FX in the total; reais in pay the câmbio, a remark.
//   https://blog.inter.co/como-investir-em-dolar-pagando-menos-iof-passo-a-passo/
//     (Inter, published 01/07/2026, read 2026-10-26): buying dollars
//     "diretamente pela Plataforma Global de Investimentos do Inter ... a
//     operação é classificada como investimento e tem alíquota de apenas
//     1,1%, inferior aos 3,5% cobrados em outras operações de câmbio".
//   https://ajuda.inter.co/cambio/qual-e-a-cotacao-cambial-oferecida-pelo-inter
//     The spread on that conversion is not printed: "adotamos uma cotação
//     comercial e ela varia ao longo do dia ... O cálculo é realizado no
//     momento da operação". The Global Account figures ("spread varia entre
//     0,99% e 1,5%"; "taxa de serviço é de 0,75% a 1,99%" with IOF 3,5%) are
//     the banking account's route, not the investment câmbio.
// Remark: "FX + IOF 1.1% when cash ≠ USD." (IOF only; spread unpublished).
//
// Book: B3 and the LSE read their own venue's leaf. A US line uses the 606
// of Inter Securities LLC, or of DriveWealth, the clearer its app account
// sits at, once spreads/rule606.mjs maps "interbr"; until then the quoted
// NBBO.
//
// Left out: the IRRF advance on a B3 sale.
//
//   node brokers/interbr/interbr_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/interbr/interbr_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/interbr/interbr_cost.mjs CSPX XLON USD --shares=10 --price=700
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost } from "../nubank/b3Cost.mjs";
import { makeLineCost, printLineCli } from "../xpbr/lineCost.mjs";

const B3_PAGE =
  "https://static.bancointer.com.br/idtvm/home/files/b901066a474a448f8c680040460a955c_politica-de-corretagem-inter-dtvm.pdf";
const US_PAGE =
  "https://static.bancointer.com.br/site/inter-co-securities/1fc1cfd3beea49c1b21df0ff92e3f055_resumo-do-relacionamento-com-o-cliente-crs.pdf";
const READ_ON = "2026-10-26";
const CATALOGUE = new URL("interbr-parsed.json", import.meta.url);

const b3 = makeB3Cost({
  folder: "interbr",
  name: "Inter",
  catalogue: CATALOGUE,
  url: B3_PAGE,
  readOn: READ_ON,
  brokerage: () => 0,
  basis: "Inter DTVM : « Operações via Home Broker e demais plataformas: Custo zero » pour les actions, BDR et ETF, aucune taxe opérationnelle imprimée.",
});

const UCITS_PAGE = "https://ajuda.inter.co/investimentos/qual-a-taxa-de-negociacao-de-ucits";
const UCITS = { rate: 0.002, min: 2 };
const fr = (x) => String(x).replace(".", ",");
// IOF on reais bought in the investment platform; the spread is not printed.
const FX_REMARK = "FX + IOF 1.1% when cash ≠ USD.";

export const roundTrip = makeLineCost({
  folder: "interbr",
  name: "Inter",
  catalogue: CATALOGUE,
  url: US_PAGE,
  price: ({ us, listing, notional }) => {
    if (listing.mic === "XLON") {
      const each = Math.max(UCITS.min, notional * UCITS.rate);
      return {
        buy: each,
        sell: each,
        feeCurrency: "USD",
        fxRemark: FX_REMARK,
        url: UCITS_PAGE,
        basis: `Inter, « Qual a taxa de negociação de UCITS? » relu le ${READ_ON} : « A taxa mínima é de $ 2 (dois dólares) ou 0,2% do valor total da ordem » (mis à jour le 13/08/2026), par ordre ; ligne LSE en dollars`,
        confidence: each === UCITS.min ? "minimum de 2 $ par ordre" : `0,2 % de ${fr(notional.toFixed(2))} $`,
        detail: UCITS,
      };
    }
    if (us) {
      return {
        buy: 0,
        sell: 0,
        feeCurrency: "USD",
        fxRemark: FX_REMARK,
        url: US_PAGE,
        basis:
          `Inter Securities, CRS relu le ${READ_ON} : « não cobra comissões pela execução de ordens de compra e venda de ações e ETFs » ; ` +
          "SEC, TAF et CAT non imprimés, comptés 0",
        confidence: "",
      };
    }
    return { buy: null, sell: null, why: `Inter ne publie aucun tarif pour ${listing.exchange}` };
  },
  delegate: (row) => (row.mic === "BVMF" ? b3 : null),
});

printLineCli(roundTrip, import.meta.url);
