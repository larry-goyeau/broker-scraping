// What one round trip costs at Panca Global Sekuritas through its Hei5
// platform: buy n shares (or ETF units) on the Indonesia Stock Exchange,
// sell them back at once, in dollars. The online Hei5 account (Android,
// iOS, desktop OLT, web trading).
//
// https://www.hei5.id/product read on 2026-10-26:
//   "Biaya Transaksi (Beli 0,1% dan Jual 0,2% - All in)"
//     buy online     0.10% of the fill
//     sell online    0.20% of the fill
// "All in" is printed: broker fee, VAT and the 0.0433% levy, and on the
// sell the 0.1% final income tax (the sell is the buy plus 0.10 points).
// Nothing is added on top. No floor, no other ETF rate and no e-Meterai
// are printed, so an ETF unit takes these two figures and no stamp is
// added, as in the other IDX files. Orders through the sales team are not
// priced here.
//
// fees = notional x (0.10% + 0.20%).
// The account is in rupiah (RDN at BCA, https://www.hei5.id/faq), so there
// is no FX leg. The book comes from spreads/ (spreads/idx-touch.mjs); a
// missing book stays missing. The sums are in ../stockbit/idxCost.mjs.
//
//   node brokers/pancaglobal/pancaglobal_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Panca Global Sekuritas",
  folder: "pancaglobal",
  catalogueUrl: new URL("pancaglobal-parsed.json", import.meta.url),
  url: "https://www.hei5.id/product",
  readOn: "2026-10-26",
  buy: pct("0.10"),
  sell: pct("0.20"),
  basis: "compte Hei5, ordre en ligne, taux « all in »",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
