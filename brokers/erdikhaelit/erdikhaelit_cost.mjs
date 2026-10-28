// What one round trip costs at Erdikha Elit Sekuritas through ELIT Online
// Trading (Smart Order desktop, web and mobile): buy n shares (or ETF
// units) on the Indonesia Stock Exchange, sell them back at once, in
// dollars.
//
// https://www.erdikha.com/FAQ read on 2026-10-26:
//   "Berapa fee jual dan fee beli Erdikha Elit Sekuritas? Untuk fee beli
//   sebesar 0,15% dan untuk fee jual sebesar 0,25%"
//     buy            0.15% of the fill
//     sell           0.25% of the fill
//   "Apakah ada biaya seperti biaya admin bulanan atau biaya market info?
//   Tidak ada": no monthly admin or market-data fee.
// Read as all-in: broker fee, VAT and the 0.0433% levy, and on the sell
// the 0.1% final income tax (the sell is the buy plus 0.10 points), as
// bni, indopremier, cgsid and fac read their own pages. No floor, no other
// ETF rate and no e-Meterai are printed, so an ETF unit takes these two
// figures and no stamp is added, as in the other IDX files. Bank charges
// on a top-up from another bank are the bank's, not this trip.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDN at BCA online), so there is no FX leg. The
// book comes from spreads/ (spreads/idx-touch.mjs); a missing book stays
// missing. The sums are in ../stockbit/idxCost.mjs.
//
//   node brokers/erdikhaelit/erdikhaelit_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Erdikha Elit Sekuritas",
  folder: "erdikhaelit",
  catalogueUrl: new URL("erdikhaelit-parsed.json", import.meta.url),
  url: "https://www.erdikha.com/FAQ",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte ELIT, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
