// The Colombo Stock Exchange transaction cost, shared by the Sri Lankan
// brokers whose only place is the CSE (Asia Securities, Bartleet Religare,
// John Keells Stock Brokers, NDB Securities, Capital TRUST). On an equity
// trade up to Rs. 100 million the whole bill is not the broker's to set:
// the exchange's table fixes it for every member firm. The five brokers
// print the same lines (Asia Securities, Bartleet Religare and NDB in
// their FAQ, John Keells on its brokerage page, Capital TRUST by pointing
// to the CSE page).
//
// Read on 2026-10-26, "Equity - with effect from 28th July 2025":
//
//   Each side, up to Rs. 100 million
//                 0.640 % brokerage
//                 0.084 % CSE, 0.012 % CDS, 0.012 % clearing (CSE Clear),
//                 0.072 % SEC cess, 0.300 % share transaction levy
//                 1.120 % together.
//   (Older broker pages print 0.024 % CDS: the same 0.024 % before the
//   clearing line was split out.)
//   Above Rs. 100 million the brokerage is on a step-up basis with a
//   0.20 % floor and no cap, negotiable from Rs. 1 billion (SEC directive
//   of 18 March 2024): no fixed figure, so such a trade answers N/A.
//   "the transaction fee due to the broker, CSE, CDS, CSE Clear and SEC
//   on intra day trades ... will not be charged on one side of the
//   transaction" and "Share Transaction Levy will be charged from both
//   sides": a same-day round trip saves 0.82 % once, not 1.12 %. The remark
//   gives that cut on the sell's own bill: 1.12 % → 0.30 %, "Same day sell
//   is 73% lower." (owner's rule, 2026-10-27: relative to the fee, whole
//   numbers from 10).
//
//   https://www.cse.lk/investors/transaction-costs
//   https://www.cse.lk/locales/en/transaction-cost.json  (the page's text)
//
//   import { cseRoundTrip, CSE_REMARK, CSE_SCHEDULE } from "../asialk/cseCost.mjs";
//   const bill = cseRoundTrip(notionalLkr);
//   // { ticket, brokerage, market, levy, other, rate, sides } in rupees,
//   // or { why } above Rs. 100 million or without a notional.
//
//   node brokers/asialk/cseCost.mjs 300000
//
// No network: the figures are constants.

import { pathToFileURL } from "node:url";

export const CSE_SCHEDULE = {
  url: "https://www.cse.lk/investors/transaction-costs",
  text: "https://www.cse.lk/locales/en/transaction-cost.json",
  readOn: "2026-10-26",
  inForceFrom: "2025-07-28",
};

export const CURRENCY = "LKR";

// Each side, up to Rs. 100 million.
export const CSE_LINES = {
  brokerage: 0.0064,
  cse: 0.00084,
  cds: 0.00012,
  clearing: 0.00012,
  secCess: 0.00072,
  levy: 0.003,
};

// Above Rs. 100 million, for the record only (the brokerage has no cap).
export const CSE_LINES_ABOVE = {
  brokerageFloor: 0.002,
  cse: 0.000525,
  cds: 0.000075,
  clearing: 0.000075,
  secCess: 0.00045,
  levy: 0.003,
};

const round = (x) => Number(x.toFixed(10));

export const CSE_BROKERAGE = CSE_LINES.brokerage;
// CSE, CDS, clearing and SEC cess: the exchange's own lines.
export const CSE_MARKET = round(CSE_LINES.cse + CSE_LINES.cds + CSE_LINES.clearing + CSE_LINES.secCess);
export const CSE_LEVY = CSE_LINES.levy;
// Everything but the brokerage: 0.48 %.
export const CSE_OTHER = round(CSE_MARKET + CSE_LEVY);
// The whole ticket each side: 1.12 %.
export const CSE_RATE = round(CSE_BROKERAGE + CSE_OTHER);
export const CSE_FIXED_UP_TO = 100_000_000;
export const CSE_NEGOTIABLE_FROM = 1_000_000_000;
// A same-day sell through the same broker pays only the levy: 0.82 % less,
// 73 % of the sell's 1.12 %.
export const CSE_SAME_DAY_SAVING = round(CSE_BROKERAGE + CSE_MARKET);
const sameDayCut = (100 * CSE_SAME_DAY_SAVING) / CSE_RATE;
export const CSE_REMARK = `Same day sell fees are ${sameDayCut >= 9.95 ? Math.round(sameDayCut) : Number(sameDayCut.toFixed(1))}% lower.`;

export const CSE_BASIS =
  "tableau des coûts de transaction du CSE, en vigueur depuis le 28 juillet 2025 : 0,64 % de courtage, 1,12 % avec les lignes du marché (CSE, CDS, compensation, SEC, taxe sur les transactions), à chaque sens, jusqu'à 100 millions de roupies";
export const CSE_ABOVE_WHY =
  "au-delà de 100 millions de roupies le courtage du CSE est progressif et négociable (plancher 0,20 %, sans plafond) : aucun chiffre publié";

/** One side (buy or sell) of `notional` rupees, or null when not fixed. */
export function cseSide(notional) {
  const v = Number(notional);
  if (!(v > 0) || v > CSE_FIXED_UP_TO) return null;
  return {
    notional: v,
    rate: CSE_RATE,
    ticket: v * CSE_RATE,
    brokerage: v * CSE_BROKERAGE,
    market: v * CSE_MARKET,
    levy: v * CSE_LEVY,
    other: v * CSE_OTHER,
  };
}

/**
 * Buy `notional` rupees and sell them back at the same price, two sides
 * (not the same-day exemption: that is CSE_REMARK). Amounts in rupees.
 */
export function cseRoundTrip(notional) {
  const v = Number(notional);
  if (!(v > 0)) return { why: "pas de montant" };
  if (v > CSE_FIXED_UP_TO) return { why: CSE_ABOVE_WHY, notional: v };
  const side = cseSide(v);
  return {
    notional: v,
    currency: CURRENCY,
    sides: 2,
    rate: CSE_RATE,
    ticket: side.ticket * 2,
    brokerage: side.brokerage * 2,
    market: side.market * 2,
    levy: side.levy * 2,
    other: side.other * 2,
    sameDaySaving: v * CSE_SAME_DAY_SAVING,
  };
}

function calledDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (calledDirectly()) {
  const notional = Number(process.argv[2] || 300000);
  const bill = cseRoundTrip(notional);
  console.log(`round trip on Rs. ${notional}:`);
  console.log(bill.why ? `N/A — ${bill.why}` : JSON.stringify(bill, null, 2));
  console.log(CSE_REMARK);
}
