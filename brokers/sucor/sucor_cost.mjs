// What one round trip costs at Sucor Sekuritas through SPOT: buy n shares
// (or ETF units) on the Indonesia Stock Exchange, sell them back at once,
// in dollars. The online trading account.
//
// https://www.sucorsekuritas.com/member/faq read on 2026-10-26, the table
// "Regular Account / Online Trading":
//   "Transaction: Done by calling a Sucor Sekuritas Dealer / Done by
//    client on the web or mobile application"
//   "Buy / Sell fee 0.25% / 0.35% | 0.15% / 0.25%"
// The corporate FAQ gives the same ("Online: Fee Beli (0,15%) Fee Jual
// (0,25%)"): https://www.sucorsekuritas.com/faq/
// The online 0.15% and 0.25% are read as all-in: broker fee, VAT and the
// 0.0433% levy, and on the sell the 0.1% final income tax (the sell is
// the buy plus 0.10 points), as bni, indopremier, cgsid and fac read
// their own pages. The regular account is a dealer by phone and stays
// out. No floor, no ETF rate and no e-Meterai are printed, so none is
// added. The Rp 10,000 that must stay in the RDN is a balance, not a fee.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDN at BCA, BRI or Permata), so there is no
// FX leg. The book comes from spreads/ (spreads/idx-touch.mjs). The sums
// are in ../stockbit/idxCost.mjs.
//
//   node brokers/sucor/sucor_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Sucor Sekuritas",
  folder: "sucor",
  catalogueUrl: new URL("sucor-parsed.json", import.meta.url),
  url: "https://www.sucorsekuritas.com/member/faq",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte Online Trading SPOT, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
