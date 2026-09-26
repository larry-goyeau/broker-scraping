// What one round trip costs at Zebu: buy n shares, sell them back,
// equity delivery, in dollars.
//
// The tariff a client signs, page 10 of
// https://cms.zebuetrade.com/wp-content/uploads/2025/09/Trading-Demat-KYC-1.pdf
// read on 2026-09-26.
//   Delivery brokerage          0.5%
//   Intraday                    0.05%
//   GST                         18% of brokerage, SEBI and the transaction charge
//   Statutory charges           as per the rules
// The on-market DP debit cell is blank. The minimum printed beside it is ₹25.
// Off-market is 0.03% with the same ₹25 minimum, which is not this trade.
// AMC is ₹300 a year, or ₹1,111 once.
//
// The public calculator (https://zebuetrade.com/calculators/brokerage) is a
// separate preset, flat ₹20 or 0.3%, and it is not the signed tariff. Its
// delivery statutory lines are the ones used below, because the tariff says
// "as per the rules" and does not print them:
//   STT                         0.1% on the buy and on the sell
//   Transaction                 0.00307% on the combined turnover, one rate
//   SEBI                        ₹10 / crore
//   Stamp                       0.015% on the buy
//   IPFT                        not printed
//
//   node zebu/zebu_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const SCHEDULE = {
  broker: "Zebu",
  folder: "zebu",
  catalogueUrl: new URL("zebu-parsed.json", import.meta.url),
  url: "https://cms.zebuetrade.com/wp-content/uploads/2025/09/Trading-Demat-KYC-1.pdf",
  readOn: "2026-09-26",
  brokerageEach: (notional) => notional * pct("0.5"),
  txnRate: (exchange) => (exchange === "NSE" || exchange === "BSE" ? pct("0.00307") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  basis: "Courtage livraison 0,5 % par ordre, tarif signé.",
  remark:
    "Intraday is 0.05% per executed order. AMC is ₹300 a year, or ₹1,111 once. The on-market DP debit is blank on the tariff, with a ₹25 minimum.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
