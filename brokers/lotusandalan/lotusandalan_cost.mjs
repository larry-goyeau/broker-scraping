// What one round trip costs at Lotus Andalan Sekuritas through LOTS: buy n
// shares (or ETF units) on the Indonesia Stock Exchange through LOTS, sell
// them back at once, in dollars.
//
// https://lotussekuritas.com/services/securities/trading
// read on 2026-10-28:
//   "Komisi transaksi beli 0,15% dan komisi transaksi jual 0,25%."
// Read as all-in (broker fee, VAT, the 0.0433% levy, and on the sell the
// 0.1% final income tax: the sell is the buy plus 0.10 points), as bni,
// indopremier, cgsid and fac read their own pages. No floor, no other ETF
// rate and no e-Meterai are printed, so none is added.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs). The sums are in
// ../stockbit/idxCost.mjs.
//
//   node brokers/lotusandalan/lotusandalan_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Lotus Andalan",
  folder: "lotusandalan",
  catalogueUrl: new URL("lotusandalan-parsed.json", import.meta.url),
  url: "https://lotussekuritas.com/services/securities/trading",
  readOn: "2026-10-28",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "LOTS, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
