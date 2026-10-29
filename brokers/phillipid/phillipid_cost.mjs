// What one round trip costs at Phillip Sekuritas Indonesia through POEMS:
// buy n shares (or ETF units) on the Indonesia Stock Exchange through
// POEMS, sell them back at once, in dollars.
//
// https://www.poems.co.id/Support/Knowledgebase
// read on 2026-10-28:
//   "Tabel Fee Transaksi": Online Beli 0.15%, Jual 0.25%; Non Online
//   0.2% / 0.3%, not priced here.
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
//   node brokers/phillipid/phillipid_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Phillip Sekuritas",
  folder: "phillipid",
  catalogueUrl: new URL("phillipid-parsed.json", import.meta.url),
  url: "https://www.poems.co.id/Support/Knowledgebase",
  readOn: "2026-10-28",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "POEMS, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
