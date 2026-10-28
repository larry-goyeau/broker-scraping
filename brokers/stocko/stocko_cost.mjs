// What one round trip costs at Stocko (South Asian Stocks Ltd, "SAS
// Online"): buy n shares, sell them back, equity delivery, in dollars.
//
// https://stocko.in/support/per-trade-and-monthly-brokerage-plans/ and
// https://stocko.in/support/stocko-account-opening-brokerage-and-other-charges-details/
// read on 2026-10-18 (both "Published Oct 12, 2024").
// Two plans, each a row (`query.plan`):
//   pertrade   Per Trade, the default: "₹12.99 per executed order or 0.1%,
//              whichever is lower" on delivery.
//   monthly    ₹1,299 a month for 99 orders (EQ/F&O), then ₹2.99 an order.
//              One round trip is two of the 99 included orders, so its
//              brokerage is ₹0. The monthly fee and the ₹2.99 overflow
//              stay out of the trip; the remark names them. The page
//              prints no intraday rate for this plan.
// The plans page charges exchange, transaction and statutory levies "as
// per applicable rates" with no split by plan, and names no other DP
// line: both plans share every line below except brokerage.
//   Delivery brokerage          Per Trade plan: "₹12.99 per executed order
//                               or 0.1%, whichever is lower"
//   STT                         0.1% on both buy and sell
//   Transaction                 Rs.297/crore (0.00297%), the figure the
//                               page prints, used on NSE.
//                               BSE: ₹375 per crore on groups A, B and T.
//                               MS, TS, M, MT, IF, IT, X, XT, Z, ZP, P, R,
//                               XC and XD "attract higher transaction
//                               charges as levied by the exchange", with no
//                               figure: those lines, and any other group,
//                               answer with a `why`. The group is the token
//                               before the ISIN on the catalogue line.
//   PCM                         included in transaction charges
//   GST                         18% on brokerage + transaction + SEBI
//   SEBI                        ₹10 per crore
//   Stamp                       0.015% on the buy
//   IPFT                        not printed, so none is added
//   DP on a delivery sell       ₹15 + 18% GST per script
// Trading account opening ₹200, AMC ₹200 + GST a year from the second
// year, call & trade ₹20 + GST per order: none is per trade. No US line.
// Per Trade remark: "Intraday buy and sell fees are x% lower.", the intraday
// brokerage (the lower of ₹12.99 and 0.01%) as a cut of the delivery one,
// at this order (90% at the bare rates; less once ₹12.99 caps delivery).
//
//   node brokers/stocko/stocko_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/stocko/stocko_cost.mjs RELIANCE BSE INR --shares=10 --price=1400
//   node brokers/stocko/stocko_cost.mjs RELIANCE NSE INR --shares=10 --price=1400 --plan=monthly
//   node brokers/stocko/stocko_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const PLANS_PAGE = "https://stocko.in/support/per-trade-and-monthly-brokerage-plans/";
const CHARGES_PAGE = "https://stocko.in/support/stocko-account-opening-brokerage-and-other-charges-details/";
const READ_ON = "2026-10-18";
const CRORE = 10_000_000;
const BSE_FLAT = new Set(["A", "B", "T"]);

// "… BSE <group> <ISIN>" on a BSE catalogue line. One line has no ISIN.
function bseGroup(row) {
  const hit = String(row?.raw || "").match(/\bBSE\s+([A-Z]{1,2})(?:\s+[A-Z]{2}[A-Z0-9]{9}\d)?\s*$/);
  return hit ? hit[1] : null;
}

function txnRate(exchange, row) {
  if (exchange === "NSE") return 297 / CRORE;
  if (exchange !== "BSE") return null;
  return BSE_FLAT.has(bseGroup(row)) ? 375 / CRORE : null;
}

// Per Trade plan, each order: the lower of ₹12.99 and this percentage.
const DELIVERY = "0.1";
const INTRADAY = "0.01";
const CAP = 12.99;
const perTrade = (rate) => (notional) => Math.min(CAP, notional * pct(rate));

// The intraday brokerage as a cut of the delivery one, at `notional`, or at
// the bare rates when no order is known.
function intradayRemark(notional) {
  const d = notional > 0 ? perTrade(DELIVERY)(notional) : pct(DELIVERY);
  const i = notional > 0 ? perTrade(INTRADAY)(notional) : pct(INTRADAY);
  const x = ((d - i) / d) * 100;
  const v = x >= 10 ? Math.round(x) : Number(x.toFixed(1));
  return v > 0 ? `Intraday buy and sell fees are ${v}% lower.` : "";
}

const COMMON =
  "DP 15 ₹ + GST par valeur à la vente. " +
  "Transaction 297 ₹ par crore sur NSE ; BSE 375 ₹ par crore sur les groupes A, B et T, les autres groupes n'ont pas de taux publié.";

function schedule({ name, delivery, brokerageEach, basis, remark }) {
  return {
    name,
    delivery,
    broker: "Stocko",
    folder: "stocko",
    catalogueUrl: new URL("stocko-parsed.json", import.meta.url),
    url: CHARGES_PAGE,
    readOn: READ_ON,
    brokerageEach,
    txnRate,
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnIpft: false,
    gstOnDp: true,
    ipftRate: 0,
    dpInr: 15,
    basis: `${basis} ${COMMON}`,
    remark: remark.join(" "),
  };
}

const PLANS = {
  pertrade: schedule({
    name: "Per Trade",
    delivery: "le plus bas de 12,99 ₹ et 0,1 % par ordre",
    brokerageEach: perTrade(DELIVERY),
    basis: "Plan par ordre : courtage livraison le plus bas de 12,99 ₹ et 0,1 % par ordre.",
    remark: [intradayRemark(null)],
  }),
  monthly: schedule({
    name: "Monthly",
    delivery: "0 ₹ dans les 99 ordres du mois, puis 2,99 ₹ par ordre",
    brokerageEach: () => 0,
    basis:
      "Plan mensuel (1 299 ₹ par mois pour 99 ordres, hors de cet aller-retour) : courtage 0 ₹ dans les 99 ordres inclus, puis 2,99 ₹ par ordre.",
    remark: ["₹1,299 a month for 99 orders, then ₹2.99 per order."],
  }),
};

export function roundTrip(query) {
  const id = String(query.plan || "pertrade");
  const plan = PLANS[id] || PLANS.pertrade;
  const out = indiaRoundTrip(plan, query);
  const notional = Number(out?.trade?.notional);
  if (plan !== PLANS.pertrade || !(notional > 0) || !plan.remark || typeof out.remark !== "string") return out;
  return { ...out, remark: out.remark.replace(plan.remark, intradayRemark(notional)) };
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
          broker: "Stocko",
          url: [PLANS_PAGE, CHARGES_PAGE],
          readOn: READ_ON,
          default: "pertrade",
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([id, plan]) => [
              id,
              { plan: plan.name, delivery: plan.delivery, basis: plan.basis, remark: plan.remark },
            ])
          ),
          transaction: { NSE: "297 ₹ / crore", "BSE A, B, T": "375 ₹ / crore", "BSE autres groupes": "non publié" },
          stt: "0.1% achat et vente",
          stamp: "0.015% à l'achat",
          sebi: "10 ₹ / crore",
          ipft: "non publié",
          gst: "18% sur courtage, transaction et SEBI",
          dp: "15 ₹ + 18% GST par valeur à la vente",
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
