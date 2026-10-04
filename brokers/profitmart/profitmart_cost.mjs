// What one round trip costs at Profitmart: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://profitmart.in/downloads/Forms/Brokerage_Modification_Form.pdf
// read on 2026-10-02. The Per Trade tariff on that form is
//   Delivery brokerage          0.20%
//   Intraday                    the lower of ₹20 and 0.01% per trade.
//                               That is another table.
// https://profitmart.in/downloads/Forms/Profitmart-Equity-KYC.pdf
// The percentage boxes on the mandatory sheet are blank. Statutory
// charges are "at the prevailing rates" and are not printed, so the
// equity-delivery pass-through in force the same day is used:
//   STT                         0.1% on the buy and on the sell
//   Stamp                       0.015% on the buy
//   Transaction                 NSE 0.00297%, BSE 0.00375%
//   SEBI                        ₹10 / crore
//   GST                         18% of brokerage, the exchange charge,
//                               SEBI, and the delivery debit
//   IPFT                        not printed, so none is added
//   Delivery debit              ₹17 per script on the sell
// Mobile trading is ₹2 a trade and stays out. There is no US line, so
// no Rule 606 mix is applied.
//
//   node brokers/profitmart/profitmart_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const SCHEDULE = {
  broker: "Profitmart",
  folder: "profitmart",
  catalogueUrl: new URL("profitmart-parsed.json", import.meta.url),
  url: "https://profitmart.in/downloads/Forms/Brokerage_Modification_Form.pdf",
  readOn: "2026-10-02",
  brokerageEach: (notional) => notional * pct("0.20"),
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  ipftRate: () => 0,
  dpInr: 17,
  basis: "Courtage livraison 0,20 % par ordre, tarif Per Trade. Débit de livraison 17 ₹ par titre à la vente, plus GST.",
  remark: "Intraday is the lower of ₹20 and 0.01% per trade.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
