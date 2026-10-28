// What one round trip costs at Bajaj Broking (Bajaj Financial Securities
// Ltd): buy n shares, sell them back, in dollars. Online delivery. Not
// intraday, not F&O, not call-and-trade.
//
// Two markets, each with its own subscription, so each plan is a row
// (`query.plan`) of the market it prices:
//   freedom       Freedom Pack, ₹20 per order (NSE, BSE). Free the first
//                 year, ₹431 a year from the second. The default.
//   professional  Professional Pack, ₹10 per order, ₹2,500 a year.
//   basic         US Basic (Vested), 0.25% a trade, max $35. The default
//                 for a US line.
//   premium       US Premium, 0.15% a trade, max $35; ₹450 a month billed
//                 quarterly, ₹375 a month billed yearly.
// Under freedom or professional a US line is not that row (onlineBuy:
// false), and the same for an Indian line under basic or premium. With no
// plan, an Indian line takes Freedom and a US line Basic.
// The Signature pack (0.2% on delivery, "Customised Brokerage", a
// relationship manager, opened on a callback) and the Pro pack ("To be
// announced") are not online tariffs and are not rows.
//
// India, https://www.bajajbroking.in/pricing read on 2026-10-26.
//   Brokerage, delivery         Freedom ₹20/order, Professional ₹10/order
//   Transaction                 NSE 0.0030699%. BSE "Charges vary as per
//                               the scrip group": BSE's own table
//                               (./indiaAbroad.mjs). Clearing member NIL.
//   STT                         0.10% on buy and sell
//   SEBI                        ₹1 per lakh (0.0001%)
//   Stamp                       0.015% on the buy
//   GST                         18% on brokerage + SEBI + transaction
//   DP on a delivery sell       the pricing page's demat table has no
//                               debit row (its "**" note says the charge
//                               "is inclusive of CDSL charges"). The site's
//                               brokerage calculator (clientlib-brokerage-
//                               calculatorrevamp …min.js, read 2026-10-26)
//                               prices "DP-Charges":"30" on delivery and
//                               puts no GST on it: ₹30, no GST.
//   IPFT                        the same calculator: NSE 0.0000001%, BSE
//                               0. The pricing page's GST list does not
//                               name it, so no GST on it.
// Account opening and AMC NIL, net banking pay-in ₹10 per transfer: none
// is per trade.
//
// United States, https://www.bajajbroking.in/us-stocks read on 2026-10-26.
// Offered through Vested (VF Securities, Inc., member FINRA/SIPC). The
// book is the 605 × VF Securities' own Rule 606 Q (spreads/rule606.mjs
// key `vested`); its 2026-Q2 file has no market-order mix, so until a
// quarter carries one the book is the quoted NBBO, as at ../vested.
//   Basic, listed               0.25% of trade amount, max $35 a side
//   Premium, listed             0.15% of trade amount, max $35 a side
//   OTC (OTC Markets lines)     Basic 0.5%, Premium 0.25%, no cap printed
//   SEC, sell only              0.00206% of the sale, and FINRA TAF
//                               $0.000195 a share, max $9.79: Vested's own
//                               fee article, as in ../vested/vested_cost.mjs.
//   Withdrawal $5 (Premium: two free a year): not per trade.
// The Vested account holds dollars (deposits.mjs: INR, USD), so a US line
// pays no forced conversion; the LRS conversion is a funding cost with no
// printed rate.
//
//   node brokers/bajaj/bajaj_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/bajaj/bajaj_cost.mjs INE002A01018 BSE INR --shares=10 --price=1400 --plan=professional
//   node brokers/bajaj/bajaj_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/bajaj/bajaj_cost.mjs AAPL XNAS USD --shares=100 --price=230 --plan=premium
//   node brokers/bajaj/bajaj_cost.mjs AAGAF "OTC Markets" USD --shares=1000 --price=1
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, sebiRate } from "../../indianDelivery.mjs";
import { BSE_TABLE_BASIS, bseTxnRate, catalogueRows, cliArgs, goesToIndia, notThisPlan, usRoundTrip } from "./indiaAbroad.mjs";

const CATALOGUE = new URL("bajaj-parsed.json", import.meta.url);
const PAGE = "https://www.bajajbroking.in/pricing";
const US_PAGE = "https://www.bajajbroking.in/us-stocks";
const READ_ON = "2026-10-26";

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.0030699");
  if (exchange === "BSE") return bseTxnRate(row, catalogueRows(CATALOGUE));
  return null;
}

function india({ each, basis, remark }) {
  return {
    broker: "Bajaj Broking",
    folder: "bajaj",
    catalogueUrl: CATALOGUE,
    url: PAGE,
    readOn: READ_ON,
    brokerageEach: () => each,
    txnRate,
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnIpft: false,
    gstOnDp: false,
    ipftRate: (exchange) => (exchange === "NSE" ? pct("0.0000001") : 0),
    dpInr: 30,
    basis: `${basis} DP 30 ₹ à la vente (calculatrice du site, sans GST). ${BSE_TABLE_BASIS}`,
    remark,
  };
}

const INDIA = {
  freedom: india({
    each: 20,
    basis: "Freedom Pack : 20 ₹ par ordre ; gratuit la première année, 431 ₹ par an ensuite, hors de cet aller-retour.",
    remark: "₹431 a year from the second year.",
  }),
  professional: india({
    each: 10,
    basis: "Professional Pack : 10 ₹ par ordre ; 2 500 ₹ par an, hors de cet aller-retour.",
    remark: "₹2,500 a year.",
  }),
};

const US = {
  basic: { name: "US Basic", listed: 0.0025, otc: 0.005, cap: 35, remark: "" },
  premium: {
    name: "US Premium",
    listed: 0.0015,
    otc: 0.0025,
    cap: 35,
    remark: "₹450 a month billed quarterly, ₹375 a month billed yearly.",
  },
};

function usTariff(id) {
  const plan = US[id];
  return {
    broker: "Bajaj Broking",
    folder: "bajaj",
    catalogueUrl: CATALOGUE,
    url: US_PAGE,
    readOn: READ_ON,
    dealer: "vested",
    dealerName: "VF Securities",
    commissionEach: ({ notional, row }) =>
      String(row?.mic || "").toUpperCase() === "OTCM" ? notional * plan.otc : Math.min(plan.cap, notional * plan.listed),
    gst: 0,
    sec: 0.0000206,
    tafPerShare: 0.000195,
    tafCap: 9.79,
    basis:
      `${plan.name} (Vested), page relue le ${READ_ON} : ${(plan.listed * 100).toFixed(2)} % par ordre, plafond ${plan.cap} $ ; ` +
      `OTC ${(plan.otc * 100).toFixed(2)} % sans plafond. SEC 0,00206 % de la vente, TAF 0,000195 $ par part plafonnée à 9,79 $ (article de frais de Vested). Compte en dollars : pas de change forcé.`,
    remark: () => plan.remark,
  };
}

export function roundTrip(query) {
  const id = String(query.plan || "").toLowerCase();
  const rows = catalogueRows(CATALOGUE);
  if (goesToIndia(rows, query)) {
    const out = indiaRoundTrip(INDIA[id] || INDIA.freedom, query);
    return US[id] ? notThisPlan(out, `${US[id].name} ne tarife que les lignes US`) : out;
  }
  const out = usRoundTrip(usTariff(US[id] ? id : "basic"), query);
  return INDIA[id] ? notThisPlan(out, `le pack ${id} ne tarife que NSE et BSE`) : out;
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) console.log(JSON.stringify(roundTrip(cliArgs()), null, 2));
