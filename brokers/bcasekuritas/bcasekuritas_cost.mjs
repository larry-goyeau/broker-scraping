// What one round trip costs at BCA Sekuritas (PT BCA Sekuritas): buy n
// shares (or ETF units) on the Indonesia Stock Exchange through its online
// trading app, sell them back at once, in dollars.
//
// https://bcasekuritas.co.id/api/pdf/RIPLAY%20Umum_versi%2020082025.pdf
// read on 2026-10-28:
//   RIPLAY: "Online Trading Beli/Buy : 0,1815% Jual/Sell : 0,2815%";
//   through a sales officer 0,2522% / 0,3522%, not priced here.
// Read as all-in (broker fee, VAT, the 0.0433% levy, and on the sell the
// 0.1% final income tax: the sell is the buy plus 0.10 points), as bni,
// indopremier, cgsid and fac read their own pages. No floor, no other ETF
// rate and no e-Meterai are printed, so none is added.
//
// fees = notional x (0.1815% + 0.2815%).
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs). The sums are in
// ../stockbit/idxCost.mjs.
//
//   node brokers/bcasekuritas/bcasekuritas_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "BCA Sekuritas",
  folder: "bcasekuritas",
  catalogueUrl: new URL("bcasekuritas-parsed.json", import.meta.url),
  url: "https://bcasekuritas.co.id/api/pdf/RIPLAY%20Umum_versi%2020082025.pdf",
  readOn: "2026-10-28",
  buy: pct("0.1815"),
  sell: pct("0.2815"),
  basis: "appli BCA Sekuritas, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
