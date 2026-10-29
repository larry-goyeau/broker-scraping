// What one round trip costs at Growin' (PT Mandiri Sekuritas): buy n
// shares (or ETF units) on the Indonesia Stock Exchange in the Growin' app
// or website, sell them back at once, in dollars.
//
// https://www.mandirisekuritas.co.id/id/siaran-pers-artikel/artikel/Fee-Mandiri-Sekuritas-Apakah-Termurah-di-Indonesia
// read on 2026-10-28:
//   "Biaya beli saham ditetapkan sebesar 0,18% dari nilai transaksi,
//   sedangkan biaya jual saham sebesar 0,28%"
// Read as all-in (broker fee, VAT, the 0.0433% levy, and on the sell the
// 0.1% final income tax: the sell is the buy plus 0.10 points), as bni,
// indopremier, cgsid and fac read their own pages. No floor, no other ETF
// rate and no e-Meterai are printed, so none is added.
//
// fees = notional x (0.18% + 0.28%).
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs). The sums are in
// ../stockbit/idxCost.mjs.
//
//   node brokers/growin/growin_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Growin'",
  folder: "growin",
  catalogueUrl: new URL("growin-parsed.json", import.meta.url),
  url: "https://www.mandirisekuritas.co.id/id/siaran-pers-artikel/artikel/Fee-Mandiri-Sekuritas-Apakah-Termurah-di-Indonesia",
  readOn: "2026-10-28",
  buy: pct("0.18"),
  sell: pct("0.28"),
  basis: "appli Growin', ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
