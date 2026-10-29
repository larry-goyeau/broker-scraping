// What one round trip costs at KAF Sekuritas Indonesia through KAF ETRADE:
// buy n shares (or ETF units) on the Indonesia Stock Exchange through KAF
// ETRADE, sell them back at once, in dollars.
//
// https://www.kafsekuritas.co.id/id/post/fee-saham-promoktober
// read on 2026-10-28:
//   the October 2025 promotion page, after the promo ended on 30
//   December 2025: "Fee transaksi beli akan kembali normal menjadi 0,15%
//   usai periode promo berakhir", and the sell 0.10 points above it, 0.25%.
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
//   node brokers/kafsekuritas/kafsekuritas_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "KAF Sekuritas",
  folder: "kafsekuritas",
  catalogueUrl: new URL("kafsekuritas-parsed.json", import.meta.url),
  url: "https://www.kafsekuritas.co.id/id/post/fee-saham-promoktober",
  readOn: "2026-10-28",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "KAF ETRADE, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
