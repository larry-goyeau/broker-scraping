// What one round trip costs at Central China International (中州國際,
// Hong Kong): buy n shares at price p, sell them back, in dollars. Online /
// app order. Phone orders, the IPO grey market, futures, margin and IPOs
// stay out.
//
// Fee page (收費標準), read on 2026-10-26:
//   https://www.ccnew.com.hk/tc/brokerage/fee
// The page prints its commissions as starting rates ("起"); that starting
// rate is the only figure published and is the one priced.
//   Hong Kong, each side
//     commission "網絡/手機應用程序：交易金額之0.1%起", "最低收費：港幣30元起/等值
//       其他貨幣(適用於其他貨幣計價證券)"
//     stamp 0.1 % ("不足港幣1元作港幣1元計(雙邊)"), SFC 0.0027 %, HKEX
//       0.00565 %, CCASS "交易金額之0.0042% (雙邊)" (no minimum printed),
//       AFRC 0.00015 %
//   Stock Connect (滬股通 / 深股通), each side
//     commission "成交金額之0.2%起(最低收費人民幣80元)"
//     handling 0.00341 %, CSRC 0.002 %, transfer 0.001 % (ChinaClear) and
//       0.002 % (HKSCC), stamp 0.05 % on the sale; ETF: handling 0.004 %,
//       no CSRC, ChinaClear transfer or stamp ("ETF的經手費爲雙邊成交金額
//       0.004%並且豁免證管費、中國結算之過戶費和交易印花稅"), HKSCC 0.002 %
//     The portfolio fee is waived ("現時豁免直至另行通知"). The "款項交收費：
//       手續費 每宗收費港幣200元" line is a payment-settlement charge, not
//       an order fee, and stays out.
//   United States, each side
//     commission "每宗成交之0.2%起(最低收費20美元)"
//     SEC "成交金額之 0.00206% (只適用於賣方)(最低收費0.01美元)"
//     TAF "每股0.000166美元(只適用於賣方)（最低收費0.01美元和最高收費8.3 美元）"
//     No CAT line is printed (0).
//
// Cash: HKD, USD and RMB receiving accounts (deposits.mjs): no line is
// converted. A client converting his own cash pays "當日銀行換匯價+0.2%手續費，
// 每筆最低收費港幣200元": the remark on a USD or RMB line. No US
// broker-dealer is named: the US book is the quoted NBBO.
//
//   node brokers/centralchinahk/centralchinahk_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/centralchinahk/centralchinahk_cost.mjs 600519 SSE CNY --shares=100 --price=1500
//   node brokers/centralchinahk/centralchinahk_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, cnStatutory, usRegulatory } from "../bocomhk/hkMarketsCost.mjs";

const FEES = "https://www.ccnew.com.hk/tc/brokerage/fee";

const SCHEDULE = {
  broker: "Central China International",
  folder: "centralchinahk",
  catalogueUrl: new URL("centralchinahk-parsed.json", import.meta.url),
  readOn: "2026-10-26",
  url: FEES,
  pages: { HK: FEES, CN: FEES, US: FEES },
  channel: "ordre en ligne (internet, appli), taux de départ publiés (« 起 »)",
  fxPct: "0.2",
  fxExtra: "(min HK$200)",
  basis: {
    HK: "courtage 0,1 %, plancher 30 HKD ou l'équivalent ; CCASS 0,0042 % ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT. Chaque sens",
    CN: "Stock Connect, courtage 0,2 %, plancher 80 RMB ; frais de bourse, CSRC, ChinaClear et HKSCC (ETF : bourse et HKSCC) ; timbre 0,05 % à la vente ; frais de portefeuille suspendus",
    US: "courtage 0,2 %, plancher 20 USD, chaque sens ; SEC 0,00206 % (plancher 0,01 USD) et TAF 0,000166 USD l'action (0,01 à 8,30 USD) à la vente ; pas de ligne CAT",
  },
  usBook: "aucun courtier américain nommé, NBBO coté",
  markets: {
    HK(ctx) {
      const min = ctx.hkd(30);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free });
      if (min == null || side == null) return null;
      const ccass = rateLine(ctx.notional, { rate: 0.000042 });
      return {
        broker: rateLine(ctx.notional, { rate: 0.001, min }) * 2,
        levy: (side.levies + ccass) * 2,
        tax: side.stamp * 2,
      };
    },
    CN(ctx) {
      return { broker: rateLine(ctx.notional, { rate: 0.002, min: 80 }) * 2, ...cnStatutory(ctx.notional, ctx.fund) };
    },
    US(ctx) {
      const levy = usRegulatory(ctx.n, ctx.notional, {
        sec: { rate: 0.0000206, min: 0.01 },
        taf: { perShare: 0.000166, min: 0.01, max: 8.3 },
      });
      return { broker: rateLine(ctx.notional, { rate: 0.002, min: 20 }) * 2, levy };
    },
  },
};

export function roundTrip(query) {
  return marketsRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
