// What one round trip costs at INA Sekuritas Indonesia through UNO: buy n
// shares (or ETF units) on the Indonesia Stock Exchange in the UNO app,
// sell them back at once, in dollars.
//
// https://uno.inasekuritas.com/
// read on 2026-10-28:
//   the "Biaya Transaksi" block: "Beli: 0,15%", "Jual: 0,25%", "Sudah
//   termasuk biaya broker, BEI, KPEI, KSEI, PPN dan PPh".
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
//   node brokers/inasekuritas/inasekuritas_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "UNO",
  folder: "inasekuritas",
  catalogueUrl: new URL("inasekuritas-parsed.json", import.meta.url),
  url: "https://uno.inasekuritas.com/",
  readOn: "2026-10-28",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "appli UNO, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
