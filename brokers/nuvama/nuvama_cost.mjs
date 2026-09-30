// What one round trip costs at Nuvama: buy n shares, sell them back,
// equity delivery, in dollars. Lite Plus and Elite bill a different
// brokerage, so each is a row.
//
// https://www.nuvamawealth.com/pricing read on 2026-09-28.
//   Lite Plus delivery        the lower of 2% and ₹20 per executed order
//   Elite delivery            0.30% per executed order, and at least the
//                             lower of ₹25 and 2.5% of the order
//   DP on a delivery sell     ₹20 per ISIN, both plans
//   Depository settlement     ₹4 NSDL or ₹5.50 CDSL per debit, not in the
//                             number: the page does not say which account
//   STT                       0.1% on the buy and on the sell
//   Stamp                     0.015% on the buy
//   SEBI                      ₹10 / crore
//   GST                       18% on brokerage, DP, exchange, SEBI and IPFT
//   NSE cash                  ₹306.99 / crore plus IPFT ₹0.01 / crore,
//                             circular NSE/FA/73061 from 1 March 2026
//   BSE cash                  0.00375%
//   The pricing page names the statutory levies and does not print these
//   percents. AMC, call-and-trade and the ₹10 pay-in stay out.
//
// No US stock in the catalogue. Nuvama Financial Services Inc. (FINRA
// CRD 172455) is the group's Rule 15a-6 chaperone in New York. It does
// not carry customer accounts and does not hold securities, so no Rule
// 606 mix is applied.
//   https://www.nuvama.com/disclaimer/
//   https://files.brokercheck.finra.org/firm/firm_172455.pdf
//
//   node nuvama/nuvama_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node nuvama/nuvama_cost.mjs RELIANCE NSE INR --shares=10 --price=1400 --plan=elite
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const REMARK = "Depository settlement fee is ₹4 at NSDL or ₹5.50 at CDSL.";

function schedule({ brokerageEach, basis }) {
  return {
    broker: "Nuvama",
    folder: "nuvama",
    catalogueUrl: new URL("nuvama-parsed.json", import.meta.url),
    url: "https://www.nuvamawealth.com/pricing",
    readOn: "2026-09-28",
    brokerageEach,
    txnRate: (exchange) => (exchange === "NSE" ? pct("0.0030699") : exchange === "BSE" ? pct("0.00375") : null),
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnIpft: true,
    gstOnDp: true,
    ipftRate: (exchange) => (exchange === "NSE" ? pct("0.0000001") : 0),
    dpInr: 20,
    basis,
    remark: REMARK,
    rule606: null,
  };
}

const PLANS = {
  lite: schedule({
    brokerageEach: (notional) => Math.min(20, notional * pct("2")),
    basis: "Courtage livraison Lite Plus : le plus bas de 2 % et 20 ₹ par ordre. DP 20 ₹ à la vente.",
  }),
  elite: schedule({
    brokerageEach: (notional) => Math.max(notional * pct("0.30"), Math.min(25, notional * pct("2.5"))),
    basis: "Courtage livraison Elite : 0,30 % par ordre, au moins le plus bas de 25 ₹ et 2,5 %. DP 20 ₹ à la vente.",
  }),
};

export function roundTrip(query) {
  const id = String(query.plan || "lite");
  return indiaRoundTrip(PLANS[id] || PLANS.lite, query);
}

printCli(import.meta.url, (query) => {
  const hit = process.argv.find((item) => item.startsWith("--plan="));
  return roundTrip({ ...query, plan: hit ? hit.slice("--plan=".length) : query.plan });
});
