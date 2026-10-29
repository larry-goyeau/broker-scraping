// What one round trip costs at Harita Kencana Sekuritas (PT Harita Kencana
// Sekuritas): buy n shares (or ETF units) on the Indonesia Stock Exchange
// through HKS Online, sell them back at once, in dollars.
//
// https://harita-sekuritas.co.id/simulasi-biaya
// read on 2026-10-29:
//   The FAQ sends the client to the fee simulator, the only rate the
//   broker prints: "Komisi Broker (0.15%)" on both sides, "PPh (0.1%)"
//   on the sell, "Minimum Fee (Rp)" 0, and nothing else added. So
//   0.15% to buy and 0.25% to sell, all in.
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
//   node brokers/haritakencana/haritakencana_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Harita Kencana",
  folder: "haritakencana",
  catalogueUrl: new URL("haritakencana-parsed.json", import.meta.url),
  url: "https://harita-sekuritas.co.id/simulasi-biaya",
  readOn: "2026-10-29",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "HKS Online, taux du simulateur de frais",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
