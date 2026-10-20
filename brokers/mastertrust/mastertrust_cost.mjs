// What one round trip costs at mastertrust (Master Capital Services): buy n
// shares, sell them back, equity delivery, in dollars.
//
// https://mastertrust.co.in/pricing read on 2026-10-18. Two plans, each a
// row (`query.plan`):
//   mt20        MT20, "Flat Per-Order", ₹20 "Charges for per order". The
//               default. The brokerage calculator on
//               https://www.mastertrust.co.in/calculator/brokerage
//               ("Discount Broking" tab) puts ₹20 on each leg of an equity
//               order, delivery included.
//   mtclassic   MTClassic ("Freedom to choose your price"), a personalised
//               percentage negotiated with an RM; the pricing page prints
//               no figure. The same calculator's "Premium Broking" tab
//               shows 0.3% on delivery: that rate is priced, per order.
// The page's title says "Zero Brokerage on Delivery" while the description
// under it says zero on F&O: neither is a printed tariff, so ₹20 is kept.
// DP and every statutory line below are the same on both plans.
// "Brokerage will not exceed the SEBI prescribed limit" (site footer), read
// as the 2.5% ceiling: the lower of ₹20 and 2.5% on MT20.
//
// The DP schedule is page A22 of the account-opening kit
// https://master-trust-strapi.s3.ap-south-1.amazonaws.com/Master_Capital_Eq_Com_DP_04072026_5ba07d0057.pdf
// (linked from https://mastertrust.co.in/downloads, "KYC Combo Form"),
// "Schedule of Charges for DP services w.e.f 01/04/2026", Scheme-1:
//   Transaction charges         per debit transaction, including the
//                               depositories' charges: ₹15 within DP,
//                               ₹25 outside. A market sale goes to the
//                               broker's own pool account, so ₹15.
//   "Taxes and other government levies are extra": GST 18% on it.
// Page A21, the tariff sheet, leaves the brokerage boxes blank and says
// GST, STT and other taxes are "as per the provisions" of the Acts. The
// exchange lines are not printed anywhere on the site, so the delivery
// pass-through in force the same day is used, as for Nuvama:
//   STT                         0.1% on the buy and on the sell
//   Stamp                       0.015% on the buy
//   NSE cash                    ₹306.99 per crore, plus IPFT ₹0.01 per
//                               crore, circular NSE/FA/73061 from 1 March
//                               2026
//   BSE cash                    0.00375%, no group split
//   SEBI                        ₹10 per crore
//   GST                         18% on brokerage, DP, exchange, SEBI, IPFT
// AMC: first year free, then ₹300 a year (Scheme-1), zero when the year's
// brokerage passes ₹1,000. Not per trade. No US line.
//
//   node brokers/mastertrust/mastertrust_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/mastertrust/mastertrust_cost.mjs RELIANCE BSE INR --shares=10 --price=1400
//   node brokers/mastertrust/mastertrust_cost.mjs RELIANCE NSE INR --shares=10 --price=1400 --plan=mtclassic
//   node brokers/mastertrust/mastertrust_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const PAGE = "https://mastertrust.co.in/pricing";
const CALCULATOR = "https://www.mastertrust.co.in/calculator/brokerage";
const DP_SCHEDULE =
  "https://master-trust-strapi.s3.ap-south-1.amazonaws.com/Master_Capital_Eq_Com_DP_04072026_5ba07d0057.pdf";
const READ_ON = "2026-10-18";

const COMMON =
  "DP 15 ₹ + GST par débit à la vente. " +
  "Les frais de bourse ne sont pas publiés par mastertrust : NSE 306,99 ₹ par crore et IPFT, BSE 0,00375 %.";

function schedule({ name, url, delivery, brokerageEach, basis, remark }) {
  return {
    name,
    delivery,
    broker: "mastertrust",
    folder: "mastertrust",
    catalogueUrl: new URL("mastertrust-parsed.json", import.meta.url),
    url,
    readOn: READ_ON,
    brokerageEach,
    txnRate: (exchange) => (exchange === "NSE" ? pct("0.0030699") : exchange === "BSE" ? pct("0.00375") : null),
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnIpft: true,
    gstOnDp: true,
    ipftRate: (exchange) => (exchange === "NSE" ? pct("0.0000001") : 0),
    dpInr: 15,
    basis: `${basis} ${COMMON}`,
    remark: remark.join(" "),
  };
}

const PLANS = {
  mt20: schedule({
    name: "MT20",
    url: PAGE,
    delivery: "20 ₹ par ordre (au plus 2,5 %)",
    brokerageEach: (notional) => Math.min(20, notional * pct("2.5")),
    basis: "MT20 : courtage 20 ₹ par ordre, livraison comprise.",
    remark: [],
  }),
  mtclassic: schedule({
    name: "MTClassic",
    url: CALCULATOR,
    delivery: "0,3 % par ordre (calculateur, onglet Premium Broking)",
    brokerageEach: (notional) => notional * pct("0.3"),
    basis:
      "MTClassic : courtage livraison 0,3 % par ordre, taux tiré du calculateur de courtage du site (onglet « Premium Broking ») ; la page des tarifs n'imprime aucun chiffre pour ce plan.",
    remark: [],
  }),
};

export function roundTrip(query) {
  const id = String(query.plan || "mt20");
  return indiaRoundTrip(PLANS[id] || PLANS.mt20, query);
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
          broker: "mastertrust",
          url: [PAGE, CALCULATOR, DP_SCHEDULE],
          readOn: READ_ON,
          default: "mt20",
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([id, plan]) => [
              id,
              { plan: plan.name, url: plan.url, delivery: plan.delivery, basis: plan.basis, remark: plan.remark },
            ])
          ),
          transaction: { NSE: "306,99 ₹ / crore + IPFT 0,01 ₹ / crore", BSE: "0.00375%" },
          stt: "0.1% achat et vente",
          stamp: "0.015% à l'achat",
          sebi: "10 ₹ / crore",
          gst: "18% sur courtage, DP, transaction, SEBI et IPFT",
          dp: "15 ₹ + GST par débit à la vente (Scheme-1, dans le DP)",
        },
        null,
        2
      )
    );
    return;
  }
  const hit = process.argv.find((item) => item.startsWith("--plan="));
  printCli(import.meta.url, (query) => roundTrip({ ...query, plan: hit ? hit.slice("--plan=".length) : query.plan }));
}

cli();
