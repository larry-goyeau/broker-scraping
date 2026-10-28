// What one round trip costs at Victoria Sekuritas Indonesia: buy n shares
// at price p, sell them back at once, in dollars. Online, through the
// Vista app (web, Android, iOS), regular account.
//
// The FAQ, read on 2026-10-26, answer 8:
//   "Setiap transaksi beli akan dikenakan biaya mulai dari 0,15% dari nilai
//   pembelian dan setiap transaksi jual akan dikenakan biaya mulai dari
//   (0,15% + pajak 0,1%) dari nilai penjualan."
//     buy online     0.15% of the fill
//     sell online    0.25% of the fill (0.15% plus the 0.1% sale tax)
// "Mulai dari" ("from") gives only the lowest rate; no higher rate, tier
// or condition is printed, so the trip is counted at the printed figures.
// No floor is printed. The 0.15% is read as all-in (broker fee, VAT,
// levy), as BNI, Indo Premier, CGS and FAC print theirs; the sale tax is
// named inside the sell figure. Nothing is added on top. No e-Meterai is
// printed, so none is added. Margin is a loan and stays out.
//
// A share and an ETF on the exchange are the same order and no other ETF
// rate is printed, so an ETF takes these two figures. The account is in
// rupiah (RDN) and every line is IDR: no FX. Book from spreads/
// (idx-touch); a missing book stays missing. The sums are in
// ../stockbit/idxCost.mjs.
//
//   https://victoria-sekuritas.co.id/faq/
//
//   node brokers/victoriaindonesi/victoriaindonesi_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Victoria Sekuritas Indonesia",
  folder: "victoriaindonesi",
  catalogueUrl: new URL("victoriaindonesi-parsed.json", import.meta.url),
  url: "https://victoria-sekuritas.co.id/faq/",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte régulier, Vista en ligne, taux « mulai dari »",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
