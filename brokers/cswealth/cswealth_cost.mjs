// What one round trip costs at CS Wealth Securities (中策富滙證券): buy n
// shares at price p, sell them back, in dollars. App order ("APP
// dealing"); e-mail and phone dealing, the over-the-counter products,
// IPOs and margin stay out.
//
// "Service Fees and Transaction Charges", effective 15/9/2026, read on
// 2026-10-26:
//   https://www.cswsec.com.hk/wp-content/uploads/2026/09/Service-Fee服務收費-Revised-Sep-2026.pdf
//   Hong Kong stocks, each side
//     commission "APP dealing: 0.08% of transaction amount, minimum HK$ 50"
//       (a USD counter takes 50 HKD at the fx table)
//     CCASS fee "0.0042% of transaction amount, minimum HK$ 3"
//     stamp 0.1 % rounded up to the next dollar; transaction levy 0.00285 %
//       (SFC 0.0027 % and AFRC 0.00015 %); trading fee 0.00565 %
//     Custody is waived.
//   United States, each side
//     commission "APP dealing: higher of 0.08% of transaction amount or
//       US$0.01 per share, minimum US$ 10"
//     settlement fee waived
//     clearing fee "US$0.003 per share. Minimum US$0.50"
//     SEC fee "0.00206% of transaction amount": the SEC's Section 31 fee
//       is on sales only, so it is priced on the sale
//     TAF "0.000195 per share (for SALE trade ONLY)", no minimum or
//       maximum printed
//     No CAT line is printed (0).
//
// Cash: HKD and USD only (deposits.mjs). An RMB counter needs a conversion
// at a rate the firm does not print ("Currency Exchange is USD to HKD or
// HKD to USD" in the app guide: no RMB at all), so its total is unknown.
// No US broker-dealer is named: the US book is the quoted NBBO.
//
//   node brokers/cswealth/cswealth_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/cswealth/cswealth_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/cswealth/cswealth_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/cswealth/cswealth_cost.mjs AAPL XNAS USD --shares=2000 --price=5
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, usRegulatory, cents } from "../bocomhk/hkMarketsCost.mjs";

const FEES = "https://www.cswsec.com.hk/wp-content/uploads/2026/09/Service-Fee服務收費-Revised-Sep-2026.pdf";

const SCHEDULE = {
  broker: "CS Wealth Securities",
  folder: "cswealth",
  catalogueUrl: new URL("cswealth-parsed.json", import.meta.url),
  readOn: "2026-10-26",
  url: FEES,
  pages: { HK: FEES, US: FEES },
  channel: "ordre par l'appli",
  basis: {
    HK: "courtage 0,08 %, plancher 50 HKD ; CCASS 0,0042 %, plancher 3 HKD ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT. Chaque sens",
    US: "le plus élevé de 0,08 % et 0,01 USD l'action, plancher 10 USD ; compensation 0,003 USD l'action, plancher 0,50 USD, à chaque sens ; SEC 0,00206 % et TAF 0,000195 USD l'action à la vente ; pas de ligne CAT",
  },
  usBook: "aucun courtier américain nommé, NBBO coté",
  markets: {
    HK(ctx) {
      const min = ctx.hkd(50);
      const ccassMin = ctx.hkd(3);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free });
      if (min == null || ccassMin == null || side == null) return null;
      const ccass = rateLine(ctx.notional, { rate: 0.000042, min: ccassMin });
      return {
        broker: rateLine(ctx.notional, { rate: 0.0008, min }) * 2,
        levy: (side.levies + ccass) * 2,
        tax: side.stamp * 2,
      };
    },
    US(ctx) {
      const commission = Math.max(10, cents(ctx.notional * 0.0008), cents(ctx.n * 0.01));
      const levy = usRegulatory(ctx.n, ctx.notional, {
        settle: { perShare: 0.003, min: 0.5 },
        sec: { rate: 0.0000206 },
        taf: { perShare: 0.000195 },
      });
      return { broker: commission * 2, levy };
    },
  },
};

export function roundTrip(query) {
  return marketsRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
