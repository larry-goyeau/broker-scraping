// What one round trip costs at Samco: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.samco.in/pricing read on 2026-10-18.
//   Delivery brokerage          the lower of ₹20 and 2.5% per executed order
//   STT                         0.1% (₹100 per lakh) on the buy and on the sell
//   Transaction                 NSE ₹3.07 per lakh (0.00307%).
//                               BSE groups A and B: ₹1 per trade.
//                               XC, XT, XD, Z and ZP: 0.1%.
//                               R and P: 1%.
//                               Every other group: 0.00375%.
//                               The group is the token before the ISIN on
//                               the catalogue line ("RELIANCE … BSE A INE…").
//   CM charges                  Nil on delivery
//   GST                         18% of brokerage, transaction, SEBI and CM
//   SEBI                        ₹0.10 per lakh (0.0001%)
//   Stamp                       0.015% on the buy
//   IPFT                        ₹0.01 per crore of traded value + GST
//   DP on a delivery sell       "Demat delivery charges – within SAMCO",
//                               ₹20 + applicable taxes, read as GST 18%
// Intraday is the lower of ₹20 and 0.25%. Demat AMC ₹400 + taxes a year,
// a payment-gateway pay-in ₹9, call-and-trade ₹50: none is per trade.
//
//   node brokers/samco/samco_cost.mjs RELIANCE NSE INR --shares=10 --price=1167.7
//   node brokers/samco/samco_cost.mjs RELIANCE BSE INR --shares=10 --price=1167.7

import { indiaRoundTrip, printCli, pct, sameDaySell, sebiRate } from "../../indianDelivery.mjs";

const CRORE = 10_000_000;
const BSE_PER_TRADE = new Set(["A", "B"]);
const BSE_POINT1 = new Set(["XC", "XT", "XD", "Z", "ZP"]);
const BSE_ONE = new Set(["R", "P"]);

// "… BSE <group> <ISIN>" on a BSE catalogue line.
function bseGroup(row) {
  const hit = String(row?.raw || "").match(/\bBSE\s+([A-Z]{1,2})\s+[A-Z]{2}[A-Z0-9]{9}\d\s*$/);
  return hit ? hit[1] : null;
}

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange !== "BSE") return null;
  const group = bseGroup(row);
  if (!group) return null;
  if (BSE_PER_TRADE.has(group)) return 0;
  if (BSE_POINT1.has(group)) return pct("0.1");
  if (BSE_ONE.has(group)) return pct("1");
  return pct("0.00375");
}

function txnEach(exchange, row) {
  return exchange === "BSE" && BSE_PER_TRADE.has(bseGroup(row)) ? 1 : null;
}

const SCHEDULE = {
  broker: "Samco",
  folder: "samco",
  catalogueUrl: new URL("samco-parsed.json", import.meta.url),
  url: "https://www.samco.in/pricing",
  readOn: "2026-10-18",
  brokerageEach: (notional) => Math.min(20, notional * pct("2.5")),
  txnRate,
  txnEach,
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: 0.01 / CRORE,
  dpInr: 20,
  basis:
    "Courtage livraison : le plus bas de 20 ₹ et 2,5 % par ordre. BSE groupes A et B : 1 ₹ de transaction par ordre. DP 20 ₹ + taxes à la vente.",
  remark: "",
};

export function roundTrip(query) {
  return sameDaySell(
    indiaRoundTrip(SCHEDULE, query),
    (notional) => Math.min(20, notional * pct("2.5")),
    (notional) => Math.min(20, notional * pct("0.25")),
  );
}

printCli(import.meta.url, roundTrip);
