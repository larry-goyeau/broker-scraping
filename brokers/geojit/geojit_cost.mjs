// What one round trip costs at Geojit Financial Services: buy n shares,
// sell them back, in dollars. Online delivery. Not intraday, not F&O, not
// offline (call and trade: 0.5% on delivery).
//
// India, https://www.geojit.com/brokerage-charges read on 2026-10-26.
// Three online plans; delivery is 0.30% on all three, the minimum differs:
//   ginvestmax  G-Invest Max. "Rs. 20 per contract or 1 paise per share
//               whichever is higher", "subject to a maximum of 25 paise per
//               share/debenture or 2.5% of the contract price per share,
//               whichever is higher". The default.
//   gtrade      G-Trade Max and G-Trade Cash: "The minimum brokerage is
//               Rs. 20 per contract note". Same delivery, same cash
//               intraday (Rs 20 per order or 0.03%, whichever is lower):
//               one row.
//   Support article 89000006905 ("What are the brokerage charges to trade
//   in different segments?") read on 2026-10-26 for the minimums.
// A round trip held overnight is two contract notes, so each side pays the
// minimum on its own.
//   Statutory (support article 89000007691): STT on buy and sell, stamp
//   by the state, exchange transaction charges "vary between exchanges",
//   SEBI ₹10 per crore, "GST ... levied as a percentage of the brokerage
//   charged for the trade. The current GST rate is 18%". No rate is
//   reprinted: STT 0.1% both sides, stamp 0.015% on the buy, NSE 0.00307%,
//   BSE by scrip group (BSE's own table, ../bajaj/indiaAbroad.mjs). GST on
//   brokerage and on the DP debit only, as the article says.
//   DP on a delivery sell       the CDSL fiche of DP 48900 (Geojit,
//                               Kochi), https://www.cdslindia.com/dp/
//                               dpdetails.aspx?dp_id=48900, read
//                               2026-10-26: market trades through Geojit
//                               0.02%, minimum ₹30, maximum ₹75 per
//                               transaction, "inclusive of settlement fees
//                               charged by respective Depository"; the
//                               support article says the charges "are
//                               exclusive of taxes": + GST 18%.
// Same day sell (intraday): G-Invest Max 0.03%, the G-Trade plans the lower
// of ₹20 and 0.03% an order; a same-day buy and sell is one contract note,
// minimum ₹20 for the two sides. The remark is that pair's brokerage as a
// cut of the delivery brokerage on both sides, at this order (0.30% →
// 0.03% = 90% lower when no minimum bites).
//
// United States, https://www.geojitifsc.com/invest_in_global_stocks.html
// read on 2026-10-26. Geojit IFSC is the introducing broker; "Geojit IFSC
// has engaged View Trade IFSC as its Global Access Provider". The book is
// the 605 × ViewTrade Securities' Rule 606 Q (spreads/rule606.mjs key
// `viewtrade`).
//   Equity brokerage            0.25% of the transaction value, "subject to
//                               a minimum brokerage of USD 0.01 per executed
//                               order"
//   IGST                        18% "Calculated on brokerage value", "Only
//                               for Resident Indian": in the total (the
//                               resident case), and the remark says fees
//                               are lower without it: 18/118 of the
//                               brokerage with IGST, 15% lower
//   SEC                         0.0000206 of the sell value
//   FINRA TAF                   0.000195 × sell quantity (FINRA cap $9.79)
//   IFSCA turnover              0.005% of the trade volume, each side
//   Fund withdrawal USD 10, NRI onboarding USD 2: not per trade.
// The account with the Global Access Provider is in dollars (deposits.mjs:
// INR, USD): no forced conversion.
//
//   node brokers/geojit/geojit_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/geojit/geojit_cost.mjs INE002A01018 NSE INR --shares=3 --price=500 --plan=gtrade
//   node brokers/geojit/geojit_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, sebiRate } from "../../indianDelivery.mjs";
import { BSE_TABLE_BASIS, bseTxnRate, catalogueRows, cliArgs, goesToIndia, usRoundTrip } from "../bajaj/indiaAbroad.mjs";

const CATALOGUE = new URL("geojit-parsed.json", import.meta.url);
const PAGE = "https://www.geojit.com/brokerage-charges";
const US_PAGE = "https://www.geojitifsc.com/invest_in_global_stocks.html";
const READ_ON = "2026-10-26";
const DELIVERY = 0.003;
const INTRADAY = 0.0003;

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange === "BSE") return bseTxnRate(row, catalogueRows(CATALOGUE));
  return null;
}

// indiaRoundTrip hands brokerageEach the notional only: the share count is
// set here before each call (synchronous, one query at a time).
let sharesNow = 0;

const PLANS = {
  ginvestmax: {
    name: "G-Invest Max",
    each: (notional) => {
      const n = sharesNow;
      const floor = Math.max(20, n * 0.01);
      const cap = Math.max(n * 0.25, notional * 0.025);
      return Math.min(Math.max(notional * DELIVERY, floor), cap);
    },
    intradayPair: (notional) => Math.max(20, 2 * notional * INTRADAY),
    basis: "G-Invest Max : 0,30 % par ordre, minimum le plus haut de 20 ₹ et 1 paisa par part, plafond le plus haut de 25 paise par part et 2,5 %.",
  },
  gtrade: {
    name: "G-Trade Max / G-Trade Cash",
    each: (notional) => Math.max(20, notional * DELIVERY),
    intradayPair: (notional) => Math.max(20, 2 * Math.min(20, notional * INTRADAY)),
    basis: "G-Trade Max et G-Trade Cash : 0,30 % par ordre, minimum 20 ₹ par avis d'opéré.",
  },
};

function india(plan) {
  return {
    broker: "Geojit",
    folder: "geojit",
    catalogueUrl: CATALOGUE,
    url: PAGE,
    readOn: READ_ON,
    brokerageEach: plan.each,
    txnRate,
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnTxn: false,
    gstOnSebi: false,
    gstOnDp: true,
    ipftRate: 0,
    dpInr: (notional) => Math.min(75, Math.max(30, notional * pct("0.02"))),
    basis:
      `${plan.basis} GST 18 % sur le courtage et le DP. DP à la vente 0,02 %, minimum 30 ₹, maximum 75 ₹, + GST (fiche CDSL 48900). ${BSE_TABLE_BASIS}`,
    remark: "",
  };
}

function indiaTrip(plan, query) {
  sharesNow = Number(query.shares) || 0;
  const out = indiaRoundTrip(india(plan), query);
  const notional = Number(out?.trade?.notional);
  if (!(notional > 0)) return out;
  sharesNow = Number(query.shares) || 0;
  // The intraday pair's brokerage as a cut of the two delivery legs.
  const delivery = 2 * plan.each(notional);
  const x = ((delivery - plan.intradayPair(notional)) / delivery) * 100;
  const v = Math.abs(x) >= 10 ? Math.round(Math.abs(x)) : Number(Math.abs(x).toFixed(1));
  return v ? { ...out, remark: `Same day sell fees are ${v}% ${x > 0 ? "lower" : "higher"}.` } : out;
}

const US = {
  broker: "Geojit",
  folder: "geojit",
  catalogueUrl: CATALOGUE,
  url: US_PAGE,
  readOn: READ_ON,
  dealer: "viewtrade",
  dealerName: "ViewTrade",
  commissionEach: ({ notional }) => Math.max(0.01, notional * 0.0025),
  gst: 0.18,
  sec: 0.0000206,
  tafPerShare: 0.000195,
  tafCap: 9.79,
  ifsca: 0.00005,
  basis:
    `Geojit IFSC via View Trade IFSC, page relue le ${READ_ON} : courtage 0,25 % par ordre, minimum 0,01 $, IGST 18 % sur le courtage (résident indien). ` +
    "SEC 0,0000206 de la vente, TAF 0,000195 $ par part vendue (plafond FINRA 9,79 $), IFSCA 0,005 % à chaque sens. Compte en dollars : pas de change forcé.",
  // IGST is charged to resident Indians only: x is that IGST as a cut of
  // the brokerage with IGST, both sides (18/118). Left out when the IGST is
  // under 0.005% of the order.
  remark: ({ gst, commission, notionalUsd }) => {
    if (!Math.round(((gst / notionalUsd) * 100) * 100)) return "";
    const x = (gst / (commission + gst)) * 100;
    return `Fees might be ${x >= 10 ? Math.round(x) : Number(x.toFixed(1))}% lower if you are not a Resident Indian.`;
  },
};

export function roundTrip(query) {
  const id = String(query.plan || "").toLowerCase();
  const plan = PLANS[id] || PLANS.ginvestmax;
  if (goesToIndia(catalogueRows(CATALOGUE), query)) return indiaTrip(plan, query);
  return usRoundTrip(US, query);
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) console.log(JSON.stringify(roundTrip(cliArgs()), null, 2));
