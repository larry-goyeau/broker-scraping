// What one round trip costs at Nubra (Zanskar Securities): buy n shares,
// sell them back, equity delivery, in dollars.
//
// https://nubra.io/pricing read on 2026-10-18. The brokerage table and the
// statutory table are drawn on the page (the second one is the image
// /images/brokerage-plan-pricing.webp); the figures below are read off them.
//   Equity delivery             ₹0. "Both plans include same charges for
//                               Equity" (Per lot, the default, and Per Order)
//   Transaction                 NSE 0.00307%, BSE 0.00375%, buy and sell.
//                               "Transaction charge includes IPFT charges
//                               (Rs 0.01 per crore on Traded value + GST
//                               (NSE))", so IPFT is not added again. No BSE
//                               group split is printed.
//   STT                         0.1% on the buy and on the sell
//   SEBI                        ₹10 per crore, buy and sell
//   GST                         18% of brokerage + SEBI charges +
//                               transaction charges
//   Stamp                       0.015% on the buy
//   DP charges                  ₹12.50 + GST for every transaction in the
//                               scrip / ISIN, read as the debit on the sell
// Intraday: brokerage 0.03% of volume on each side (per-lot plan), plus
// GST; the law's intraday STT is 0.025% on the sell only and stamp 0.003%
// on the buy; no DP debit. The exchange and SEBI lines are the same as
// delivery. The remark is the gap between the two round trips at this
// order's notional.
// Account opening ₹0 for an individual. AMC ₹300 + GST, not the first
// year. Call & trade ₹20 + GST per executed order on top of brokerage.
// None of these is per trade. No US line.
//
//   node brokers/nubra/nubra_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/nubra/nubra_cost.mjs RELIANCE BSE INR --shares=10 --price=1400
//   node brokers/nubra/nubra_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, intradayBuySell, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const PAGE = "https://nubra.io/pricing";
const READ_ON = "2026-10-18";

const SCHEDULE = {
  broker: "Nubra",
  folder: "nubra",
  catalogueUrl: new URL("nubra-parsed.json", import.meta.url),
  url: PAGE,
  readOn: READ_ON,
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00307") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: false,
  gstOnDp: true,
  ipftRate: 0,
  dpInr: 12.5,
  basis:
    "Courtage livraison 0. DP 12,50 ₹ + GST par valeur à la vente. IPFT compris dans la transaction NSE 0,00307 % ; BSE 0,00375 %.",
  remark: "",
};

export function roundTrip(query) {
  return intradayBuySell(indiaRoundTrip(SCHEDULE, query), SCHEDULE, (notional) => notional * pct("0.03"));
}

function cli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (called && process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          broker: SCHEDULE.broker,
          url: PAGE,
          readOn: READ_ON,
          delivery: "0 ₹ (les deux plans)",
          transaction: { NSE: "0.00307% (IPFT compris)", BSE: "0.00375%" },
          stt: "0.1% achat et vente",
          stamp: "0.015% à l'achat",
          sebi: "10 ₹ / crore",
          gst: "18% sur courtage, SEBI et transaction",
          dp: "12,50 ₹ + GST par valeur à la vente",
          basis: SCHEDULE.basis,
          remark: SCHEDULE.remark,
        },
        null,
        2
      )
    );
    return;
  }
  printCli(import.meta.url, roundTrip);
}

cli();
