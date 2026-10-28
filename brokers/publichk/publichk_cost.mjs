// What one round trip costs at Public Bank (Hong Kong): buy n shares on the
// Stock Exchange of Hong Kong by internet or the stock trading app and sell
// them straight back, in dollars.
//
// https://www.publicbank.com.hk/static/prod/retailBanking-investment-securitiesTrading/00078_13EN.pdf
// read on 2026-10-26, "Service Charges on Investment Services", 00078_13E
// (August 2025), "This service charge schedule is effective from 1 August
// 2025". "1. Brokerage Commission (a) Local securities":
//   "Hong Kong Customers / Internet Channel 0.2% of transaction amount
//    HK$68", "Mobile Channel 0.2% of transaction amount HK$68"
//                                          -> plan "hk", commission each side
//   "Telephone Channel 0.25% of transaction amount HK$100" -> not priced
//   "Overseas Customers / All trading channels 0.5% of transaction amount
//    HK$100"                               -> plan "overseas"
//   "2. Transaction levy 0.0027%", "3. AFRC transaction levy 0.00015%",
//   "4. Investor compensation levy Suspended", "5. Trading fee 0.00565%"
//   "6. Stamp duty 0.1% of transaction amount (rounded up to the nearest
//    dollar) HK$1"
//   "7. CCASS stock settlement fee 0.0042% of transaction amount" (no
//    minimum, no maximum)                  -> settlement, each side
//   "9. Italian Financial Transactions Tax [...] 0.2% on the net purchase
//    amount of the same day" -> zero on a round trip.
// The 0.002 % (min HK$2, max HK$150) "CCASS stock settlement fee" under
// "Scrip handling and settlement-related services" is for settlement
// instructions, not trades.
//
// Two plans, by where the client lives: "hk" (Hong Kong customers, 0.2 %,
// min HK$68) and "overseas" (overseas customers, 0.5 %, min HK$100).
//
// Currency: note 2, "service fees and charges that are quoted in HKD will
// be levied in HKD or its equivalent in trading currency based on the
// Bank's prevailing rate of exchange", and the tariff charges a
// "Multi-Counter Transfer Instruction": a USD or RMB (CNH) counter settles
// in its own currency from the bank's HKD, USD and RMB accounts, with no
// conversion; the HKD fees are converted at fx.mjs rates.
//
// Formula, each side: max(rate x value, minimum) + 0.0042 % x value + SFC,
// AFRC and HKEX trading fee (each to the cent) + stamp 0.1 % rounded up to
// the next HKD (none on an ETF or a REIT); plus the HKEX book (hk-touch
// leaf). The sums are in ../primehk/hkexCost.mjs.
//
// Remark: custody, "Local securities HK$0.15 per board lot (charged
// half-yearly) HK$100 [min] HK$2,500 [max]", on each account holding
// securities at the end of June and December: at least HK$200 a year on a
// small holding. Left out: the scrip fee (HK$1.5 per board lot), dividend
// collection (0.5 %, min HK$25): not trade costs. Deposit fee waived.
//
//   node brokers/publichk/publichk_cost.mjs 00700 XHKG HKD --shares=20 --price=417.8 --plan=overseas
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip, printCli } from "../primehk/hkexCost.mjs";

const URL_TARIFF = "https://www.publicbank.com.hk/static/prod/retailBanking-investment-securitiesTrading/00078_13EN.pdf";
const CUSTODY = "Custody: HKD 0.15 per lot each half-year, min HKD 100.";

const BASE = {
  broker: "Public Bank (Hong Kong)",
  folder: "publichk",
  catalogueUrl: new URL("publichk-parsed.json", import.meta.url),
  url: URL_TARIFF,
  readOn: "2026-10-26",
  settlement: { rate: 0.000042, label: "frais de règlement CCASS" },
  perOrder: 0,
  cash: ["HKD", "USD", "CNH"],
  fxEach: null,
  remark: CUSTODY,
};

export const PLANS = [
  {
    id: "hk",
    label: "Hong Kong customers",
    schedule: { ...BASE, channel: "client résident à Hong Kong, ordre en ligne (internet, appli)", commission: { rate: 0.002, min: 68 } },
  },
  {
    id: "overseas",
    label: "Overseas customers",
    schedule: { ...BASE, channel: "client non résident à Hong Kong, tous canaux", commission: { rate: 0.005, min: 100 } },
  },
];
export const DEFAULT_PLAN = "hk";

export function planOf(id = DEFAULT_PLAN) {
  return PLANS.find((p) => p.id === String(id || DEFAULT_PLAN).toLowerCase()) || null;
}

export function roundTrip(query) {
  const plan = query.plan || DEFAULT_PLAN;
  const picked = planOf(plan);
  if (!picked) {
    return {
      usd: null,
      brokerFees: null,
      etf: query.etf,
      place: query.place,
      currency: query.currency,
      plan,
      onlineBuy: true,
      url: URL_TARIFF,
      why: `formule inconnue : ${plan} (${PLANS.map((p) => p.id).join("|")})`,
    };
  }
  return { ...hkexRoundTrip(picked.schedule, query), plan: picked.id };
}

printCli(import.meta.url, roundTrip);
