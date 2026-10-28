// What one round trip costs at YB Sekuritas (PT Yakin Bertumbuh Sekuritas)
// through its JOIN online trading: buy n shares (or ETF units) on the
// Indonesia Stock Exchange, sell them back at once, in dollars.
//
// https://www.yb.co.id/faq read on 2026-10-26, "Berapa besar fee transaksi
// jual dan beli di YB SEKURITAS?":
//   "Melalui Online Trading: Fee beli: 0.151% Fee jual: 0.251%"
//   "Melalui Sales/Dealer: Fee beli: 0.201% Fee jual: 0.301%"
//     buy online     0.151% of the fill
//     sell online    0.251% of the fill
// Only the online figures count; sales/dealer orders (and GTC Smart
// Orders, billed at the dealer fee) are not priced here. Read as all-in:
// broker fee, VAT and the 0.0433% levy, and on the sell the 0.1% final
// income tax (the sell is the buy plus 0.10 points), as bni, indopremier,
// cgsid and fac read their own pages. "Tidak ada biaya market info
// (Datafeed)". No floor, no other ETF rate and no e-Meterai are printed,
// so an ETF unit takes these two figures and no stamp is added, as in the
// other IDX files.
// Left out: the safekeeping fee for inactive accounts, the 0.195% a day
// late-settlement penalty, Rp 22,000 per share transfer or negotiated OTC
// line and Rp 15,000 per right/warrant exercise. None is part of a regular
// market trip.
//
// fees = notional x (0.151% + 0.251%).
// The account is in rupiah (RDN at BCA or BRI), so there is no FX leg. The
// book comes from spreads/ (spreads/idx-touch.mjs); a missing book stays
// missing. The sums are in ../stockbit/idxCost.mjs.
//
//   node brokers/ybsekuritasyakin/ybsekuritasyakin_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "YB Sekuritas",
  folder: "ybsekuritasyakin",
  catalogueUrl: new URL("ybsekuritasyakin-parsed.json", import.meta.url),
  url: "https://www.yb.co.id/faq",
  readOn: "2026-10-26",
  buy: pct("0.151"),
  sell: pct("0.251"),
  basis: "compte JOIN, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
