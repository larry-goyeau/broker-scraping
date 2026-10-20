// What one round trip costs at Kotak Securities (Kotak Neo): buy n shares,
// sell them back, equity delivery, in dollars. Three plans bill a
// different delivery brokerage, so each is a row (`query.plan`):
//   tradefree   Trade Free Plan, free "for lifetime", the plan a resident
//               individual gets from 30 years of age. The default.
//   youth       Trade Free Youth, under 30 only, ₹99 once at opening:
//               ₹0 on stock delivery, with no 30-day limit.
//               https://www.kotakneo.com/pricing/trade-free-youth/
//   pro         Trade Free Pro, ₹249 + GST a month: stock delivery 0.10%
//               per executed order (after 30 days at ₹0). The page prints
//               it as a brokerage row beside intraday and F&O, apart from
//               the MTF interest, so it is the cash delivery rate.
//               https://www.kotakneo.com/pricing/trade-free-pro/
// Opening fee and monthly fee stay out of the trip: each plan's remark
// names its own. The pages were read on 2026-10-18. ETFs, DP and the
// statutory lines below are the same on the three plans (the Youth page
// prints no ETF row, so the Trade Free ETF rates are kept there).
//
// https://www.kotakneo.com/pricing/trade-free-plan/ read on 2026-10-18.
//   Stock delivery              ₹0 for the first 30 days, then 0.20% per
//                               executed order
//   Liquid ETFs (delivery)      0.001% of the transaction value
//   All other ETFs (delivery)   0.05% of the transaction value
//                               An ETF is a line whose ISIN starts INF; a
//                               liquid one names LIQ in its ticker or name.
//   Transaction                 NSE 0.0030699% each side. BSE 0.00375%.
//                               BSE scrip groups X, XT and Z: 0.10%; P and
//                               ZP: 1%. The group is the token before the
//                               ISIN on the catalogue line ("… BSE A INE…").
//   STT                         0.1% on both sides
//   Stamp                       0.015% on the buy
//   SEBI                        ₹10 per crore
//   IPFT                        NSE only, ₹0.01 per crore each side
//   GST                         18% "on brokerage + transaction charges +
//                               SEBI fees". IPFT and DP are not in that list.
//   DP on a delivery sell       equity 0.04% of the value, minimum ₹20, per
//                               debit; mutual funds and all ETFs ₹0 for
//                               market trades. The page prints no GST on it,
//                               so none is added.
// The first 30 days at ₹0 are an offer, not the plan: the remark says so.
// AMC (₹0 for a BSDA holding up to ₹4 lakh, else ₹50 + GST a month above
// ₹1,000 of holdings), call & trade ₹49 + GST per order, net-banking pay-in
// ₹7 + GST: none is per trade. No US line in the catalogue.
//
//   node brokers/kotak/kotak_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/kotak/kotak_cost.mjs RELIANCE BSE INR --shares=10 --price=1400
//   node brokers/kotak/kotak_cost.mjs NIFTYBEES NSE INR --shares=10 --price=290
//   node brokers/kotak/kotak_cost.mjs RELIANCE NSE INR --shares=10 --price=1400 --plan=youth
//   node brokers/kotak/kotak_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, printCli, pct, rateGap, sebiRate } from "../../indianDelivery.mjs";

const CRORE = 10_000_000;
const PAGE = "https://www.kotakneo.com/pricing/trade-free-plan/";
const YOUTH_PAGE = "https://www.kotakneo.com/pricing/trade-free-youth/";
const PRO_PAGE = "https://www.kotakneo.com/pricing/trade-free-pro/";
const READ_ON = "2026-10-18";
const BSE_POINT1 = new Set(["X", "XT", "Z"]);
const BSE_ONE = new Set(["P", "ZP"]);

// "… BSE <group> <ISIN>" on a BSE catalogue line.
function bseGroup(row) {
  const hit = String(row?.raw || "").match(/\bBSE\s+([A-Z]{1,2})(?:\s+[A-Z]{2}[A-Z0-9]{9}\d)?\s*$/);
  return hit ? hit[1] : null;
}

function isEtf(row) {
  return /^INF/i.test(String(row?.isin || ""));
}

function isLiquidEtf(row) {
  return isEtf(row) && /LIQ/i.test(`${row?.ticker || ""} ${row?.name || ""}`);
}

// indiaRoundTrip hands the matched row to txnRate and brokerageEach, but not
// to dpInr. Both are called for the same row, in the same synchronous call,
// before dpInr, so the row is kept here for the DP line (₹0 on an ETF).
let current = null;

function txnRate(exchange, row) {
  current = row;
  if (exchange === "NSE") return pct("0.0030699");
  if (exchange !== "BSE") return null;
  const group = bseGroup(row);
  if (BSE_POINT1.has(group)) return pct("0.10");
  if (BSE_ONE.has(group)) return pct("1");
  return pct("0.00375");
}

// Intraday, all three plans: the lower of ₹10 and this percentage.
const INTRADAY = "0.05";

// Stock delivery per executed order, by plan. ETFs bill the same on all.
function brokerageOf(delivery) {
  return (notional, row) => {
    current = row;
    if (isLiquidEtf(row)) return notional * pct("0.001");
    if (isEtf(row)) return notional * pct("0.05");
    return notional * pct(delivery);
  };
}

function dpInr(notional) {
  if (isEtf(current)) return 0;
  return Math.max(20, notional * pct("0.04"));
}

const COMMON =
  "ETF 0,05 %, ETF monétaires 0,001 %. DP à la vente 0,04 %, minimum 20 ₹, 0 ₹ sur un ETF. " +
  "BSE groupes X, XT, Z : 0,10 % de transaction ; P, ZP : 1 %.";

function schedule({ name, url, delivery, basis, remark }) {
  return {
    name,
    delivery,
    broker: "Kotak Securities",
    folder: "kotak",
    catalogueUrl: new URL("kotak-parsed.json", import.meta.url),
    url,
    readOn: READ_ON,
    brokerageEach: brokerageOf(delivery),
    txnRate,
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnIpft: false,
    gstOnDp: false,
    ipftRate: (exchange) => (exchange === "NSE" ? 0.01 / CRORE : 0),
    dpInr,
    basis: `${basis} ${COMMON}`,
    remark: remark.join(" "),
  };
}

const intraday = (delivery) => `Intraday buy and sell is ${rateGap(pct(delivery), pct(INTRADAY))}.`;

const PLANS = {
  tradefree: schedule({
    name: "Trade Free Plan",
    url: PAGE,
    delivery: "0.20",
    basis: "Trade Free Plan : courtage livraison 0,20 % par ordre.",
    remark: ["₹0 brokerage for the first 30 days.", intraday("0.20")],
  }),
  youth: schedule({
    name: "Trade Free Youth",
    url: YOUTH_PAGE,
    delivery: "0",
    basis:
      "Trade Free Youth (moins de 30 ans, 99 ₹ à l'ouverture, hors de cet aller-retour) : courtage livraison 0 ₹. " +
      "La page Youth n'imprime pas de ligne ETF : taux ETF du Trade Free Plan.",
    remark: ["Under 30 only, ₹99 once at opening.", intraday("0")],
  }),
  pro: schedule({
    name: "Trade Free Pro",
    url: PRO_PAGE,
    delivery: "0.10",
    basis: "Trade Free Pro (249 ₹ + GST par mois, hors de cet aller-retour) : courtage livraison 0,10 % par ordre.",
    remark: ["₹249 + GST a month.", "₹0 brokerage for the first 30 days.", intraday("0.10")],
  }),
};

export function roundTrip(query) {
  const id = String(query.plan || "tradefree");
  return indiaRoundTrip(PLANS[id] || PLANS.tradefree, query);
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
          broker: "Kotak Securities",
          readOn: READ_ON,
          default: "tradefree",
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([id, plan]) => [
              id,
              {
                plan: plan.name,
                url: plan.url,
                delivery: { equity: `${plan.delivery}% par ordre`, etf: "0.05%", liquidEtf: "0.001%" },
                basis: plan.basis,
                remark: plan.remark,
              },
            ])
          ),
          firstDays: "0 ₹ les 30 premiers jours (Trade Free Plan et Pro)",
          intraday: "le plus bas de 10 ₹ et 0.05% par ordre",
          transaction: { NSE: "0.0030699%", BSE: "0.00375%", "BSE X, XT, Z": "0.10%", "BSE P, ZP": "1%" },
          stt: "0.1% achat et vente",
          stamp: "0.015% à l'achat",
          sebi: "10 ₹ / crore",
          ipft: "NSE 0.01 ₹ / crore par sens",
          gst: "18% sur courtage, transaction et SEBI",
          dp: "0.04% de la vente, minimum 20 ₹ ; 0 ₹ sur un ETF",
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
