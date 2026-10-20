// What one round trip costs at Nirmal Bang (Nirmal Bang Securities Pvt.
// Ltd.): buy n shares, sell them back, equity delivery, in dollars.
//
// Nirmal Bang publishes no brokerage for a new online account.
// https://www.nirmalbang.com/static/policies-and-procedures.aspx read on
// 2026-10-18, section 5.1 "Brokerage Charges": "As mentioned in your
// submitted Account opening form". The online opening flow
// (https://kyc.nirmalbang.com/) shows only the operating instructions and
// the DP tariff sheet; the brokerage is set inside the form, behind an OTP,
// and no plan page, calculator or tariff exists on nirmalbang.com. The
// figures on review sites are not the broker's page and are not used. So
// every line answers N/A with a `why`, never an invented brokerage.
//
// What is printed, kept in `basis` for the day a brokerage is published:
// https://kyc.nirmalbang.com/Images/AMC___Charges.pdf ("Rate structure for
// depository services wef 21/07/2025", read on 2026-10-18 from the
// 2026-04-26 web.archive.org copy; the host refused connections that day)
//   Equities transfer fees, market & off market, per transaction:
//                               the higher of ₹15 and 0.03%
//   Pay-in charge from 22 August 2025: ₹4 per ISIN (sell quantity), on the
//                               contract note
//   "GST extra as applicable". AMC ₹200 a year upfront, or ₹1,000 for life.
// Section 5.2 of the policy page: "Transaction charges as levied by
// exchanges", "GST on brokerage and transaction charges", "SEBI Turnover
// Fees and Stamp Duty", no rates.
//
//   node brokers/nirmalbang/nirmalbang_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/nirmalbang/nirmalbang_cost.mjs RELIANCE BSE INR --shares=10 --price=1400
//   node brokers/nirmalbang/nirmalbang_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const POLICY = "https://www.nirmalbang.com/static/policies-and-procedures.aspx";
const DP_TARIFF = "https://kyc.nirmalbang.com/Images/AMC___Charges.pdf";
const READ_ON = "2026-10-18";
const NOT_PUBLISHED =
  "Nirmal Bang ne publie pas de courtage livraison : il est fixé dans le formulaire d'ouverture (politique, section 5.1)";

// The schedule only resolves the listing and its book; the brokerage is
// unknown, so the number is withheld below whatever this computes.
const SCHEDULE = {
  broker: "Nirmal Bang",
  folder: "nirmalbang",
  catalogueUrl: new URL("nirmalbang-parsed.json", import.meta.url),
  url: POLICY,
  readOn: READ_ON,
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" || exchange === "BSE" ? 0 : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  dpInr: (notional) => Math.max(15, notional * pct("0.03")) + 4,
  basis:
    "Courtage livraison non publié. DP à la vente : le plus haut de 15 ₹ et 0,03 %, plus 4 ₹ de pay-in par ISIN, plus GST.",
  remark: "",
};

export function roundTrip(query) {
  const out = indiaRoundTrip(SCHEDULE, query);
  // No listing, or a line outside the NSE/BSE equity table: that answer stands.
  if (!out.listing || /barème/.test(out.why || "")) return out;
  const { trade, commission, ...rest } = out;
  return { ...rest, usd: null, brokerFees: null, why: NOT_PUBLISHED };
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
          url: [POLICY, DP_TARIFF],
          readOn: READ_ON,
          delivery: "non publié (« As mentioned in your submitted Account opening form »)",
          dp: "le plus haut de 15 ₹ et 0,03 % par transaction, + 4 ₹ de pay-in par ISIN vendu, + GST",
          statutory: "transaction, GST, SEBI, stamp : nommés, sans taux",
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
