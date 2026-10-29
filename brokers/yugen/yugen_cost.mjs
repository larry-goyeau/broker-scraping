// What one round trip costs at Yugen Bertumbuh Sekuritas through Yugen
// Online Trading: buy n shares (or ETF units) on the Indonesia Stock
// Exchange through Yugen Online Trading, sell them back at once, in
// dollars.
//
// https://www.yugen.co.id/documents/files/docs/YBS%20RIPLAY.pdf
// read on 2026-10-28:
//   RIPLAY: "Online Trading Beli: 0.15% Jual: 0.25%"; through sales
//   0.25% / 0.35%, not priced here.
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
//   node brokers/yugen/yugen_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Yugen",
  folder: "yugen",
  catalogueUrl: new URL("yugen-parsed.json", import.meta.url),
  url: "https://www.yugen.co.id/documents/files/docs/YBS%20RIPLAY.pdf",
  readOn: "2026-10-28",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "Yugen Online Trading, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
