// What one round trip costs at Bahana Sekuritas: buy n shares at price p,
// sell them back at once, in dollars. Online, through Bahana DXtrade,
// regular account.
//
// The FAQ, read on 2026-10-26:
//   "Berapa fee jual dan beli saham di Bahana DXtrade? Fee Jual kami 0.29%
//   dan fee beli di 0.19%"
//     buy online     0.19% of the fill
//     sell online    0.29% of the fill
//   "Apakah ada biaya bulanan dan biaya lainnya untuk aplikasi Bahana
//   DXtrade? Tidak ada ya!" (no monthly or other fee)
// No floor is printed. The sell figure is 0.10 points above the buy, which
// is the 0.1% final income tax on a sale, so the two figures are read as
// all-in (broker fee, VAT, levy and, on the sell, the tax), as BNI, Indo
// Premier, CGS and FAC print theirs. Nothing is added on top. The page
// prints no e-Meterai, so none is added, like the other IDX files.
//
// A share and an ETF on the exchange are the same order and no other ETF
// rate is printed, so an ETF takes these two figures. The account is in
// rupiah (RDN) and every line is IDR: no FX. Book from spreads/
// (idx-touch); a missing book stays missing. The sums are in
// ../stockbit/idxCost.mjs.
//
//   https://bahanasekuritas.id/frequently-asked-questions/
//
//   node brokers/bahana/bahana_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Bahana Sekuritas",
  folder: "bahana",
  catalogueUrl: new URL("bahana-parsed.json", import.meta.url),
  url: "https://bahanasekuritas.id/frequently-asked-questions/",
  readOn: "2026-10-26",
  buy: pct("0.19"),
  sell: pct("0.29"),
  basis: "compte régulier, Bahana DXtrade en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
