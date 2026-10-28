// What one round trip costs at Minna Padi Investama Sekuritas: buy n shares
// at price p, sell them back at once, in dollars. Online, through Master
// Online V2 (Android, iOS, web), regular account.
//
// The FAQ, read on 2026-10-26:
//   "Biaya transaksi saham di Master Online V2 adalah 0,15% (beli) dan
//   0,25% (jual)."
//     buy online     0.15% of the fill
//     sell online    0.25% of the fill
//   The account has no minimum opening deposit and "tidak dikenakan biaya
//   administrasi bulanan" (no monthly fee).
// No floor is printed. The sell figure is 0.10 points above the buy, which
// is the 0.1% final income tax on a sale, so the two figures are read as
// all-in (broker fee, VAT, levy and, on the sell, the tax), as BNI, Indo
// Premier, CGS and FAC print theirs. Nothing is added on top. No
// e-Meterai is printed, so none is added.
//
// A share and an ETF on the exchange are the same order and no other ETF
// rate is printed, so an ETF takes these two figures. The account is in
// rupiah (RDN) and every line is IDR: no FX. Book from spreads/
// (idx-touch); a missing book stays missing. The sums are in
// ../stockbit/idxCost.mjs.
//
//   https://www.minnapadi.com/faq
//
//   node brokers/minnapadi/minnapadi_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Minna Padi Sekuritas",
  folder: "minnapadi",
  catalogueUrl: new URL("minnapadi-parsed.json", import.meta.url),
  url: "https://www.minnapadi.com/faq",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte régulier, Master Online V2 en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
