// What one round trip costs at Christfund Securities (恒豐證券, Hong Kong):
// buy n shares at price p, sell them back, in dollars. Online order on the
// ieasy platform. Phone orders, futures, margin and IPOs stay out.
//
// Fee page (收費 → 證券收費表, "生效日期 2023 年 1 月 1 日"), read on 2026-10-28:
//   https://www.christfund.com/price.php
// The table is headed "現金及保證金帳戶收費 / 備註 (香港)" and is the only
// tariff the site prints. Hong Kong (HKEX), each side:
//   commission "網上交易經紀佣金 交易金額之 0.075% 最低 HK$50" (the phone
//     line, "0.10% / 100萬元或以上之 0.075% 最低 HK$75", is not this one);
//     a USD or RMB counter pays the HKD 50 floor at its equivalent
//   stamp "交易金額之 0.10% 不足$1 進位作$1 計收", none on an ETF or a REIT
//   SFC "交易所徵費 0.0027%", HKEX "交易費 0.00565%", AFRC "會財局交易徵費
//     0.00015%"
//   CCASS "中央結算費 交易金額之 0.015% 最低 HK$3" (no maximum printed)
//
// Stock Connect and B-shares: no page prints a commission or a levy for
// them (service.php, download.php and its forms, the two Stock Connect
// risk statements and the platform manuals name no fee; a web search finds
// none). Stand-in, to be confirmed by the owner (same broker, same table):
// the Hong Kong online line, 0.075 % with a floor of HK$50 at its
// equivalent in the listing currency, each side. `STAND_IN = false` turns
// those lines back to N/A.
//   Stock Connect (Northbound), each side: HKEX's statutory lines
//     (../bocomhk/hkMarketsCost.mjs `cnStatutory`): handling 0.00341 %,
//     CSRC 0.002 %, ChinaClear 0.001 %, HKSCC 0.002 %, stamp 0.05 % on the
//     sale; an ETF pays handling 0.004 % and HKSCC 0.002 % only.
//     https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Reference-Materials/Fees-and-Charges?sc_lang=en
//   B-shares, each side: the exchange and clearing lines as Bright Smart
//     prints them (../brightsmart/brightsmart_cost.mjs, read 2026-10-18,
//     https://www.bsgroup.com.hk/commissions/globalsecurities/):
//     Shanghai B (USD) handling 0.00341 %, CSRC 0.002 %, settlement 0.002 %
//       up to 50 USD; Shenzhen B (HKD) levy 0.00541 % (CSRC included),
//       settlement 0.002 % up to 500 HKD; stamp 0.05 % on the sale.
//     Board lots: 1,000 shares in Shanghai, 100 in Shenzhen.
//
// Not per trade: dividend collection 0.5 % (HK$30 to HK$1,000), scrip
// withdrawal HK$5 a lot (min HK$30), transfer out (ISI HK$10 a stock, SI
// HK$5 a lot, HK$30 to HK$300), paper statements HK$30 a month.
//
// Cash: HKD, USD and RMB (CNH) accounts at Chong Hing Bank
// (https://www.christfund.com/capital.php, deposits.mjs): a line in its own
// currency converts nothing, CNY Stock Connect lines settle in the CNH
// cash. Christfund prints no conversion rate or spread (price.php,
// service.php, capital.php, the download.php forms, OCR of the scanned
// ones, read 2026-10-28; the A-share risk statement only says conversion
// "將會牽涉轉換貨幣的成本"). No client agreement is online.
// FX stand-in, to be confirmed by the owner: Chong Hing Bank, the only one
// of its four client-money banks holding Christfund's USD and RMB accounts
// (041-256-25-… USD, 041-256-19-… RMB), board "外幣牌價 > 外幣電匯兌港元牌價"
// (買入 / 賣出, per 100), update "28-10-2026 18:00 HKT", read 2026-10-28:
//   https://www.chbank.com/tc/personal/banking-services/useful-information/foreign-currency-exchange/index.shtml
//   (data: https://www.chbank.com/xml_rates2/fer_tt_tc.xml)
//   USD 782.88 / 786.33 HKD; 人民幣(離岸) CNH 116.89 / 118.51 HKD.
//   One conversion against the mid = half of (sell − buy) / mid:
//   USD 0.22 %, CNH 0.69 %. A live board; the figure is that day's.
//
//   node brokers/christfund/christfund_cost.mjs 00700 HKEX HKD --shares=100 --price=500
//   node brokers/christfund/christfund_cost.mjs 600519 SSE CNY --shares=100 --price=1500
//   node brokers/christfund/christfund_cost.mjs 900942 SSE USD --shares=1000 --price=0.5
//   node brokers/christfund/christfund_cost.mjs 200596 SZSE HKD --shares=100 --price=100
//
// `roundTrip(...)` reads files, not the network.

import { marketsRoundTrip, printCli, rateLine, hkStatutory, cnStatutory, CN_LOT } from "../bocomhk/hkMarketsCost.mjs";

const FEES = "https://www.christfund.com/price.php";

// Hong Kong online line, each side; the stand-in for Stock Connect and B-shares.
const ONLINE = { rate: 0.00075, minHkd: 50 };
const CCASS = { rate: 0.00015, minHkd: 3 };
const STAND_IN = true;

// B-shares, each side, in the listing currency (Bright Smart's lines).
const B = {
  USD: { lot: 1000, levy: 0.0000341 + 0.00002, settle: 0.00002, settleMax: 50, stamp: 0.0005, label: "B Shanghai (USD)" },
  HKD: { lot: 100, levy: 0.0000541, settle: 0.00002, settleMax: 500, stamp: 0.0005, label: "B Shenzhen (HKD)" },
};
const bShare = (row) => (String(row.currency).toUpperCase() !== "CNY" ? B[String(row.currency).toUpperCase()] || null : null);

const UNPUBLISHED = "Christfund ne publie de courtage que pour Hong Kong";

const SCHEDULE = {
  broker: "Christfund Securities",
  folder: "christfund",
  catalogueUrl: new URL("christfund-parsed.json", import.meta.url),
  readOn: "2026-10-28",
  url: FEES,
  pages: { HK: FEES, CN: FEES },
  channel: "ordre en ligne (plateforme ieasy)",
  // Chong Hing Bank TT board of 28 Oct 2026 (stand-in): half of (sell − buy) / mid.
  fxPct: { USD: "0.22", CNH: "0.69" },
  basis: {
    HK: "courtage en ligne 0,075 %, plancher 50 HKD ou l'équivalent ; CCASS 0,015 %, plancher 3 HKD ; SFC, AFRC, HKEX ; timbre 0,1 % sauf ETF et REIT. Chaque sens",
    CN:
      "pas de courtage publié hors Hong Kong : barème en ligne de Hong Kong repris (0,075 %, plancher 50 HKD en équivalent), à confirmer ; " +
      "Stock Connect : frais HKEX (traitement, CSRC, ChinaClear, HKSCC ; ETF : traitement et HKSCC), timbre 0,05 % à la vente ; " +
      "actions B : frais de bourse et règlement 0,002 % plafonné (50 USD à Shanghai, 500 HKD à Shenzhen) comme chez Bright Smart, timbre 0,05 % à la vente. Chaque sens",
  },
  markets: {
    HK(ctx) {
      const min = ctx.hkd(ONLINE.minHkd);
      const ccassMin = ctx.hkd(CCASS.minHkd);
      const side = hkStatutory(ctx.notional, ctx.currency, { free: ctx.free });
      if (min == null || ccassMin == null || side == null) return null;
      const ccass = rateLine(ctx.notional, { rate: CCASS.rate, min: ccassMin });
      return {
        broker: rateLine(ctx.notional, { rate: ONLINE.rate, min }) * 2,
        levy: (side.levies + ccass) * 2,
        tax: side.stamp * 2,
      };
    },
    CN(ctx) {
      if (!STAND_IN) return { why: `${UNPUBLISHED} : courtage Stock Connect et actions B inconnu, total inconnu` };
      const min = ctx.hkd(ONLINE.minHkd);
      if (min == null) return null;
      const broker = rateLine(ctx.notional, { rate: ONLINE.rate, min }) * 2;
      const b = bShare(ctx.row);
      if (!b) return { broker, ...cnStatutory(ctx.notional, ctx.fund), note: `courtage : barème en ligne de Hong Kong repris (${UNPUBLISHED}), lot de bourse 100` };
      const settle = Math.min(b.settleMax, ctx.notional * b.settle);
      const lots = Number((ctx.n / b.lot).toPrecision(4));
      return {
        broker,
        levy: (ctx.notional * b.levy + settle) * 2,
        tax: ctx.notional * b.stamp,
        note:
          `courtage : barème en ligne de Hong Kong repris (${UNPUBLISHED}) ; ` +
          `${b.label} : frais de bourse ${String(Number((b.levy * 100).toFixed(5))).replace(".", ",")} %, règlement 0,002 % plafonné à ${b.settleMax} ${ctx.currency}, timbre 0,05 % à la vente ; ` +
          `lot de bourse ${b.lot} (${lots} lot${lots >= 2 ? "s" : ""})`,
      };
    },
  },
};

const A_SHARE = "action A : traitement, CSRC, ChinaClear, HKSCC ; timbre 0,05 % à la vente";

export function roundTrip(query) {
  const result = marketsRoundTrip(SCHEDULE, query);
  // The shared helper words every SSE / SZSE line as a Stock Connect A-share.
  if (!result?.listing || !/^(SSE|SZSE)$/i.test(result.listing.brokerExchange || "")) return result;
  const b = result.listing.currency !== "CNY" ? B[result.listing.currency] : null;
  if (!b) return { ...result, lot: CN_LOT };
  return { ...result, lot: b.lot, confidence: typeof result.confidence === "string" ? result.confidence.replace(`${A_SHARE} ; `, "") : result.confidence };
}

printCli(import.meta.url, roundTrip, SCHEDULE);
