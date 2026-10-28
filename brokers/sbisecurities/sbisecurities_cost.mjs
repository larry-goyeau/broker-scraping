// What one round trip costs at SBI Securities (SBICAP Securities Ltd): buy
// n shares, sell them back, in dollars. Online delivery. Not intraday, not
// F&O, not an order through the call desk (₹49 an order).
//
// The site is one Angular application; the tariff below is read from its
// main bundle (main.<hash>.js, named in https://www.sbisecurities.in/),
// main.db930c4f14c33a2e.js read on 2026-10-26, "Brokerage Plans" table.
// Each plan a retail client can open online is a row (`query.plan`):
//   plan        delivery  ETF^   cash intraday   note
//   suvidha     0.50%     ₹20    ₹20 an order    opened "ONLY through Online
//                                                DIY Journey". The default.
//   pro749      0.35%     ₹20    ₹20             "Complimentary Delivery
//                                                Trade upto Rs 250000",
//                                                lifetime
//   plan499     0.35%     ₹20    ₹20
//   oiop3k      0.20%     FREE   ₹20             complimentary delivery up
//                                                to ₹15 lakh
//   oiop10k     0.10%     FREE   ₹20             complimentary delivery up
//                                                to ₹75 lakh
//   women       0.20%     FREE   ₹20             "for DIY female customers
//                                                only"
//   prozero     0.20%     FREE   NIL             "DIY & YONO channel only"
// The subscription amounts are not printed (the plan names carry 499, 749,
// 3K and 10K) and stay out of the trip. "Minimum brokerage ... will be
// Rs. 0.01". Left out: OIOP - SBI EMP (employees), CORP 4- PROP
// (corporates), SBIDCSP, DCSP1000 and SBIWEALTH (advisory plans; the PRO
// ZERO note says other plans carry "advisor/VRM services").
// "All statutory / regulatory levies and other shall be charged separately
// over and above the brokerage at actuals": STT 0.1% on buy and sell,
// stamp 0.015% on the buy, NSE 0.00307%, BSE by scrip group (BSE's own
// table, ../bajaj/indiaAbroad.mjs), SEBI ₹10 per crore, GST 18% on
// brokerage + transaction + SEBI.
//   DP on a delivery sell       "Demat transaction charges ... at standard
//                               rates": the CDSL fiche of DP 19300 (SBICAP
//                               Securities; DP 47200 prints the same),
//                               https://www.cdslindia.com/dp/dpdetails.aspx?dp_id=19300
//                               read 2026-10-26: "Thru POA/DDPI - 0.01% of
//                               the transaction value subject to Min Rs 21/-
//                               and Max Rs 300/- per ISIN debit
//                               instruction". No GST printed: none added.
//
// United States: "Invest seamlessly in US stocks, fractional shares, and
// ETFs with SBICAP Securities, powered by Appreciate" (same bundle, FAQ
// 12): "Brokerage is charged at 0.25% of the transaction value under the
// Basic Plan. In addition, a platform fee of ₹1.5 per share traded is
// applicable. Statutory charges, if any, are charged separately." GST 18%
// is put on brokerage and platform fee (a service to a resident Indian;
// the same 18% the Indian table carries). SEC, TAF and CAT are not
// printed: 0. Appreciate names no US broker-dealer on these pages: the
// book is the quoted NBBO.
// Cash is rupees only (deposits.mjs): every US line is converted out and
// back by the AD1 bank under LRS at a rate SBI does not print, so `usd` is
// N/A and `brokerFees` stays.
//
//   node brokers/sbisecurities/sbisecurities_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/sbisecurities/sbisecurities_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400 --plan=oiop10k
//   node brokers/sbisecurities/sbisecurities_cost.mjs INF204KB14I2 NSE INR --shares=100 --price=280
//   node brokers/sbisecurities/sbisecurities_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, rateGap, sebiRate } from "../../indianDelivery.mjs";
import { toUsd } from "../../fx.mjs";
import { BSE_TABLE_BASIS, bseTxnRate, catalogueRows, cliArgs, goesToIndia, usRoundTrip } from "../bajaj/indiaAbroad.mjs";

const CATALOGUE = new URL("sbisecurities-parsed.json", import.meta.url);
const PAGE = "https://www.sbisecurities.in/";
const READ_ON = "2026-10-26";
const MIN = 0.01;

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange === "BSE") return bseTxnRate(row, catalogueRows(CATALOGUE));
  return null;
}

const isEtf = (row) => String(row?.type || "").toUpperCase() === "ETF";

const PLANS = {
  suvidha: { name: "SUVIDHA", delivery: "0.50", etf: 20, intraday: 20, remark: "" },
  pro749: { name: "PRO 749", delivery: "0.35", etf: 20, intraday: 20, remark: "First ₹2.5 lakh of delivery trades free." },
  plan499: { name: "Plan 499", delivery: "0.35", etf: 20, intraday: 20, remark: "" },
  oiop3k: { name: "OIOP-3K", delivery: "0.20", etf: 0, intraday: 20, remark: "First ₹15 lakh of delivery trades free." },
  oiop10k: { name: "OIOP-10K", delivery: "0.10", etf: 0, intraday: 20, remark: "First ₹75 lakh of delivery trades free." },
  women: { name: "Women Plan", delivery: "0.20", etf: 0, intraday: 20, remark: "Women only." },
  prozero: { name: "PRO ZERO", delivery: "0.20", etf: 0, intraday: 0, remark: "" },
};

function india(plan) {
  return {
    broker: "SBI Securities",
    folder: "sbisecurities",
    catalogueUrl: CATALOGUE,
    url: PAGE,
    readOn: READ_ON,
    brokerageEach: (notional, row) => (isEtf(row) ? plan.etf : Math.max(MIN, notional * pct(plan.delivery))),
    txnRate,
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnDp: false,
    ipftRate: 0,
    dpInr: (notional) => Math.min(300, Math.max(21, notional * pct("0.01"))),
    basis:
      `${plan.name} : livraison ${plan.delivery.replace(".", ",")} % par ordre, ETF ${plan.etf ? `${plan.etf} ₹ par ordre` : "gratuit"}. ` +
      `DP à la vente 0,01 %, minimum 21 ₹, maximum 300 ₹ (fiche CDSL 19300). ${BSE_TABLE_BASIS}`,
    remark: plan.remark,
  };
}

function indiaTrip(plan, query) {
  const out = indiaRoundTrip(india(plan), query);
  const notional = Number(out?.trade?.notional);
  if (!(notional > 0) || out?.listing?.type === "ETF") return out;
  const delivery = Math.max(MIN, notional * pct(plan.delivery));
  const gap = rateGap(delivery / notional, Math.max(plan.intraday ? MIN : 0, plan.intraday) / notional);
  const line = gap ? `Same day sell fees are ${gap}.` : "";
  return { ...out, remark: [line, out.remark].filter(Boolean).join(" ") };
}

const PLATFORM_INR = 1.5;
const US = {
  broker: "SBI Securities",
  folder: "sbisecurities",
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  dealer: null,
  commissionEach: ({ notional, shares }) => notional * 0.0025 + shares * toUsd(PLATFORM_INR, "INR"),
  gst: 0.18,
  // INR -> USD on the buy and back on the sale: SBI Securities prints no
  // rate, so its parent State Bank of India's forex card rates stand in
  // (owner, 2026-10-26): USD TT buy 94.75, TT sell 95.60 (26-10-2026 11:40),
  // (sell - mid) / mid = 0.45 % each way.
  //   https://sbi.co.in/documents/16012/1400784/FOREX_CARD_RATES.pdf
  fxSpread: 0.0045,
  basis:
    `Actions US « powered by Appreciate », Basic Plan, bundle relu le ${READ_ON} : courtage 0,25 % de la valeur, plus 1,5 ₹ de frais de plateforme par part, puis GST 18 %. ` +
    "SEC, TAF et CAT non imprimés. Aucun courtier US nommé : carnet NBBO coté.",
};

export function roundTrip(query) {
  const id = String(query.plan || "suvidha").toLowerCase();
  if (goesToIndia(catalogueRows(CATALOGUE), query)) return indiaTrip(PLANS[id] || PLANS.suvidha, query);
  return usRoundTrip(US, query);
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) console.log(JSON.stringify(roundTrip(cliArgs()), null, 2));
