// What one round trip costs at Univest (Univest Stock Broking Private
// Limited): buy n shares, sell them back, equity delivery, online, in
// dollars. NSE and BSE, rupees only.
//
// https://univest.in/pricing read on 2026-10-21. The tables are pictures
// (assets.univest.in/pricing_page/equity_pricing.png,
// regulatory_pricing_0.png, other_charges_pricing.png); the
// policies-and-procedures PDF linked from https://univest.in/stock-broker
// names that page as its charge list (Annexure 1).
//   Delivery brokerage   "₹0 Brokerage with broking subscription plans or
//                        otherwise ₹20 or 0.1% per executed order
//                        whichever is lower". The plans are prepaid packs
//                        of trades bought in the app; their prices are not
//                        published (help page "Discounted Brokerage Plans":
//                        "as low as ₹5 per order", GST and levies on top),
//                        so the standard line is the one priced here.
//   Intraday             ₹20 per executed order (remark only).
//   STT                  0.1% on the buy and on the sell
//   Transaction          NSE 0.00322%, BSE 0.00375% of turnover; "BSE group
//                        wise transaction charges: As per circular"
//   SEBI                 0.0001% of turnover
//   Stamp                0.015% on the buy
//   DP                   "Flat ₹20" on a delivery sell, plus GST ("18% GST
//                        will be levied wherever applicable")
//   GST                  18% of brokerage, transaction and SEBI charges
//   IPFT                 not printed: 0, as in the other files.
//   Account maintenance  ₹35, none on a BSDA account holding up to ₹10 lakh;
//                        the period is not printed. Not in this trip.
// The BSE group table is the BSE's own (notice 20221109-7, as in
// brokers/lemonn/lemonn_cost.mjs), per crore of turnover: M, MT, TS, MS
// ₹275; X, XT, Z ₹10,000; P, ZP ₹1,00,000. Any other group (A, B, T, an
// ETF in E or F, a REIT or an InvIT in IF) pays the printed 0.00375%. The
// group is the token before the ISIN on the catalogue line.
// STT on an ETF is the law's (Finance Act, as in lemonn): an
// equity-oriented fund pays 0.001% on the sell only; a gold, silver, debt,
// liquid or foreign-index ETF pays none. A REIT, an InvIT or a partly paid
// line is not the equity table: N/A.
//
// In the total: the book, brokerage, DP, STT, stamp, exchange, SEBI and
// GST. Remarks: the intraday round trip gap on a share, and the prepaid
// packs at their "as low as ₹5 per order" (Fees might be x% lower). Not
// here: Call & Trade (₹50 an order, phone), net-banking pay-in ₹9 + GST
// (UPI is free), auto square-off ₹40 + GST.
//
//   node brokers/univest/univest_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/univest/univest_cost.mjs A1L BSE INR --shares=100 --price=5
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, intradayBuySell, printCli, pct, sebiRate, roundPct } from "../../indianDelivery.mjs";

const CRORE = 1e7;
const PAGE = "https://univest.in/pricing";
const READ_ON = "2026-10-21";
const BSE_BASE = pct("0.00375");

// BSE per crore of gross turnover for the groups the BSE prices apart.
const BSE_PER_CRORE = {
  M: 275, MT: 275, TS: 275, MS: 275,
  X: 10000, XT: 10000, Z: 10000,
  P: 100000, ZP: 100000,
};

// "… BSE <group> <ISIN> <TYPE>" on a BSE catalogue line.
function bseGroup(row) {
  const hit = String(row?.raw || "").match(/\bBSE\s+([A-Z]{1,2})\s+IN[A-Z0-9]{10}\b/);
  return hit ? hit[1] : null;
}

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00322");
  if (exchange !== "BSE") return null;
  const perCrore = BSE_PER_CRORE[bseGroup(row)];
  return perCrore == null ? BSE_BASE : perCrore / CRORE;
}

function brokerageEach(notional) {
  return Math.min(20, notional * pct("0.1"));
}

// An ETF that is not an equity-oriented fund pays no STT.
const NON_EQUITY_FUND =
  /GOLD|SILVER|SILVR|LIQUID|LIQUI|\bLIQ\b|GILT|\bGLT\b|GSEC|G-SEC|SDL|BOND|BHARAT BOND|BBETF|1D RAT|OVERNIGHT|MONEY MARKET|TBILL|NASDAQ|NASDQ|NAS100|MON100|N100|FANG|S&P 500|SP500|HANG SENG|HNGSNG|NYSE|MAHKTECH|MASPTOP50|US TECH|GLOBAL|INTERNATIONAL/i;

// Sides of 0.1% STT: a share pays both; an equity fund 0.001% on the sell.
function sttSides(row) {
  if (String(row?.type || "").toUpperCase() !== "ETF") return 2;
  if (NON_EQUITY_FUND.test(`${row?.name || ""} ${row?.ticker || ""}`)) return 0;
  return 0.01;
}

const SCHEDULE = {
  broker: "Univest",
  folder: "univest",
  catalogueUrl: new URL("univest-parsed.json", import.meta.url),
  url: PAGE,
  readOn: READ_ON,
  brokerageEach,
  txnRate,
  sttRate: pct("0.1"),
  sttSides,
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  ipftRate: 0,
  dpInr: 20,
  basis:
    "Courtage livraison sans forfait : le plus bas de 20 ₹ et 0,1 % par ordre exécuté (forfaits prépayés « dès 5 ₹ par ordre » : remarque). DP 20 ₹ + GST à la vente. " +
    "Transaction NSE 0,00322 %, BSE 0,00375 % sauf groupes M, MT, TS, MS 0,00275 % ; X, XT, Z 0,1 % ; P, ZP 1 % (barème BSE). IPFT non publié : 0. " +
    "STT d'un ETF : 0,001 % à la vente pour un fonds actions, 0 pour or, argent, dette, liquidités ou indice étranger.",
  remark: "",
};

// The prepaid packs are "as low as ₹5 per order" (help page), against the
// standard ₹20 / 0.1 %: the cut of the brokerage at the order amount (the
// same on both legs, GST included or not).
const PACK_EACH = 5;
function packLower(notional) {
  if (!(notional > 0)) return "";
  const each = brokerageEach(notional);
  const pctText = each > PACK_EACH ? roundPct((100 * (each - PACK_EACH)) / each) : 0;
  return pctText > 0 ? `Fees might be ${pctText}% lower.` : "";
}

export function roundTrip(query) {
  const cost = indiaRoundTrip(SCHEDULE, query);
  if (cost.usd == null && cost.brokerFees == null) return cost;
  const lower = packLower(cost.trade?.notional);
  // The intraday gap is a share's (an ETF's STT is another rule).
  const out = cost.listing?.type === "STOCK" ? intradayBuySell(cost, SCHEDULE, () => 20) : cost;
  return { ...out, remark: [out.remark, lower].filter(Boolean).join(" ") };
}

printCli(import.meta.url, roundTrip);
