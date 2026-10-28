// What one round trip costs at EleBank (大象銀行, formerly Airstar Bank):
// buy n shares at price p, sell them back, in dollars. App order, standard
// tariff. Fractional US orders, options, margin and IPOs stay out.
//
// Help-centre fee pages, read on 2026-10-26 (the stocks page prints the same
// headline figures: https://www.elebank.com/zh-hk/stocks.html):
//   Hong Kong   https://support.platform.elebank.com/personal/zh-hk/topic15_414
//     each side
//     commission "0.03%*交易金額，每筆訂單最低3.00港元（免佣期內不收取）"
//     platform "每筆訂單15港元"
//     CCASS (交收費) 0.0042 %; stamp 0.1 % rounded up to the next HKD, none
//       on an ETF; trading fee 0.00565 % and SFC levy 0.0027 %, each at
//       least 0.01 HKD; AFRC 0.00015 %
//     The lifetime commission waiver ("免佣資格限參與活動期間完成開户 … 對已獲
//     適用資格的賬戶不設到期") is the remark.
//   United States   https://support.platform.elebank.com/personal/zh-hk/topic15_415
//     each side
//     commission "0.0049/股，每筆訂單最低0.99美元，最高（0.5%*交易金額）"
//     platform "0.005/股，每筆訂單最低1美元，最高（0.5%*交易金額）"; "若與每筆
//       最低收費標準衝突，以最低收費標準為準": the minimum wins over the cap
//     settlement 0.003 USD a share; CAT 0.000003 USD a share (NMS)
//     SEC 0.00206 % of the sale, minimum 0.01; TAF 0.000195 USD a share
//       sold, minimum 0.01, maximum 9.79
//
// Cash: the stock account trades in HKD and USD (deposits.mjs). An RMB
// counter is bought with HKD converted "基於大象綜合匯率牌價"; the bank says
// no fee is charged (topic15_322) but prints no spread, so the total of an
// RMB line is unknown.
//
// US orders: EleBank's US transfer page names Futu Clearing Inc. (DTC
// 4272) as its DTC participating clearing firm, the firm Futu HK's book
// uses. https://support.platform.elebank.com/personal/zh-hk/topic15_777
// The book is that firm's 606 once spreads/rule606.mjs carries the alias
// elebank → futuclearing; until then, the quoted NBBO.
//
//   node brokers/elebank/elebank_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/elebank/elebank_cost.mjs 02800 HKEX HKD --shares=100 --price=25
//   node brokers/elebank/elebank_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/elebank/elebank_cost.mjs VOO ARCX USD --shares=1 --price=550
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, usRegulatory, lowerRemark, cents } from "../bocomhk/hkMarketsCost.mjs";

const PAGES = {
  HK: "https://support.platform.elebank.com/personal/zh-hk/topic15_414",
  US: "https://support.platform.elebank.com/personal/zh-hk/topic15_415",
};

function capped(n, notional, perShare, min) {
  return Math.max(min, Math.min(cents(n * perShare), cents(notional * 0.005)));
}

const SCHEDULE = {
  broker: "EleBank",
  folder: "elebank",
  catalogueUrl: new URL("elebank-parsed.json", import.meta.url),
  readOn: "2026-10-26",
  url: "https://www.elebank.com/zh-hk/stocks.html",
  pages: PAGES,
  channel: "ordre par l'appli, tarif standard",
  basis: {
    HK: "courtage 0,03 %, plancher 3 HKD, plus 15 HKD de plateforme par ordre ; CCASS 0,0042 % ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT. Chaque sens",
    US: "0,0049 USD l'action (0,99 USD à 0,5 %) et plateforme 0,005 USD l'action (1 USD à 0,5 %) ; règlement 0,003 USD et CAT 0,000003 USD l'action à chaque sens ; SEC 0,00206 % et TAF 0,000195 USD l'action à la vente",
  },
  usBook: "Futu Clearing Inc. nommée comme compensateur DTC : 605 × Q de son 606 une fois l'alias elebank posé, sinon NBBO coté",
  markets: {
    HK(ctx) {
      const min = ctx.hkd(3);
      const platform = ctx.hkd(15);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free, levyMin: 0.01 });
      if (min == null || platform == null || side == null) return null;
      const commission = rateLine(ctx.notional, { rate: 0.0003, min });
      const ccass = rateLine(ctx.notional, { rate: 0.000042 });
      return {
        broker: (commission + cents(platform)) * 2,
        levy: (side.levies + ccass) * 2,
        tax: side.stamp * 2,
        remark: lowerRemark(commission * 2, (commission + cents(platform)) * 2, "the account was opened during the lifetime commission-free campaign"),
      };
    },
    US(ctx) {
      const side = capped(ctx.n, ctx.notional, 0.0049, 0.99) + capped(ctx.n, ctx.notional, 0.005, 1);
      const levy = usRegulatory(ctx.n, ctx.notional, {
        settle: { perShare: 0.003 },
        cat: { perShare: 0.000003 },
        sec: { rate: 0.0000206, min: 0.01 },
        taf: { perShare: 0.000195, min: 0.01, max: 9.79 },
      });
      return { broker: side * 2, levy };
    },
  },
};

export function roundTrip(query) {
  return marketsRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
