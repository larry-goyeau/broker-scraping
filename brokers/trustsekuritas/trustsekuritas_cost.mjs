// What one round trip costs at Trust Sekuritas through its PINA Trade app:
// buy n shares (or ETF units) on the Indonesia Stock Exchange, sell them
// back at once, in dollars. The online PINA Trade account (app and web).
//
// https://www.pinatrade.id/ read on 2026-10-26, FAQ "Berapa transaction
// fee di PINA Trade?":
//   "transaction fee yang kompetitif, yaitu buy fee 0,15% dan sell fee
//   0,25% tanpa ada biaya tambahan setiap bulan"
//     buy online     0.15% of the fill
//     sell online    0.25% of the fill
// Read as all-in: broker fee, VAT and the 0.0433% levy, and on the sell
// the 0.1% final income tax (the sell is the buy plus 0.10 points), as
// bni, indopremier, cgsid and fac read their own pages. "Tanpa ada biaya
// tambahan setiap bulan": no monthly charge. No floor, no other ETF rate
// and no e-Meterai are printed, so an ETF unit takes these two figures and
// no stamp is added, as in the other IDX files.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs); a missing book stays missing. The
// sums are in ../stockbit/idxCost.mjs.
//
//   node brokers/trustsekuritas/trustsekuritas_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Trust Sekuritas",
  folder: "trustsekuritas",
  catalogueUrl: new URL("trustsekuritas-parsed.json", import.meta.url),
  url: "https://www.pinatrade.id/",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte PINA Trade, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
