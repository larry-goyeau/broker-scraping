// What one round trip costs at CCB International Securities (建銀國際證券):
// buy n shares at price p, sell them back, in dollars. The fee tables
// print one commission line per market and no channel split, so that line
// is the online (iWTrader / app) order. Margin, IPOs and odd-lot handling
// stay out.
//
// Fee tables (收費表), read on 2026-10-26:
//   Hong Kong   https://www.ccbintl.com.hk/Big5/securities6.html
//     commission "0.25%，最低收費$100" (HKD; a USD or RMB counter takes
//       100 HKD at the fx table), each side
//     stamp 0.1 % ("不足一元亦作一元計"), SFC 0.0027 %, HKEX 0.00565 %,
//       AFRC 0.00015 %; "中央結算費 免費"
//   Stock Connect (中港通)   https://www.ccbintl.com.hk/Big5/securities7.html
//     commission "交易總額之0.25%，最低收費 ¥100", each side
//     stock: stamp 0.05 % on the sale, handling 0.00341 %, CSRC 0.002 %,
//       transfer 0.003 %; ETF ("交易所買賣基金"): handling 0.004 %, transfer
//       0.002 %, no stamp or CSRC
//     The portfolio fee (0.008 % a year) is a negligible holding fee and
//     stays out.
//   United States (美股)   https://www.ccbintl.com.hk/Big5/securities8.html
//     commission "每股0.018美元 (最低收費10美元)", each side
//     No SEC, TAF or CAT figure is printed ("代付費用及第三方費用將分別按成本
//     收取"): 0, as in the other files. Custody is waived.
//
// Cash: HKD, USD and RMB settlement accounts (deposits.mjs): no line is
// converted. CCBI names no US broker-dealer: the US book is the quoted NBBO.
//
//   node brokers/ccbi/ccbi_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/ccbi/ccbi_cost.mjs 600519 SSE CNY --shares=100 --price=1500
//   node brokers/ccbi/ccbi_cost.mjs SPY ARCX USD --shares=10 --price=600
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, cnStatutory, cents } from "../bocomhk/hkMarketsCost.mjs";

const PAGES = {
  HK: "https://www.ccbintl.com.hk/Big5/securities6.html",
  CN: "https://www.ccbintl.com.hk/Big5/securities7.html",
  US: "https://www.ccbintl.com.hk/Big5/securities8.html",
};

// FX: CCBI prints no conversion rate; its group bank and settlement bank,
// China Construction Bank (Asia), publishes a TT board that stands in
// (owner, 2026-10-26): USD 7.8239 / 7.8671 (half-spread 0.28 %), RMB
// 1.1708 / 1.1815 (0.45 %), read 2026-10-26.
//   https://www.asia.ccb.com/hongkong_tc/personal/accounts/exchange_rate_enquiry.html
const SCHEDULE = {
  fxPct: { USD: "0.28", CNH: "0.45" },
  broker: "CCB International",
  folder: "ccbi",
  catalogueUrl: new URL("ccbi-parsed.json", import.meta.url),
  readOn: "2026-10-26",
  url: PAGES.HK,
  pages: PAGES,
  channel: "ordre en ligne (iWTrader, appli)",
  basis: {
    HK: "courtage 0,25 %, plancher 100 HKD ; frais CCASS gratuits ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT. Chaque sens",
    CN: "Stock Connect, courtage 0,25 %, plancher 100 RMB ; frais de bourse, CSRC et transfert (ETF : bourse et transfert) ; timbre 0,05 % à la vente",
    US: "0,018 USD l'action, plancher 10 USD, chaque sens ; SEC, TAF et CAT non chiffrés par le barème (0)",
  },
  usBook: "aucun courtier américain nommé, NBBO coté",
  markets: {
    HK(ctx) {
      const min = ctx.hkd(100);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free });
      if (min == null || side == null) return null;
      return { broker: rateLine(ctx.notional, { rate: 0.0025, min }) * 2, levy: side.levies * 2, tax: side.stamp * 2 };
    },
    CN(ctx) {
      return { broker: rateLine(ctx.notional, { rate: 0.0025, min: 100 }) * 2, ...cnStatutory(ctx.notional, ctx.fund) };
    },
    US(ctx) {
      return { broker: Math.max(10, cents(ctx.n * 0.018)) * 2, levy: 0 };
    },
  },
};

export function roundTrip(query) {
  return marketsRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
