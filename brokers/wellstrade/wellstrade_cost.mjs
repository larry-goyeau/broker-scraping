// What one round trip costs at WellsTrade (Wells Fargo Advisors' online
// brokerage, Wells Fargo Clearing Services, LLC): buy n shares at price p,
// sell them straight back, online, in dollars. US-listed stocks, ETFs and
// ETNs in a self-directed cash account. Options, funds and bonds stay out.
//
// Fee page read in full 2026-10-26:
//   https://www.wellsfargoadvisors.com/services/online/fees-expanded.htm
//
//   stocks and ETFs, online or automated phone   "$0"
//   agent-assisted                                "$25" (not this trip: online only)
//   Processing Fee                                "Varies", "used to offset certain fees that
//                                                 are charged to Wells Fargo Advisors by
//                                                 self-regulatory organizations"; the fee
//                                                 table also lists "SEC Fee — Varies — Per
//                                                 transaction". SEC at the SEC's rate, rounded
//                                                 up to the cent (no rate or rounding printed);
//                                                 TAF and CAT not named, 0
//   ADR fee pass-through                          "Varies per security": custody, not this trip
//   outgoing account transfer $49.95, wires       not on an order
//
// Formula: book (quoted NBBO × shares) + $0 + SEC on the sale.
//
// Routing: Wells Fargo Clearing Services, LLC (CRD 19616) files its own 606
// (FINRA 606 bulk 2026 Q2, 19616_606_NMS_2026_Q2_WELS). Key
// `wellsfargoclearing` in spreads/rule606.mjs: the book is the blended 605 ×
// that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/wellstrade/wellstrade_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/wellstrade/wellstrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "./usCost.mjs";

const SCHEDULE = {
  broker: "WellsTrade",
  folder: "wellstrade",
  catalogueUrl: new URL("wellstrade-parsed.json", import.meta.url),
  url: "https://www.wellsfargoadvisors.com/services/online/fees-expanded.htm",
  readOn: "2026-10-26",
  entity: "Wells Fargo Clearing Services, LLC",
  crd606: "19616",
  rule606: "wellsfargoclearing",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: false, cat: false },
  basis:
    "barème WellsTrade (fees-expanded.htm), relu le 2026-10-26 : 0 $ par ordre d'actions ou d'ETF en ligne, " +
    "à l'achat comme à la vente",
  notes: [
    "« Processing Fee » imprimée « Varies » pour compenser les frais des SRO, sans taux : comptée 0",
    "606 de Wells Fargo Clearing Services (CRD 19616), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
