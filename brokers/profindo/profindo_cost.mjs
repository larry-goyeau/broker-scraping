// What one round trip costs at Profindo Sekuritas Indonesia through
// ProClick: buy n shares (or ETF units) on the Indonesia Stock Exchange
// through ProClick, sell them back at once, in dollars.
//
// https://profindo.com/page/tutorial-opening-account
// read on 2026-10-28:
//   "Untuk Nasabah Online Fee beli 0.18% dan Fee Jual 0.28%."
// Read as all-in (broker fee, VAT, the 0.0433% levy, and on the sell the
// 0.1% final income tax: the sell is the buy plus 0.10 points), as bni,
// indopremier, cgsid and fac read their own pages. No floor, no other ETF
// rate and no e-Meterai are printed, so none is added.
//
// fees = notional x (0.18% + 0.28%).
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs). The sums are in
// ../stockbit/idxCost.mjs.
//
//   node brokers/profindo/profindo_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Profindo",
  folder: "profindo",
  catalogueUrl: new URL("profindo-parsed.json", import.meta.url),
  url: "https://profindo.com/page/tutorial-opening-account",
  readOn: "2026-10-28",
  buy: pct("0.18"),
  sell: pct("0.28"),
  basis: "ProClick, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
