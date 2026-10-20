// What one round trip costs at BlinkX (JM Financial Services): buy n
// shares, sell them back, equity delivery, in dollars.
//
// An account is opened on one of two plans, chosen at opening. Each is a
// row (`query.plan`):
//   payperorder   Pay-Per-Order, ₹20 per order. The default.
//   subscription  a fee for a period (Silver to Titanium, 2 to 12 months;
//                 https://blinkx.in/charges prints no price) with ₹0
//                 brokerage up to ₹25 crore of cash turnover, then 0.25%
//                 on delivery. One round trip is inside the ₹25 crore, so
//                 its brokerage is ₹0. The fee is not per trade: it stays
//                 out of the trip and the remark names it.
// The charges page heads the levies "Other Common Charges" and says
// statutory charges are levied at actuals; the demat table does not split
// by plan. Both plans therefore share every line below except brokerage.
//
// https://blinkx.in/pay-per-order read on 2026-10-18.
//   Brokerage, equity delivery  ₹20 per order. "Brokerage will not exceed
//                               the rates specified by SEBI", read as the
//                               2.5% ceiling: the lower of ₹20 and 2.5%.
//   SEBI                        0.0001% on both sides
//   Transaction                 0.00307% on both sides (NSE)
//                               BSE, from "Charges Explained":
//                               A, B and the non-exclusive scrips of
//                               groups E, F, FC, G, GC, W and T: ₹375 per
//                               crore (0.00375%).
//                               XC, XD (now X), XT, Z and ZP: ₹10,000 per
//                               crore (0.1%).
//                               SS and ST: ₹1,00,000 per crore (1%).
//                               A scrip is non-exclusive when the same ISIN
//                               also trades on NSE in this catalogue. Any
//                               other group (M, MT, P…) has no printed rate
//                               and answers with a `why`. The group is the
//                               token before the ISIN on the catalogue line.
//   STT                         0.10% on both sides
//   Stamp                       0.015% on the buy
//   IPFT                        0.000001% on both sides
//   PCM                         zero
//   GST                         "Goods & Service Tax (GST) / other levies
//                               would be extra as applicable": 18% on
//                               brokerage, DP, transaction, SEBI and IPFT.
// https://blinkx.in/charges read on 2026-10-18 (demat table).
//   Demat transaction           ₹30 on a sell transaction
//   AMC                         zero
// A delivery contract note carries at least ₹0.05; a physical contract
// note ₹20 plus courier. Neither is in the number. No US line.
//
//   node brokers/blinkx/blinkx_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/blinkx/blinkx_cost.mjs RELIANCE BSE INR --shares=10 --price=1400
//   node brokers/blinkx/blinkx_cost.mjs RELIANCE NSE INR --shares=10 --price=1400 --plan=subscription
//   node brokers/blinkx/blinkx_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const PAGE = "https://blinkx.in/pay-per-order";
const CHARGES = "https://blinkx.in/charges";
const READ_ON = "2026-10-18";
const CATALOGUE = new URL("blinkx-parsed.json", import.meta.url);

const BSE_FLAT = new Set(["A", "B"]);
const BSE_NON_EXCLUSIVE = new Set(["E", "F", "FC", "G", "GC", "W", "T"]);
const BSE_POINT1 = new Set(["X", "XC", "XD", "XT", "Z", "ZP"]);
const BSE_ONE = new Set(["SS", "ST"]);

// ISINs that also trade on NSE: a BSE line in one of these is non-exclusive.
let nseIsins = null;
function onNse(isin) {
  if (!nseIsins) {
    nseIsins = new Set();
    try {
      const rows = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
      for (const r of Array.isArray(rows) ? rows : rows?.rows || []) {
        if (r.exchange === "NSE" && r.isin) nseIsins.add(String(r.isin).toUpperCase());
      }
    } catch {
      // No catalogue: indiaRoundTrip answers that on its own.
    }
  }
  return nseIsins.has(String(isin || "").toUpperCase());
}

// "… BSE <group> <ISIN>" on a BSE catalogue line.
function bseGroup(row) {
  const hit = String(row?.raw || "").match(/\bBSE\s+([A-Z]{1,2})(?:\s+[A-Z]{2}[A-Z0-9]{9}\d)?\s*$/);
  return hit ? hit[1] : null;
}

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange !== "BSE") return null;
  const group = bseGroup(row);
  if (BSE_FLAT.has(group)) return pct("0.00375");
  if (BSE_NON_EXCLUSIVE.has(group) && onNse(row?.isin)) return pct("0.00375");
  if (BSE_POINT1.has(group)) return pct("0.1");
  if (BSE_ONE.has(group)) return pct("1");
  return null;
}

const COMMON =
  "DP 30 ₹ + GST à la vente. " +
  "BSE : groupes A, B et E, F, FC, G, GC, W, T aussi cotés sur NSE 0,00375 % ; X, XT, Z, ZP 0,1 % ; SS, ST 1 % ; les autres groupes n'ont pas de taux publié.";

function schedule({ name, url, delivery, brokerageEach, basis, remark }) {
  return {
    name,
    delivery,
    broker: "BlinkX",
    folder: "blinkx",
    catalogueUrl: CATALOGUE,
    url,
    readOn: READ_ON,
    brokerageEach,
    txnRate,
    sttRate: pct("0.10"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnIpft: true,
    gstOnDp: true,
    ipftRate: pct("0.000001"),
    dpInr: 30,
    basis: `${basis} ${COMMON}`,
    remark: remark.join(" "),
  };
}

const PLANS = {
  payperorder: schedule({
    name: "Pay-Per-Order",
    url: PAGE,
    delivery: "20 ₹ par ordre (au plus 2,5 %)",
    brokerageEach: (notional) => Math.min(20, notional * pct("2.5")),
    basis: "Pay-Per-Order : courtage livraison 20 ₹ par ordre.",
    remark: [],
  }),
  subscription: schedule({
    name: "Subscription",
    url: CHARGES,
    delivery: "0 ₹ jusqu'à 25 crore ₹ de volume cash, puis 0,25 %",
    brokerageEach: () => 0,
    basis:
      "Abonnement (2 à 12 mois, prix hors de cet aller-retour) : courtage livraison 0 ₹ jusqu'à 25 crore ₹ de volume cash, puis 0,25 % ; un aller-retour reste sous ce seuil.",
    remark: ["Subscription fee (2 to 12 months) is extra; delivery is 0.25% above ₹25 crore of cash volume."],
  }),
};

export function roundTrip(query) {
  const id = String(query.plan || "payperorder");
  return indiaRoundTrip(PLANS[id] || PLANS.payperorder, query);
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
          broker: "BlinkX",
          url: [PAGE, CHARGES],
          readOn: READ_ON,
          default: "payperorder",
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([id, plan]) => [
              id,
              { plan: plan.name, url: plan.url, delivery: plan.delivery, basis: plan.basis, remark: plan.remark },
            ])
          ),
          transaction: {
            NSE: "0.00307%",
            "BSE A, B, et E/F/FC/G/GC/W/T non exclusifs": "0.00375%",
            "BSE X, XC, XD, XT, Z, ZP": "0.1%",
            "BSE SS, ST": "1%",
            "BSE autres groupes": "non publié",
          },
          stt: "0.10% achat et vente",
          stamp: "0.015% à l'achat",
          sebi: "0.0001% par sens",
          ipft: "0.000001% par sens",
          gst: "18% (« extra as applicable »)",
          dp: "30 ₹ à la vente",
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
