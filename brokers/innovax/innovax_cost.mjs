// What one round trip costs at Innovax Securities (創升證券), now Austrax
// Securities (南強證券): buy n shares at price p, sell them back, in
// dollars. Electronic-channel order. Forced liquidation, the IPO grey
// market, margin and IPOs stay out.
//
// Fee schedule (收费标准), read on 2026-10-26:
//   https://www.austrax.com/customer-service/fee-schedule/
//   Hong Kong Stock Trading Fee Schedule (effective 25 September 2026),
//   https://www.austrax.com/images/service/fee-schedule/hk1.png, each side
//     commission 0.25 %, minimum HK$100 (a USD counter takes 100 HKD at the
//       fx table)
//     CCASS fee 0.010 %, minimum HK$2
//     SFC 0.0027 %, AFRC 0.00015 %, SEHK trading fee 0.00565 %; stamp
//       0.1 % rounded up to the nearest dollar, none on an ETF
//     The custody fee (HK$0.15 a lot, charged each half-year) is a holding
//     fee and stays out.
//   US Stock Trading Fee Schedule (effective 2 April 2026),
//   https://www.austrax.com/images/service/fee-schedule/us1.png, each side
//     "Commission Fee (Electronic Channels) US$0.0068 per share", minimum US$2
//     "Trading Platform Fee (Electronic Channels) US$0.006 per share",
//       minimum US$1.5
//     clearing fee US$0.003 per share, minimum US$0.5
//     CAT "US Stock & US Fractional Shares : US$0.000024 per share",
//       "US Stock (OTC) : US$0.00000026 per share", minimum US$0.01
//     SEC "Transaction Fee (Sell Only)" 0.00206 %; TAF "US$0.000195 per
//       share" on sales, minimum US$0.01 (no maximum printed)
//     The same lines price the OTC Markets rows (the schedule names "US
//     Stock (OTC)" and no other OTC tariff). The 10 % withholding on the
//     sale of a publicly traded partnership is a tax withheld, not a fee,
//     and is not in the total.
//
// Cash: HKD and USD only (deposits.mjs, "存入货币 港元 / 美元"). An RMB
// counter needs a conversion at a rate the firm does not print, so its
// total is unknown. No US broker-dealer is named: a listed line's book is
// the quoted NBBO, an OTC line's the OTC Markets touch.
//
//   node brokers/innovax/innovax_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/innovax/innovax_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/innovax/innovax_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/innovax/innovax_cost.mjs NSRGY OTCM USD --shares=20 --price=100
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, usRegulatory, cents } from "../bocomhk/hkMarketsCost.mjs";

const PAGE = "https://www.austrax.com/customer-service/fee-schedule/";
const PAGES = {
  HK: "https://www.austrax.com/images/service/fee-schedule/hk1.png",
  US: "https://www.austrax.com/images/service/fee-schedule/us1.png",
  OTC: "https://www.austrax.com/images/service/fee-schedule/us1.png",
};

function usTrip(ctx, catPerShare) {
  const side = Math.max(2, cents(ctx.n * 0.0068)) + Math.max(1.5, cents(ctx.n * 0.006));
  const levy = usRegulatory(ctx.n, ctx.notional, {
    settle: { perShare: 0.003, min: 0.5 },
    cat: { perShare: catPerShare, min: 0.01 },
    sec: { rate: 0.0000206 },
    taf: { perShare: 0.000195, min: 0.01 },
  });
  return { broker: side * 2, levy };
}

const US_BASIS =
  "0,0068 USD l'action (plancher 2 USD) et plateforme 0,006 USD l'action (plancher 1,50 USD) ; compensation 0,003 USD l'action (plancher 0,50 USD) à chaque sens";

const SCHEDULE = {
  broker: "Innovax (Austrax) Securities",
  folder: "innovax",
  catalogueUrl: new URL("innovax-parsed.json", import.meta.url),
  readOn: "2026-10-26",
  url: PAGE,
  pages: PAGES,
  channel: "ordre électronique",
  basis: {
    HK: "courtage 0,25 %, plancher 100 HKD ; CCASS 0,010 %, plancher 2 HKD ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT. Chaque sens",
    US: `${US_BASIS} ; CAT 0,000024 USD l'action à chaque sens ; SEC 0,00206 % et TAF 0,000195 USD l'action à la vente`,
    OTC: `${US_BASIS} ; CAT OTC 0,00000026 USD l'action (plancher 0,01 USD) à chaque sens ; SEC 0,00206 % et TAF 0,000195 USD l'action à la vente`,
  },
  usBook: "aucun courtier américain nommé, NBBO coté",
  markets: {
    HK(ctx) {
      const min = ctx.hkd(100);
      const ccassMin = ctx.hkd(2);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free });
      if (min == null || ccassMin == null || side == null) return null;
      const ccass = rateLine(ctx.notional, { rate: 0.0001, min: ccassMin });
      return {
        broker: rateLine(ctx.notional, { rate: 0.0025, min }) * 2,
        levy: (side.levies + ccass) * 2,
        tax: side.stamp * 2,
      };
    },
    US: (ctx) => usTrip(ctx, 0.000024),
    OTC: (ctx) => usTrip(ctx, 0.00000026),
  },
};

export function roundTrip(query) {
  return marketsRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
