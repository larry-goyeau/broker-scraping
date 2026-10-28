// What one round trip costs at Chiyu Banking Corporation (集友銀行, Hong
// Kong) securities services: buy n shares at price p, sell them straight
// back, in dollars. Automated channel (Mobile Banking, Internet Banking,
// automated stock trading hotline), at the Bright Star tier of the
// Securities Club, the highest rate: the club's tier requirements are not
// published ("Please contact staff of the bank"), so the cheapest tier is the
// remark. Branch and manned-hotline orders, the monthly stocks savings plan,
// margin and IPOs stay out.
//
// General banking services fee schedule, section 3 Securities Services,
// read on 2026-10-26 ("charged according to the transaction currency"):
//   HKEx-listed stocks and ETFs, each side
//     brokerage 0.25 % (Bright Star; Silver 0.23 %, Gold 0.20 %, Diamond
//     0.18 %), minimum HKD 100 / RMB 100
//     stamp 0.1 %, rounded up to the nearest dollar (0 on an ETF or a REIT)
//     SFC 0.0027 %, AFRC 0.00015 %, HKEx trading fee 0.00565 %
//     No CCASS settlement line is printed: none is added.
//     Transaction charge on the purchase (automated channels): HKD 2.50 /
//     RMB 2.50 a board lot, minimum 30, maximum 200, waived when the trade
//     is 1,000,000 or more; "Odd lot is treated as one board lot", so it is
//     2.50 × ceil(shares / lot), the lot from the catalogue row.
//   A shares (Shanghai / Shenzhen), each side
//     brokerage 0.25 % (same tiers), minimum RMB 100
//     handling 0.00341 % (ETF 0.004 %), CSRC 0.002 % (ETF waived), transfer
//     0.003 % (ChinaClear 0.001 %, waived for ETFs, and HKSCC 0.002 %),
//     stamp 0.05 % on the sale (ETF waived)
//     Transaction charge on the purchase (Internet Banking): RMB 0.25 a board
//     lot of 100, minimum 30, maximum 200, waived from RMB 1,000,000.
//   Singapore securities are not sold online (../chiyu/chiyu_scraping.mjs).
//   https://www.chiyubank.com/cyb/attachDir/deposit_general_banking_services_tw.pdf
//
// Cash: HKD and CNH (deposits.mjs). FX from Chiyu's own board, "貨幣兌換率"
// (one buying and one selling rate a currency, HKD per 100 units; RMB per
// HKD 100), updated "2026/10/26 21:00:00", read on 2026-10-26:
//   美元 買入 783.250000, 賣出 785.770000: one conversion costs half the
//   spread over the mid, 2.52 / (783.25 + 785.77) = 0.16 %.
//   人民幣（離岸） 買入 85.409788, 賣出 84.616328: 0.79346 / 170.026116 =
//   0.47 %.
//   https://www.chiyubank.com/wcs/currency-exchange-bond/#/index (linked
//   from 財經資訊 > 牌價 > 貨幣兌換率, https://www.chiyubank.com/cyb/index/cjzx/pj/index.shtml)
// A CNH line (A shares, RMB counters) is held: "FX 0.47% when cash ≠ CNH."
// A USD counter on HKEX is a forced conversion, 0.16 % each way in the
// total. The schedule prints no USD brokerage minimum ("HKD100.00 /
// RMB100.00", charged "according to the transaction currency"), so the
// HKD 100 is taken at its dollar value, as for Mox and Standard Chartered's
// USD counters (owner, 2026-10-26); the buy charge per lot likewise.
//
//   node brokers/chiyu/chiyu_cost.mjs 00700 HKEX HKD --shares=100 --price=400
//   node brokers/chiyu/chiyu_cost.mjs 00700 HKEX HKD --shares=150 --price=400
//   node brokers/chiyu/chiyu_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/chiyu/chiyu_cost.mjs 600519 "Shanghai Stock Exchange" CNH --shares=100 --price=1500
//   node brokers/chiyu/chiyu_cost.mjs 510050 "Shanghai Stock Exchange" CNH --shares=1000 --price=3
//
// `roundTrip(...)` reads files, not the network.

import { frPct, hkexRoundTrip } from "../primehk/hkexCost.mjs";
import { addRemark, adjust, cashKey, cashOf, cents, connectRoundTrip, engineOf, pctOf, printCli } from "../bocomhk/hkMarketsCost.mjs";
import { fxRemark, toUsd } from "../../fx.mjs";

const FOLDER = "chiyu";
const CATALOGUE = new URL("chiyu-parsed.json", import.meta.url);
const READ_ON = "2026-10-26";
const PAGE = "https://www.chiyubank.com/cyb/attachDir/deposit_general_banking_services_tw.pdf";
const CASH = cashOf(FOLDER);
const CHANNEL = "canal automatisé (Mobile Banking, Internet Banking, ligne boursière automatique), palier Bright Star";
const RATE = 0.0025;
const DIAMOND = 0.0018;
const MIN = 100;
// Chiyu's 貨幣兌換率 board, 2026-10-26 21:00: half the buy/sell spread over the mid, one leg.
const FX_PAGE = "https://www.chiyubank.com/wcs/currency-exchange-bond/#/index";
// USD 2.52 / (783.25 + 785.77) = 0.16 %; CNH 0.79346 / 170.026116 = 0.47 % (two decimals).
const FX = { USD: 0.0016, CNH: 0.0047 };

const HK = {
  broker: "Chiyu",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: CHANNEL,
  commission: { rate: RATE, min: { HKD: MIN, CNH: MIN, USD: toUsd(MIN, "HKD") } },
  settlement: null,
  cash: CASH,
  fxEach: FX.USD,
  fxLabel: `cours 貨幣兌換率 de Chiyu, demi-écart achat/vente sur le milieu, relu le ${READ_ON}`,
};

// The purchase's transaction charge: per board lot, 30 to 200, waived from 1,000,000.
const buyCharge = (notional, lots, perLot) => (notional >= 1000000 ? 0 : Math.min(200, Math.max(30, perLot * lots)));

const CN = {
  broker: "Chiyu",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: CHANNEL,
  commission: { rate: RATE, min: MIN },
  buyCharge: ({ notional, lots }) => buyCharge(notional, lots, 0.25),
  buyChargeLabel: "frais de transaction à l'achat 0,25 RMB par lot (30 à 200 RMB, offerts dès 1 000 000 RMB)",
  cash: CASH,
  fxEach: null,
};

// x is the cut on the broker's own fees of the trip (brokerage both sides
// and the purchase's transaction charge, \`trip\`), in the listing currency.
function tierRemark(notional, trip) {
  const side = (rate) => Math.max(MIN, cents(notional * rate));
  const gap = pctOf((side(RATE) - side(DIAMOND)) * 2, trip);
  return gap ? `Fees might be ${gap}% lower if you are a Diamond Star member of the Securities Club.` : "";
}

const tripOf = (out) => (out.commission?.buy ?? 0) + (out.commission?.sell ?? 0);

// A held currency other than HKD (CNH): "FX 0.47% when cash ≠ CNH."
function withFx(out) {
  const ccy = out?.listing?.currency || out?.trade?.currency;
  const key = ccy ? cashKey(ccy) : null;
  if (!key || key === "HKD" || !CASH.includes(key) || FX[key] == null) return out;
  return addRemark(out, fxRemark(String(FX[key] * 100), ccy));
}

export function roundTrip(query) {
  return withFx(priced(query));
}

function priced(query) {
  const market = engineOf(CATALOGUE, query);
  const n = Number(query.shares);
  const p = Number(query.price);
  if (market === "CN") {
    const out = connectRoundTrip(CN, query);
    return out.trade ? addRemark(out, tierRemark(out.trade.notional, tripOf(out))) : out;
  }
  if (market === "US") return { ...hkexRoundTrip(HK, query), why: "Chiyu ne vend en ligne que HKEX et les actions A" };
  let out = hkexRoundTrip(HK, query);
  if (!out.trade && out.listing && !CASH.includes(out.listing.currency)) {
    return { ...out, why: `${out.listing.currency} n'est pas une devise de dépôt : change forcé ${frPct(FX.USD)} par sens au cours 貨幣兌換率 de Chiyu, mais le barème n'imprime pas de plancher de courtage en ${out.listing.currency}, total inconnu` };
  }
  if (!(n > 0 && p > 0) || !out.trade) return out;
  const lot = out.lot;
  if (!lot) return { ...out, usd: null, brokerFees: null, why: [out.why, "frais de transaction à l'achat : 2,50 par lot, mais la ligne n'a pas de lot"].filter(Boolean).join(" ; ") };
  const lots = Math.ceil(n / lot - 1e-9);
  // In HKD (or RMB); a USD counter pays the HKD figures at their dollar value.
  const k = out.trade.currency === "USD" ? toUsd(1, "HKD") : 1;
  const charge = buyCharge((n * p) / k, lots, 2.5) * k;
  out = adjust(out, { broker: charge, buy: charge, note: `frais de transaction à l'achat ${cents(charge)} ${out.trade.currency} (${lots} lot${lots > 1 ? "s" : ""} de ${lot}, 2,50 par lot, 30 à 200, offerts dès 1 000 000)` });
  out = { ...out, basis: `${out.basis} Frais de transaction à l'achat 2,50 par lot de bourse (un rompu compte pour un lot), entre 30 et 200, offerts dès 1 000 000.` };
  return addRemark(out, tierRemark(n * p, tripOf(out)));
}

export const SCHEDULE = { page: PAGE, fxPage: FX_PAGE, fx: FX, readOn: READ_ON, hk: HK, cn: CN };

printCli(import.meta.url, roundTrip);
