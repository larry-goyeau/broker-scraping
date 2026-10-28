// What one round trip costs at Zerodha: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://zerodha.com/charges/ read on 2026-09-25.
//   Delivery brokerage          ₹0
//   STT                         0.1% on the buy and on the sell
//   Transaction charges         NSE 0.00307%, BSE 0.00375%
//   GST                         18% of brokerage + SEBI + transaction charges
//   SEBI                        ₹10 / crore
//   Stamp                       0.015% on the buy
//   IPFT                        ₹0.01 / crore, listed apart from the transaction charge
//   DP on a delivery sell       ₹15.34 per scrip, GST already inside
// Direct mutual funds are ₹0 commission and ₹0 DP. Intraday is another table.
//
// US stocks and ETFs (Global stocks segment), https://zerodha.com/us-stocks/
// read on 2026-10-28: "Brokerage for investing in US stocks through Zerodha
// is 0.1% (minimum $0.01, maximum $10 per order) ... apart from other
// applicable statutory and regulatory charges", so 0.1% a side within
// $0.01-$10, plus 18% GST as on Zerodha's other brokerage. SEC, TAF and CAT
// have no figure (0). The US broker partner is not named: quoted NBBO. The
// account is in rupees and money goes out under LRS at the remitting
// bank's rate, which Zerodha does not print: the US total is N/A.
//
//   node brokers/zerodha/zerodha_cost.mjs US0378331005 XNAS USD --shares=10 --price=230
//   node brokers/zerodha/zerodha_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate, intradayGap } from "../../indianDelivery.mjs";
import { catalogueRows, goesToIndia, usRoundTrip } from "../bajaj/indiaAbroad.mjs";

const SCHEDULE = {
  broker: "Zerodha",
  folder: "zerodha",
  catalogueUrl: new URL("zerodha-parsed.json", import.meta.url),
  url: "https://zerodha.com/charges/",
  readOn: "2026-09-25",
  freeFund: true,
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00307") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  ipftRate: 0.01 / 10_000_000,
  dpInr: 15.34,
  dpIncludesGst: true,
  basis: "Courtage livraison 0. DP 15,34 ₹ par titre à la vente, GST comprise.",
  remark: intradayGap(0, pct("0.03")),
};

const US = {
  broker: "Zerodha",
  folder: "zerodha",
  catalogueUrl: SCHEDULE.catalogueUrl,
  url: "https://zerodha.com/us-stocks/",
  readOn: "2026-10-28",
  dealer: null,
  commissionEach: ({ notional }) => Math.min(10, Math.max(0.01, notional * 0.001)),
  gst: 0.18,
  fxUnknown: "change INR→USD à l'achat et retour à la vente sous LRS, au cours de la banque qui envoie les fonds, que Zerodha n'imprime pas (compte en roupies)",
  basis:
    "Zerodha, segment Global stocks, page relue le 2026-10-28 : courtage 0,1 % par ordre, minimum 0,01 $, maximum 10 $, puis GST 18 %. " +
    "SEC, TAF et CAT non imprimés : 0. Courtier US partenaire non nommé : carnet NBBO coté.",
};

export function roundTrip(query) {
  if (!goesToIndia(catalogueRows(SCHEDULE.catalogueUrl), query)) return usRoundTrip(US, query);
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
