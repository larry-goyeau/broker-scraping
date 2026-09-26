// What one round trip costs at 5paisa: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.5paisa.com/open-demat-account-1 read on 2026-09-25.
//   Optimum                      ₹20 per executed order, no monthly pack
//   Power Investor               ₹499 per month, ₹10 per executed order
//   Ultra Trader                 ₹999 per month, ₹0 brokerage on delivery
// The monthly pack is not part of this trip. It is only named in the remark.
// The tariff says statutory levies are charged as in force and does not
// reprint the percentages. The rates below are the equity-delivery rates
// the exchange pass-through tables print on the same day: STT 0.1% both
// sides, stamp 0.015% on the buy, NSE 0.00307%, BSE group A and B
// 0.00375%, SEBI ₹10 / crore, GST 18% of brokerage + SEBI + transaction.
// The DP rupee amount is left out.
//
//   node 5paisa/5paisa_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const SEBI_CAP = 0.025;

function schedule({ brokerageEach, basis, remark }) {
  return {
    broker: "5paisa",
    folder: "5paisa",
    catalogueUrl: new URL("5paisa-parsed.json", import.meta.url),
    url: "https://www.5paisa.com/brokerage-charges",
    readOn: "2026-09-25",
    brokerageEach,
    txnRate: (exchange) => (exchange === "NSE" ? pct("0.00307") : exchange === "BSE" ? pct("0.00375") : null),
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    basis,
    remark,
  };
}

const PLANS = {
  optimum: schedule({
    brokerageEach: (notional) => Math.min(20, notional * SEBI_CAP),
    basis: "Plan Optimum : 20 ₹ par ordre, plafond réglementaire. Pas d'abonnement.",
    remark: "",
  }),
  power: schedule({
    brokerageEach: (notional) => Math.min(10, notional * SEBI_CAP),
    basis: "Power Investor : 499 ₹ par mois, hors de cet aller-retour. Courtage 10 ₹ par ordre, plafond réglementaire.",
    remark: "₹499/month.",
  }),
  ultratrader: schedule({
    brokerageEach: () => 0,
    basis: "Ultra Trader : 999 ₹ par mois, hors de cet aller-retour. Courtage livraison 0.",
    remark: "₹999/month.",
  }),
};

export function roundTrip(query) {
  const id = String(query.plan || "optimum");
  return indiaRoundTrip(PLANS[id] || PLANS.optimum, query);
}

printCli(import.meta.url, roundTrip);
