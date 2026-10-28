// What one round trip costs at Bank of Communications (Hong Kong)
// (交通銀行(香港)): buy n shares at price p, sell them back, in dollars.
// Electronic channel (online banking, the securities app; Stock Connect:
// online only), standard client. Branch and hotline orders, the monthly
// stock plan, IPOs and margin stay out.
//
// Fee schedule "證券買賣服務收費表", effective 19 October 2026, read on
// 2026-10-26 (the US pages also as their own "美國證券買賣服務收費表"):
//   https://www.hk.bankcomm.com/hk/fileDownload.html?fileId=4029c74b1108451d98123cd7f76c393f
//   https://www.hk.bankcomm.com/hk/fileDownload.html?fileId=d3384363875a471299a6493fd9fe007d
//   Hong Kong (本地證券), each side
//     commission "電子交易途徑 … 0.20%，每筆交易最低收費港幣/人民幣100元";
//       a USD counter takes 100 HKD at the fx table
//     交易處理費 免收 (no CCASS line); stamp 0.1 % rounded up to the next
//     HKD; SFC 0.0027 %, AFRC 0.00015 %, HKEX 0.00565 %
//     Client tiers on the same line: 交銀理財 0.18 %, 通達理財 0.15 %,
//     通達私人財富 0.138 %, same minimum: the remark (best tier).
//   Stock Connect (滬股通/深股通), each side
//     commission "電子交易途徑(只適用於網上) … 0.20%，每筆交易最低收費人民幣100元",
//       the same tiers
//     交易處理費 "每筆人民幣30元", on the purchase only ("於買 … 股票時收取")
//     stock: handling 0.00341 %, CSRC 0.002 %, ChinaClear 0.001 %, HKSCC
//       0.002 %, stamp 0.05 % on the sale; ETF: handling 0.004 %, HKSCC 0.002 %
//   United States, each side, "美國市場之交易費用則以小數點後兩位計算"
//     commission "每股0.013美元、最低收費13美元"
//     交易處理費 "每筆交易收費2美元"
//     settlement (交收費) 0.003 USD a share
//     SEC 0.00206 % of the sale, minimum 0.01 USD
//     TAF 0.000195 USD a share sold, minimum 0.01, maximum 9.79 USD
//     No CAT line is printed (0). The "非美國DTC結算費" is for OTC
//     securities, which this catalogue does not hold.
//   Custody: 15 HKD (HK) and 3 USD (US) a month, waived in any month with
//   a trade: not this trip.
//
// Cash: HKD, USD and RMB settlement accounts (deposits.mjs), so no line is
// converted. The FX remark is the bank's own board, "市場資訊 > 匯率 > 外幣兌港元"
// ("銀行買入 / 銀行賣出", "CNH：離岸人民幣兌換匯價"), read 2026-10-26 (board
// of 26 Oct 2026, the page's own data call getForeignExchangeData.do):
//   https://www.hk.bankcomm.com/hk/shtml/hk/tw/2005155/2005175/2005176/list.shtml?channelId=2005155
//   USD 7.821809 / 7.869716 HKD; RMB (CNH) 1.1694775 / 1.1834893 HKD.
//   One conversion against the mid = half of (sell − buy) / mid:
//   USD 0.31 %, CNH 0.60 %. The board is a live rate; the figure is that
//   day's.
// The bank names no US broker-dealer: the US book is the quoted NBBO.
//
//   node brokers/bocomhk/bocomhk_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/bocomhk/bocomhk_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/bocomhk/bocomhk_cost.mjs 600519 SSE CNY --shares=100 --price=1500
//   node brokers/bocomhk/bocomhk_cost.mjs 510050 SSE CNY --shares=1000 --price=3
//   node brokers/bocomhk/bocomhk_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, cnStatutory, usRegulatory, lowerRemark, cents } from "./hkMarketsCost.mjs";

const FEES = "https://www.hk.bankcomm.com/hk/fileDownload.html?fileId=4029c74b1108451d98123cd7f76c393f";
const US_FEES = "https://www.hk.bankcomm.com/hk/fileDownload.html?fileId=d3384363875a471299a6493fd9fe007d";
const TIER = "you are a 通達私人財富 (Private Wealth) client";

// 0.20 % (or the tier rate), minimum 100 in the counter's currency (HKD,
// or RMB on an RMB counter; HKD at the fx table on a USD counter).
function hkCommission(ctx, rate) {
  const min = ctx.ccy === "CNH" ? 100 : ctx.hkd(100);
  if (min == null) return null;
  return rateLine(ctx.notional, { rate, min });
}

const SCHEDULE = {
  broker: "Bank of Communications (Hong Kong)",
  folder: "bocomhk",
  catalogueUrl: new URL("bocomhk-parsed.json", import.meta.url),
  readOn: "2026-10-26",
  url: FEES,
  pages: { HK: FEES, CN: FEES, US: US_FEES },
  channel: "ordre électronique (banque en ligne, appli), client standard",
  basis: {
    HK: "courtage 0,20 %, plancher 100 HKD (100 RMB sur une ligne en RMB) ; pas de frais de traitement CCASS ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT. Chaque sens",
    CN: "Stock Connect en ligne, courtage 0,20 %, plancher 100 RMB ; 30 RMB de frais de traitement à l'achat ; frais de bourse, CSRC, ChinaClear et HKSCC (ETF : bourse et HKSCC) ; timbre 0,05 % à la vente",
    US: "0,013 USD l'action, plancher 13 USD ; 2 USD de frais de traitement et 0,003 USD l'action de règlement à chaque sens ; SEC 0,00206 % et TAF 0,000195 USD l'action à la vente ; pas de ligne CAT",
  },
  usBook: "aucun courtier américain nommé, NBBO coté",
  // Board "外幣兌港元" of 26 Oct 2026: half of (sell − buy) / mid.
  fxPct: { USD: "0.31", CNH: "0.6" },
  markets: {
    HK(ctx) {
      const commission = hkCommission(ctx, 0.002);
      const best = hkCommission(ctx, 0.00138);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free });
      if (commission == null || side == null) return null;
      return {
        broker: commission * 2,
        levy: side.levies * 2,
        tax: side.stamp * 2,
        remark: lowerRemark((commission - best) * 2, commission * 2, TIER),
      };
    },
    CN(ctx) {
      const commission = rateLine(ctx.notional, { rate: 0.002, min: 100 });
      const best = rateLine(ctx.notional, { rate: 0.00138, min: 100 });
      const { levy, tax } = cnStatutory(ctx.notional, ctx.fund);
      return {
        broker: commission * 2 + 30,
        buy: commission + 30,
        sell: commission,
        levy,
        tax,
        remark: lowerRemark((commission - best) * 2, commission * 2 + 30, TIER),
      };
    },
    US(ctx) {
      const commission = Math.max(13, cents(ctx.n * 0.013)) + 2;
      const levy = usRegulatory(ctx.n, ctx.notional, {
        settle: { perShare: 0.003 },
        sec: { rate: 0.0000206, min: 0.01 },
        taf: { perShare: 0.000195, min: 0.01, max: 9.79 },
      });
      return { broker: commission * 2, levy };
    },
  },
};

export function roundTrip(query) {
  return marketsRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
