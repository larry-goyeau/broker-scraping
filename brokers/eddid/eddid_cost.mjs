// What one round trip costs at Eddid Securities and Futures (艾德證券期貨):
// buy n shares at price p, sell them back, in dollars. Online / app order
// (Eddid ONE) on the standard tariff. Phone orders, the grey market,
// margin, IPOs and the commission-free period of clients who were granted
// one stay out.
//
// Charges page (收費標準), read on 2026-10-26:
//   https://www.eddid.com.hk/sf/charges/
//   Hong Kong (港股交易標準收費, updated 02/2026), each side
//     commission "佣金(經網上或手機應用程式落盤) 交易金額 × 0.028%", minimum
//       HK$8; platform fee HK$12 an order
//     SFC 0.0027 %, HKEX 0.00565 %, stamp 0.1 % ("不足港幣1元作港幣1元計",
//       none on an ETF), CCASS 0.0042 % (minimum HK$0.01), AFRC 0.00015 %
//     "在雙幣安排下進行的所有交易，其相關費用和佣金（包括平台費）將以交易貨幣計算":
//       on an RMB or USD counter the HKD amounts are taken at the fx table.
//   United States (美股交易標準收費（不包括 OTC Market）, updated 10/2026),
//   each side
//     commission (online) 0.0049 USD a share, minimum 0.99, maximum 0.5 %
//       of the order; platform 0.005 USD a share, minimum 1, maximum 0.5 %
//       (a minimum above the cap wins, as at the other Futu-style tariffs)
//     settlement 0.003 USD a share, minimum 0.01
//     CAT 0.000003 USD a share, minimum 0.01
//     SEC 0.00206 % of the sale, minimum 0.01
//     TAF 0.000195 USD a share sold, minimum 0.01, maximum 9.79, but
//       "於 2026 年 10 月 1 日至 2026 年 12 月 31 日期間(豁免期)暫停徵收": 0 in
//       that window, the printed rate after it.
//   Custody is waived.
//
// Cash: HKD, USD, CNH, JPY and SGD (deposits.mjs): no line is converted.
// No US broker-dealer is named: the US book is the quoted NBBO.
//
//   node brokers/eddid/eddid_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/eddid/eddid_cost.mjs 02800 HKEX HKD --shares=100 --price=25
//   node brokers/eddid/eddid_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/eddid/eddid_cost.mjs AAPL XNAS USD --shares=1000 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, usRegulatory, cents } from "../bocomhk/hkMarketsCost.mjs";

const FEES = "https://www.eddid.com.hk/sf/charges/";
const TAF_WAIVED = { from: "2026-10-01", to: "2026-12-31" };

// A per-share line with a minimum and a cap of 0.5 % of the order; the
// minimum wins over the cap.
function capped(n, notional, perShare, min) {
  return Math.max(min, Math.min(cents(n * perShare), cents(notional * 0.005)));
}

function tafWaived(today = new Date().toISOString().slice(0, 10)) {
  return today >= TAF_WAIVED.from && today <= TAF_WAIVED.to;
}

const SCHEDULE = {
  broker: "Eddid Securities",
  folder: "eddid",
  catalogueUrl: new URL("eddid-parsed.json", import.meta.url),
  readOn: "2026-10-26",
  url: FEES,
  pages: { HK: FEES, US: FEES },
  channel: "ordre en ligne (Eddid ONE, appli), tarif standard",
  basis: {
    HK: "courtage 0,028 %, plancher 8 HKD, plus 12 HKD de plateforme par ordre ; CCASS 0,0042 % ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT. Chaque sens",
    US: "0,0049 USD l'action (0,99 USD à 0,5 %) et plateforme 0,005 USD l'action (1 USD à 0,5 %) ; règlement 0,003 USD et CAT 0,000003 USD l'action à chaque sens ; SEC 0,00206 % à la vente ; TAF 0,000195 USD l'action à la vente, suspendue du 1er octobre au 31 décembre 2026",
  },
  usBook: "aucun courtier américain nommé, NBBO coté",
  markets: {
    HK(ctx) {
      const min = ctx.hkd(8);
      const platform = ctx.hkd(12);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free });
      if (min == null || platform == null || side == null) return null;
      const ccass = rateLine(ctx.notional, { rate: 0.000042, min: 0.01 });
      return {
        broker: (rateLine(ctx.notional, { rate: 0.00028, min }) + cents(platform)) * 2,
        levy: (side.levies + ccass) * 2,
        tax: side.stamp * 2,
      };
    },
    US(ctx) {
      const side = capped(ctx.n, ctx.notional, 0.0049, 0.99) + capped(ctx.n, ctx.notional, 0.005, 1);
      const levy = usRegulatory(ctx.n, ctx.notional, {
        settle: { perShare: 0.003, min: 0.01 },
        cat: { perShare: 0.000003, min: 0.01 },
        sec: { rate: 0.0000206, min: 0.01 },
        taf: tafWaived() ? null : { perShare: 0.000195, min: 0.01, max: 9.79 },
      });
      return { broker: side * 2, levy, note: tafWaived() ? "TAF suspendue jusqu'au 31 décembre 2026 (page Eddid)" : null };
    },
  },
};

export function roundTrip(query) {
  return marketsRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
