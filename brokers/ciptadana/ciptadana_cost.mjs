// What one round trip costs at Ciptadana (PT Ciptadana Sekuritas Asia)
// through PinePick: buy n shares (or ETF units) on the Indonesia Stock
// Exchange in the PinePick app, sell them back at once, in dollars.
//
// https://pinepick.ciptadana.com/
// read on 2026-10-28:
//   "Tanpa biaya bulanan, tanpa biaya materai, cukup dengan fee beli
//   0.1513% dan jual 0.2513%." No stamp, as the page says.
// Read as all-in (broker fee, VAT, the 0.0433% levy, and on the sell the
// 0.1% final income tax: the sell is the buy plus 0.10 points), as bni,
// indopremier, cgsid and fac read their own pages. No floor, no other ETF
// rate and no e-Meterai are printed, so none is added.
//
// fees = notional x (0.1513% + 0.2513%).
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs). The sums are in
// ../stockbit/idxCost.mjs.
//
//   node brokers/ciptadana/ciptadana_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Ciptadana",
  folder: "ciptadana",
  catalogueUrl: new URL("ciptadana-parsed.json", import.meta.url),
  url: "https://pinepick.ciptadana.com/",
  readOn: "2026-10-28",
  buy: pct("0.1513"),
  sell: pct("0.2513"),
  basis: "appli PinePick, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
