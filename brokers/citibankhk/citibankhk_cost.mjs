// What one round trip costs at Citibank (Hong Kong): buy n shares at price
// p, sell them back, in dollars. Internet / mobile securities services, on
// the Citibanking rate (the plain account). The Dedicated Trading Hotline,
// the monthly stock plan, IPOs and the opening offers (three months of free
// purchases for new securities accounts) stay out. The "No Minimum
// Brokerage Fee Offer" ended on 31 July 2026.
//
// Stock services fees and charges leaflet (BSWMS-122023), read on
// 2026-10-26:
//   https://www.citibank.com.hk/english/investment/pdf/Stock_fees_and_charges_leaflet.pdf
//   HK securities, each side
//     brokerage, Internet / Mobile: Citibanking 0.25 %; Citigold, Citi
//       Priority, Citibanking CAW and Citi Plus 0.20 %; Citigold Private
//       Client 0.18 %; "Minimum Charge per Transaction … HKD/CNY100" (CNY on
//       an RMB counter; a USD counter takes 100 HKD at the fx table)
//     stamp 0.1 % rounded up to the nearest dollar, none on an ETF;
//       transaction levy 0.0027 %, trading fee 0.00565 %, AFRC 0.00015 %,
//       each to the nearest cent. No CCASS line.
//     The Citigold Private Client rate is the remark.
//   China Connect (Shanghai / Shenzhen), each side
//     brokerage, Internet / Mobile, every tier: 0.25 %, minimum CNY100
//     stamp 0.05 % on the sale, securities management 0.002 %, handling
//       0.00341 %, transfer 0.003 % (0.001 % ChinaClear, 0.002 % HKSCC).
//       The leaflet prints no ETF line; an ETF is priced on the exchanges'
//       ETF rates (handling 0.004 %, HKSCC 0.002 %, no CSRC, ChinaClear
//       or stamp), as at the other Stock Connect brokers.
//   US securities, each side
//     "Rate on Transaction Amount (Minimum charge USD30 per transaction)":
//       0 - 9,999 USD 1 %; 10,000 - 19,999 0.90 %; 20,000 - 49,999 0.80 %;
//       50,000 or above 0.50 %; Citigold Private Client 0.50 % (remark)
//     "US SEC Fees : Subject to SEC latest rules and charges": 0.00206 % of
//       the sale, minimum 0.01 USD. No TAF or CAT line is printed (0).
//   Custody is waived; the half-yearly account fee is for accounts with no
//   trade and no holding.
//
// Cash: HKD, USD and CNY settlement accounts (deposits.mjs): no line is
// converted. Citibank names no US broker-dealer: the US book is the quoted
// NBBO.
//
//   node brokers/citibankhk/citibankhk_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/citibankhk/citibankhk_cost.mjs 600519 SSE CNY --shares=100 --price=1500
//   node brokers/citibankhk/citibankhk_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/citibankhk/citibankhk_cost.mjs AAPL XNAS USD --shares=300 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, cnStatutory, usRegulatory, lowerRemark } from "../bocomhk/hkMarketsCost.mjs";

const FEES = "https://www.citibank.com.hk/english/investment/pdf/Stock_fees_and_charges_leaflet.pdf";
const CPC = "you are a Citigold Private Client";

// Trade-amount bands of the US table (USD), Citigold / Citi Priority /
// Citibanking / Citi Plus.
function usRate(notional) {
  if (notional < 10000) return 0.01;
  if (notional < 20000) return 0.009;
  if (notional < 50000) return 0.008;
  return 0.005;
}

function hkCommission(ctx, rate) {
  const min = ctx.ccy === "CNH" ? 100 : ctx.hkd(100);
  if (min == null) return null;
  return rateLine(ctx.notional, { rate, min });
}

const SCHEDULE = {
  broker: "Citibank (Hong Kong)",
  folder: "citibankhk",
  catalogueUrl: new URL("citibankhk-parsed.json", import.meta.url),
  readOn: "2026-10-26",
  url: FEES,
  pages: { HK: FEES, CN: FEES, US: FEES },
  channel: "ordre Internet / mobile, tarif Citibanking",
  basis: {
    HK: "courtage 0,25 %, plancher 100 HKD (100 RMB sur une ligne en RMB) ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT ; pas de ligne CCASS. Chaque sens",
    CN: "China Connect, courtage 0,25 %, plancher 100 RMB ; frais de bourse, CSRC et transfert (ETF : taux ETF des bourses) ; timbre 0,05 % à la vente",
    US: "courtage selon le montant de l'ordre (1 % jusqu'à 9 999 USD, 0,90 %, 0,80 %, 0,50 % dès 50 000 USD), plancher 30 USD, chaque sens ; SEC 0,00206 % à la vente ; pas de ligne TAF ni CAT",
  },
  usBook: "aucun courtier américain nommé, NBBO coté",
  markets: {
    HK(ctx) {
      const commission = hkCommission(ctx, 0.0025);
      const best = hkCommission(ctx, 0.0018);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free });
      if (commission == null || side == null) return null;
      return {
        broker: commission * 2,
        levy: side.levies * 2,
        tax: side.stamp * 2,
        remark: lowerRemark((commission - best) * 2, commission * 2, CPC),
      };
    },
    CN(ctx) {
      return { broker: rateLine(ctx.notional, { rate: 0.0025, min: 100 }) * 2, ...cnStatutory(ctx.notional, ctx.fund) };
    },
    US(ctx) {
      const commission = rateLine(ctx.notional, { rate: usRate(ctx.notional), min: 30 });
      const best = rateLine(ctx.notional, { rate: 0.005, min: 30 });
      const levy = usRegulatory(ctx.n, ctx.notional, { sec: { rate: 0.0000206, min: 0.01 } });
      return {
        broker: commission * 2,
        levy,
        remark: lowerRemark((commission - best) * 2, commission * 2, CPC),
      };
    },
  },
};

export function roundTrip(query) {
  return marketsRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
