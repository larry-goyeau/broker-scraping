// What one round trip costs at JM Financial (JM Financial Services Ltd):
// buy n shares, sell them back, in dollars. Online delivery. Not intraday,
// not F&O.
//
// JM Financial Services' online platform is BlinkX, and BlinkX's charges
// are JM's tariff (the same company as ../blinkx; this file reads the same
// pages). An account is opened on one of two plans, each a row
// (`query.plan`):
//   payperorder   Pay-Per-Order, ₹20 per order. The default.
//   subscription  Silver to Titanium, 2 to 12 months (the charges page
//                 prints no price): "Zero brokerage up to ₹25 crore in Cash
//                 ... After the turnover limit, standard brokerage applies:
//                 Cash Delivery 0.25%". One round trip is inside the ₹25
//                 crore: ₹0.
//
// India, https://blinkx.in/pay-per-order and https://www.blinkx.in/charges
// read on 2026-10-26.
//   Brokerage, delivery         ₹20 per order; "Brokerage will not exceed
//                               the rates specified by SEBI": the lower of
//                               ₹20 and 2.5%, as at ../blinkx
//   SEBI                        0.0001% on both sides
//   Transaction                 0.00307% on both sides (NSE). BSE, from
//                               "Charges Explained": A, B and the non-
//                               exclusive scrips of E, F, FC, G, GC, W, T
//                               ₹375 per crore; XC, XD (now X), XT, Z, ZP
//                               ₹10,000; SS, ST ₹1,00,000. Another group
//                               (M, MT, P …) has no printed rate: `why`.
//   STT                         0.10% on both sides
//   Stamp                       0.015% on the buy
//   IPFT                        0.000001% on both sides
//   PCM                         zero
//   GST                         "Goods & Service Tax (GST) / other levies
//                               would be extra as applicable": 18% on
//                               brokerage, DP, transaction, SEBI and IPFT
//   Demat transaction           "₹ 30 on sell transaction" (demat table)
//   AMC                         zero
// Intraday is the same ₹20 (Pay-Per-Order) or ₹0 (Subscription): no same
// day remark.
//
// United States, https://www.jmfinancialservices.in/invest-in-us-investing
// read on 2026-10-26: "Invest in US stocks and ETFs via our partner
// Stockal". Neither JM nor Stockal prints a commission: JM's page names no
// fee, and Stockal's live site (stockal.com, a script-only page) and its
// help centre show none; the per-trade plans quoted by third parties
// ($2.99 a trade, ₹3,999 / ₹13,999 a year) are old reviews, not Stockal's
// page. The US lines stay N/A (`why`). Stand-in to propose: none in the
// group; Stockal clears at DriveWealth, which prints no retail tariff.
//
//   node brokers/jmfinancial/jmfinancial_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/jmfinancial/jmfinancial_cost.mjs INE002A01018 BSE INR --shares=10 --price=1400 --plan=subscription
//   node brokers/jmfinancial/jmfinancial_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, sebiRate } from "../../indianDelivery.mjs";
import { bseGroup, catalogueRows, cliArgs, code, goesToIndia, usRoundTrip } from "../bajaj/indiaAbroad.mjs";

const CATALOGUE = new URL("jmfinancial-parsed.json", import.meta.url);
const PAGE = "https://blinkx.in/pay-per-order";
const CHARGES = "https://www.blinkx.in/charges";
const US_PAGE = "https://www.jmfinancialservices.in/invest-in-us-investing";
const READ_ON = "2026-10-26";

const BSE_FLAT = new Set(["A", "B"]);
const BSE_NON_EXCLUSIVE = new Set(["E", "F", "FC", "G", "GC", "W", "T"]);
const BSE_POINT1 = new Set(["X", "XC", "XD", "XT", "Z", "ZP"]);
const BSE_ONE = new Set(["SS", "ST"]);

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange !== "BSE") return null;
  const group = bseGroup(row);
  if (BSE_FLAT.has(group)) return pct("0.00375");
  if (BSE_NON_EXCLUSIVE.has(group) && catalogueRows(CATALOGUE)?.nse?.has(code(row?.isin))) return pct("0.00375");
  if (BSE_POINT1.has(group)) return pct("0.1");
  if (BSE_ONE.has(group)) return pct("1");
  return null;
}

const COMMON =
  "DP 30 ₹ + GST à la vente. " +
  "BSE : groupes A, B et E, F, FC, G, GC, W, T aussi cotés sur NSE 0,00375 % ; X, XT, Z, ZP 0,1 % ; SS, ST 1 % ; les autres groupes n'ont pas de taux publié.";

function schedule({ url, brokerageEach, basis, remark }) {
  return {
    broker: "JM Financial",
    folder: "jmfinancial",
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
    basis: `BlinkX (JM Financial Services). ${basis} ${COMMON}`,
    remark,
  };
}

const PLANS = {
  payperorder: schedule({
    url: PAGE,
    brokerageEach: (notional) => Math.min(20, notional * pct("2.5")),
    basis: "Pay-Per-Order : courtage livraison 20 ₹ par ordre (au plus 2,5 %).",
    remark: "",
  }),
  subscription: schedule({
    url: CHARGES,
    brokerageEach: () => 0,
    basis:
      "Abonnement (2 à 12 mois, prix non imprimé, hors de cet aller-retour) : courtage livraison 0 ₹ jusqu'à 25 crore ₹ de volume cash, puis 0,25 % ; un aller-retour reste sous ce seuil.",
    remark: "Subscription fee (2 to 12 months) is extra; delivery is 0.25% above ₹25 crore of cash volume.",
  }),
};

const US = {
  broker: "JM Financial",
  folder: "jmfinancial",
  catalogueUrl: CATALOGUE,
  url: US_PAGE,
  readOn: READ_ON,
  dealer: null,
  basis: `Stockal (partenaire US de JM Financial), page relue le ${READ_ON}.`,
  noTariff: () =>
    "ni JM Financial ni Stockal n'impriment de commission pour les actions US (page US de JM sans tarif ; site et centre d'aide Stockal sans barème)",
};

export function roundTrip(query) {
  const id = String(query.plan || "payperorder").toLowerCase();
  if (goesToIndia(catalogueRows(CATALOGUE), query)) return indiaRoundTrip(PLANS[id] || PLANS.payperorder, query);
  return usRoundTrip(US, query);
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) console.log(JSON.stringify(roundTrip(cliArgs()), null, 2));
