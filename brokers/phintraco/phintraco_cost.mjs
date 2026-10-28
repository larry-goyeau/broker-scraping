// What one round trip costs at Phintraco Sekuritas: buy n shares at price
// p, sell them back at once, in dollars. Online, through PROFITS Anywhere
// (mobile) and PROFITS desktop, regular account.
//
// The FAQ, read on 2026-10-26:
//   "Fee transaksi di Phintraco Sekuritas hanya 0,15% fee beli dan 0,25%
//   fee jual"
//     buy online     0.15% of the fill
//     sell online    0.25% of the fill
// No floor is printed. The sell figure is 0.10 points above the buy, which
// is the 0.1% final income tax on a sale, so the two figures are read as
// all-in (broker fee, VAT, levy and, on the sell, the tax), as BNI, Indo
// Premier, CGS and FAC print theirs. Nothing is added on top. The stamp
// duty the FAQ names is on SBN bond trades, not on shares, so none is
// added here. A transfer fee to the RDN from another bank is the bank's,
// not this trip.
//
// A share and an ETF on the exchange are the same order and no other ETF
// rate is printed, so an ETF takes these two figures. The account is in
// rupiah (RDN) and every line is IDR: no FX. Book from spreads/
// (idx-touch); a missing book stays missing. The sums are in
// ../stockbit/idxCost.mjs.
//
//   https://phintracosekuritas.com/pertanyaan-umum/
//
//   node brokers/phintraco/phintraco_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Phintraco Sekuritas",
  folder: "phintraco",
  catalogueUrl: new URL("phintraco-parsed.json", import.meta.url),
  url: "https://phintracosekuritas.com/pertanyaan-umum/",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte régulier, PROFITS en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
