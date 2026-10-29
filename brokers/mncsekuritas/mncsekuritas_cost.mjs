// What one round trip costs at MNC Sekuritas (PT MNC Sekuritas) through
// MotionTrade: buy n shares (or ETF units) on the Indonesia Stock Exchange,
// sell them back at once, in dollars.
//
// https://www.mncsekuritas.id/assetweb//download/OA%20INSTITUSI%202026%20Interaktif_1778143804.pdf
// read on 2026-10-28, the account-opening agreement, section 10.1 b:
//   "Untuk transaksi melalui online trading sebesar 0,1815% (transaksi
//   beli) dan 0,2815% (transaksi jual) dari nilai transaksi atau biaya
//   minimum maksimal Rp 10.000"; same-day round trips 0,1513% / 0,2513%;
//   through a dealer 0,2522% / 0,3522%, not priced here.
// It is the institutional form, the only one MNC publishes; the clause is
// not limited to institutions. A minimum "at most Rp 10,000" is a range at
// the broker's discretion, so its maximum (owner's rule): Rp 10,000 a side.
// Read as all-in (broker fee, VAT, the 0.0433% levy, and on the sell the
// 0.1% final income tax), as bni, indopremier, cgsid and fac read their own
// pages. No other ETF rate and no e-Meterai are printed.
// The same-day rate is the remark, as the cut on the fee without the 0.1%
// sale tax (0.363% → 0.3026% buy and sell): 17% lower.
//
// fees = max(notional x 0.1815%, Rp 10,000) + max(notional x 0.2815%, Rp 10,000).
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs). The sums are in
// ../stockbit/idxCost.mjs.
//
//   node brokers/mncsekuritas/mncsekuritas_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "MNC Sekuritas",
  folder: "mncsekuritas",
  catalogueUrl: new URL("mncsekuritas-parsed.json", import.meta.url),
  url: "https://www.mncsekuritas.id/assetweb//download/OA%20INSTITUSI%202026%20Interaktif_1778143804.pdf",
  readOn: "2026-10-28",
  buy: pct("0.1815"),
  sell: pct("0.2815"),
  minBuy: 10_000,
  minSell: 10_000,
  basis: "MotionTrade, ordre en ligne",
  remark: "Same day sell fees are 17% lower.",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
