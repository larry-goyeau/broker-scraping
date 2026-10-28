// What one round trip costs at Kiwoom Sekuritas Indonesia through HERO:
// buy n shares (or ETF units) on the Indonesia Stock Exchange, sell them
// back at once, in dollars. The regular account, online.
//
// https://www.kiwoom.co.id/cs/getFAQ read on 2026-10-26, FAQ 4.1 "How much
// is the transaction fee at PT Kiwoom Sekuritas Indonesia?":
//   "Fee if using HERO is as follows: Buy transaction: 0.15% Sell
//    transaction: 0.25%"
//   "Fee for conventional clients (by phone) is as follows: Buy
//    transaction: 0.25% Sell transaction: 0.35%"
// The HERO 0.15% and 0.25% are read as all-in: broker fee, VAT and the
// 0.0433% levy, and on the sell the 0.1% final income tax (the sell is
// the buy plus 0.10 points), as bni, indopremier, cgsid and fac read
// their own pages. The phone/dealer rates stay out: only online prices
// count. The margin account prints the same 0.15% / 0.25% and is a loan,
// so it is not priced here. No floor, no ETF rate and no e-Meterai are
// printed, so none is added. The 35% a year late-payment interest is not
// this trip.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDN at an Indonesian bank; online opening
// needs a BCA or BRI account), so there is no FX leg. The book comes from
// spreads/ (spreads/idx-touch.mjs). The sums are in ../stockbit/idxCost.mjs.
//
//   node brokers/kiwoomindonesia/kiwoomindonesia_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Kiwoom Sekuritas Indonesia",
  folder: "kiwoomindonesia",
  catalogueUrl: new URL("kiwoomindonesia-parsed.json", import.meta.url),
  url: "https://www.kiwoom.co.id/cs/getFAQ",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte régulier, ordre en ligne HERO",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
